import { Router } from "express";
import { z } from "zod";
import { COST_RATES, PLANS } from "@fable/shared";
import type { CostEstimate, PlanTier } from "@fable/shared";
import { env } from "../../config/env";
import { notFound } from "../../lib/errors";
import { createLogger } from "../../lib/logger";
import { prisma } from "../../lib/prisma";
import { handler, ok } from "../../lib/respond";
import { validateBody } from "../../middleware/validate";
import { getUsage } from "../../services/ai";
import { constructWebhookEvent, createCheckout, createPortal } from "../../services/stripe";

const log = createLogger("billing");
const router = Router();

const PLAN_TIERS = ["starter", "studio", "agency"] as const satisfies readonly PlanTier[];

function asPlan(value: unknown): PlanTier | null {
  return typeof value === "string" && (PLAN_TIERS as readonly string[]).includes(value)
    ? (value as PlanTier)
    : null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Tolerantly pull a URL out of whatever shape the stripe service returns. */
function extractUrl(result: unknown): string | null {
  if (typeof result === "string" && result.length > 0) return result;
  if (result && typeof result === "object" && "url" in result) {
    const url = (result as { url: unknown }).url;
    if (typeof url === "string" && url.length > 0) return url;
  }
  return null;
}

function safeAiTokens(): number {
  try {
    const tokens = getUsage();
    return typeof tokens === "number" && Number.isFinite(tokens) && tokens > 0 ? tokens : 0;
  } catch {
    return 0;
  }
}

function firstOfNextMonth(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth() + 1, 1);
}

// GET /billing — plan, usage, cost estimate, invoices, plan matrix.
router.get(
  "/",
  handler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) throw notFound("User");

    const plan = asPlan(user.plan) ?? "studio";
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const channels = await prisma.channel.findMany({
      where: { userId: user.id },
      select: { id: true },
    });
    const channelIds = channels.map((c) => c.id);

    const [videosThisMonth, renderAgg, storageAgg] = await Promise.all([
      prisma.video.count({
        where: { channelId: { in: channelIds }, createdAt: { gte: monthStart } },
      }),
      prisma.video.aggregate({
        _sum: { durationSec: true },
        where: { channelId: { in: channelIds }, createdAt: { gte: monthStart } },
      }),
      prisma.asset.aggregate({
        _sum: { sizeBytes: true },
        where: { userId: user.id },
      }),
    ]);

    const aiTokens = safeAiTokens();
    const storageBytes = storageAgg._sum.sizeBytes ?? 0;
    const usage = {
      videosThisMonth,
      aiTokensK: Math.round(aiTokens / 1000),
      channels: channelIds.length,
      storageMb: Math.round((storageBytes / (1024 * 1024)) * 10) / 10,
    };

    // Cost estimate for the month from COST_RATES × usage. When the AI usage
    // counter is cold (fresh process), estimate ~6k LLM tokens per video.
    const llmTokens = aiTokens > 0 ? aiTokens : videosThisMonth * 6000;
    const ttsChars = videosThisMonth * 520;
    const renderMinutes = round2((renderAgg._sum.durationSec ?? 0) / 60);
    const llmCostGbp = round2((llmTokens / 1000) * COST_RATES.llmPer1kTokensGbp);
    const ttsCostGbp = round2((ttsChars / 1000) * COST_RATES.ttsPer1kCharsGbp);
    const renderCostGbp = round2(renderMinutes * COST_RATES.renderPerMinuteGbp);
    const costEstimate: CostEstimate = {
      llmTokens,
      llmCostGbp,
      ttsChars,
      ttsCostGbp,
      renderMinutes,
      renderCostGbp,
      totalGbp: round2(llmCostGbp + ttsCostGbp + renderCostGbp),
    };

    // Mock invoices — last 3 calendar months at the current plan price, paid.
    const invoices = [0, 1, 2].map((monthsAgo) => {
      const issued = new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1);
      const label = issued.toLocaleString("en-GB", { month: "long", year: "numeric" });
      return {
        id: `INV-${issued.getFullYear()}-${String(issued.getMonth() + 1).padStart(2, "0")}`,
        date: issued.toISOString(),
        description: `${PLANS[plan].name} plan — ${label}`,
        amountGbp: PLANS[plan].priceGbp,
        status: "paid" as const,
      };
    });

    ok(res, {
      plan,
      planStatus: user.planStatus,
      renewsAt: (user.planRenewsAt ?? firstOfNextMonth(now)).toISOString(),
      usage,
      costEstimate,
      invoices,
      plans: PLANS,
    });
  }),
);

// POST /billing/checkout {plan} — Stripe checkout when configured, else instant mock upgrade.
router.post(
  "/checkout",
  validateBody(z.object({ plan: z.enum(PLAN_TIERS) })),
  handler(async (req, res) => {
    const plan = req.body.plan as PlanTier;
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) throw notFound("User");

    if (env.stripeSecretKey) {
      try {
        const url = extractUrl(await createCheckout(user, plan));
        if (url) {
          ok(res, { url, upgraded: false });
          return;
        }
      } catch (err) {
        log.warn(
          "stripe checkout failed — falling back to mock upgrade",
          err instanceof Error ? err.message : err,
        );
      }
    }

    const now = new Date();
    await prisma.user.update({
      where: { id: user.id },
      data: { plan, planStatus: "active", planRenewsAt: firstOfNextMonth(now) },
    });
    ok(res, { url: null, upgraded: true, plan });
  }),
);

// POST /billing/portal — Stripe billing portal when configured.
router.post(
  "/portal",
  handler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) throw notFound("User");

    if (env.stripeSecretKey) {
      try {
        const url = extractUrl(await createPortal(user));
        ok(res, { url });
        return;
      } catch (err) {
        log.warn("stripe portal failed", err instanceof Error ? err.message : err);
      }
    }
    ok(res, { url: null });
  }),
);

// POST /billing/stripe-webhook — mock-tolerant subscription event handler (dev path).
// Accepts JSON or a raw buffer; never rejects so Stripe retries don't pile up.
router.post(
  "/stripe-webhook",
  handler(async (req, res) => {
    // Only trust events Stripe actually signed. Without a configured webhook
    // secret + valid signature, we refuse to mutate any account — otherwise
    // anyone could POST {metadata:{userId}} and grant themselves a plan.
    if (!env.stripeSecretKey || !env.stripeWebhookSecret) {
      res.status(503).json({ ok: false, error: { code: "STRIPE_DISABLED", message: "Billing webhook not configured" } });
      return;
    }
    const signature = req.header("stripe-signature");
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(String(req.body ?? ""), "utf8");
    let event: Record<string, unknown>;
    try {
      event = (await constructWebhookEvent(rawBody, signature)) as unknown as Record<string, unknown>;
    } catch (err) {
      log.warn(`stripe webhook signature rejected: ${err instanceof Error ? err.message : err}`);
      res.status(400).json({ ok: false, error: { code: "BAD_SIGNATURE", message: "Invalid signature" } });
      return;
    }

    const type = typeof event.type === "string" ? event.type : "unknown";
    const data = (event.data ?? {}) as Record<string, unknown>;
    const object = (data.object ?? {}) as Record<string, unknown>;

    try {
      if (type === "checkout.session.completed") {
        const metadata = (object.metadata ?? {}) as Record<string, unknown>;
        const userId = typeof metadata.userId === "string" ? metadata.userId : null;
        const plan = asPlan(metadata.plan);
        const customerId = typeof object.customer === "string" ? object.customer : null;
        if (userId) {
          await prisma.user.updateMany({
            where: { id: userId },
            data: {
              ...(plan ? { plan } : {}),
              planStatus: "active",
              ...(customerId ? { stripeCustomerId: customerId } : {}),
            },
          });
          log.info(`checkout completed for user ${userId}${plan ? ` → ${plan}` : ""}`);
        }
      } else if (type === "customer.subscription.updated" || type === "customer.subscription.deleted") {
        const customerId = typeof object.customer === "string" ? object.customer : null;
        if (customerId) {
          const status =
            type === "customer.subscription.deleted"
              ? "cancelled"
              : typeof object.status === "string"
                ? object.status
                : "active";
          const periodEnd =
            typeof object.current_period_end === "number"
              ? new Date(object.current_period_end * 1000)
              : null;
          await prisma.user.updateMany({
            where: { stripeCustomerId: customerId },
            data: {
              planStatus: status,
              ...(periodEnd ? { planRenewsAt: periodEnd } : {}),
            },
          });
          log.info(`subscription ${type.split(".").pop()} for customer ${customerId}`);
        }
      }
    } catch (err) {
      log.warn("stripe webhook handling failed", err instanceof Error ? err.message : err);
    }

    ok(res, { received: true, type });
  }),
);

export default router;
