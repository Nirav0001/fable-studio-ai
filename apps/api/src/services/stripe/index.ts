import type Stripe from "stripe";
import type { User } from "@prisma/client";
import { PLANS, fnv1a, safeJson, seededRandom } from "@fable/shared";
import type { PlanTier } from "@fable/shared";
import { env } from "../../config/env";
import { createLogger } from "../../lib/logger";
import { prisma } from "../../lib/prisma";

const log = createLogger("stripe");

export function isStripeEnabled(): boolean {
  return Boolean(env.stripeSecretKey);
}

let stripeClient: Stripe | null = null;

/** Lazily import + construct the Stripe SDK only when a key is configured. */
async function getStripe(): Promise<Stripe | null> {
  if (!isStripeEnabled()) return null;
  if (!stripeClient) {
    const mod = await import("stripe");
    stripeClient = new mod.default(env.stripeSecretKey);
  }
  return stripeClient;
}

function isPlanTier(value: unknown): value is PlanTier {
  return value === "starter" || value === "studio" || value === "agency";
}

async function ensureCustomer(stripe: Stripe, user: User): Promise<string> {
  if (user.stripeCustomerId) return user.stripeCustomerId;
  const customer = await stripe.customers.create({
    email: user.email,
    name: user.name,
    metadata: { userId: user.id },
  });
  await prisma.user.update({
    where: { id: user.id },
    data: { stripeCustomerId: customer.id },
  });
  return customer.id;
}

export interface CheckoutResult {
  url: string | null;
  upgraded: boolean;
}

/**
 * Create a Stripe Checkout session for a plan. Mock mode (no key) upgrades
 * the user directly and returns { url: null, upgraded: true }.
 */
export async function createCheckout(user: User, plan: PlanTier): Promise<CheckoutResult> {
  const stripe = await getStripe();
  if (!stripe) {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        plan,
        planStatus: "active",
        planRenewsAt: new Date(Date.now() + 30 * 86_400_000),
      },
    });
    log.info(`Mock upgrade: user ${user.id} → ${plan}`);
    return { url: null, upgraded: true };
  }

  const customerId = await ensureCustomer(stripe, user);
  const priceId = env.stripePrices[plan];
  const lineItem: Stripe.Checkout.SessionCreateParams.LineItem = priceId
    ? { price: priceId, quantity: 1 }
    : {
        quantity: 1,
        price_data: {
          currency: "gbp",
          unit_amount: PLANS[plan].priceGbp * 100,
          recurring: { interval: "month" },
          product_data: { name: `Fable Studio AI — ${PLANS[plan].name}` },
        },
      };

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [lineItem],
    success_url: `${env.appUrl}/billing?upgraded=1`,
    cancel_url: `${env.appUrl}/billing`,
    metadata: { userId: user.id, plan },
    subscription_data: { metadata: { userId: user.id, plan } },
  });
  return { url: session.url, upgraded: false };
}

/** Stripe billing portal session; { url: null } in mock mode. */
export async function createPortal(user: User): Promise<{ url: string | null }> {
  const stripe = await getStripe();
  if (!stripe || !user.stripeCustomerId) return { url: null };
  const session = await stripe.billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: `${env.appUrl}/billing`,
  });
  return { url: session.url };
}

// ── Webhooks ─────────────────────────────────────────────────────────────────

interface WebhookObjectShape {
  id?: string;
  customer?: string | { id?: string };
  status?: string;
  current_period_end?: number;
  metadata?: Record<string, string>;
}

interface WebhookEventShape {
  type?: string;
  data?: { object?: WebhookObjectShape };
}

/**
 * Verify + parse a webhook payload. With a webhook secret configured the
 * signature is enforced; otherwise the body is trusted (dev/mock mode).
 */
export async function constructWebhookEvent(
  rawBody: Buffer | string,
  signature: string | undefined,
): Promise<WebhookEventShape> {
  const stripe = await getStripe();
  if (stripe && env.stripeWebhookSecret && signature) {
    const event = stripe.webhooks.constructEvent(rawBody, signature, env.stripeWebhookSecret);
    return event as unknown as WebhookEventShape;
  }
  const text = typeof rawBody === "string" ? rawBody : rawBody.toString("utf8");
  return safeJson<WebhookEventShape>(text, {});
}

function customerIdOf(obj: WebhookObjectShape): string | null {
  if (typeof obj.customer === "string") return obj.customer;
  if (obj.customer && typeof obj.customer.id === "string") return obj.customer.id;
  return null;
}

async function findUserForEvent(obj: WebhookObjectShape): Promise<User | null> {
  const userId = obj.metadata?.userId;
  if (userId) {
    const byId = await prisma.user.findUnique({ where: { id: userId } });
    if (byId) return byId;
  }
  const customerId = customerIdOf(obj);
  if (customerId) {
    return prisma.user.findFirst({ where: { stripeCustomerId: customerId } });
  }
  return null;
}

/**
 * Handle subscription lifecycle events: keeps user.plan / planStatus /
 * planRenewsAt in sync. Unknown event types are acknowledged and ignored.
 */
export async function handleStripeWebhook(
  rawBody: Buffer | string,
  signature: string | undefined,
): Promise<{ received: true; type: string }> {
  const event = await constructWebhookEvent(rawBody, signature);
  const type = event.type ?? "unknown";
  const obj = event.data?.object ?? {};

  switch (type) {
    case "checkout.session.completed": {
      const user = await findUserForEvent(obj);
      const plan = obj.metadata?.plan;
      if (user && isPlanTier(plan)) {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            plan,
            planStatus: "active",
            planRenewsAt: new Date(Date.now() + 30 * 86_400_000),
          },
        });
        log.info(`Checkout completed: user ${user.id} → ${plan}`);
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const user = await findUserForEvent(obj);
      if (user) {
        const plan = obj.metadata?.plan;
        await prisma.user.update({
          where: { id: user.id },
          data: {
            ...(isPlanTier(plan) ? { plan } : {}),
            planStatus: obj.status === "active" || obj.status === "trialing" ? "active" : (obj.status ?? "active"),
            ...(obj.current_period_end
              ? { planRenewsAt: new Date(obj.current_period_end * 1000) }
              : {}),
          },
        });
        log.info(`Subscription ${type.split(".").pop()}: user ${user.id} (${obj.status ?? "?"})`);
      }
      break;
    }
    case "customer.subscription.deleted": {
      const user = await findUserForEvent(obj);
      if (user) {
        await prisma.user.update({
          where: { id: user.id },
          data: { plan: "starter", planStatus: "cancelled", planRenewsAt: null },
        });
        log.info(`Subscription cancelled: user ${user.id} downgraded to starter`);
      }
      break;
    }
    default:
      log.debug(`Ignoring stripe event type ${type}`);
  }
  return { received: true, type };
}

// ── Invoices ─────────────────────────────────────────────────────────────────

export interface InvoiceInfo {
  id: string;
  number: string;
  amountGbp: number;
  status: string;
  date: string;
  url: string | null;
}

/**
 * Recent invoices: real from Stripe when configured, otherwise 3 deterministic
 * mock invoices (seeded per user) for the current plan price.
 */
export async function listInvoices(user: User, limit = 3): Promise<InvoiceInfo[]> {
  const stripe = await getStripe();
  if (stripe && user.stripeCustomerId) {
    const invoices = await stripe.invoices.list({ customer: user.stripeCustomerId, limit });
    return invoices.data.map((inv) => ({
      id: inv.id,
      number: inv.number ?? inv.id,
      amountGbp: (inv.total ?? 0) / 100,
      status: inv.status ?? "paid",
      date: new Date(inv.created * 1000).toISOString(),
      url: inv.hosted_invoice_url ?? null,
    }));
  }

  const plan: PlanTier = isPlanTier(user.plan) ? user.plan : "studio";
  const amount = PLANS[plan].priceGbp;
  const rand = seededRandom(fnv1a(`invoices:${user.id}`));
  const now = new Date();
  const result: InvoiceInfo[] = [];
  for (let i = 1; i <= limit; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 3, 9, 0, 0);
    const suffix = Math.floor(rand() * 90_000 + 10_000);
    result.push({
      id: `in_mock_${fnv1a(`${user.id}:${i}`).toString(36)}`,
      number: `FAB-${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}-${suffix}`,
      amountGbp: amount,
      status: "paid",
      date: date.toISOString(),
      url: null,
    });
  }
  return result;
}
