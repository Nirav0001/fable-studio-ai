// ── /api/v1/ai — direct AI toolbox endpoints ─────────────────────────────────
// All routes sit behind aiLimiter. Every generator is mock-first: works with
// zero keys via deterministic fallbacks, upgrades transparently when a
// provider key is configured.

import { Router } from "express";
import { z } from "zod";
import type { TrendItem } from "@fable/shared";
import { WYR_THEMES, clamp, fnv1a, seededRandom } from "@fable/shared";
import { notFound } from "../../lib/errors";
import { prisma } from "../../lib/prisma";
import { handler, ok } from "../../lib/respond";
import { aiLimiter } from "../../middleware/rateLimit";
import { validateBody } from "../../middleware/validate";
import { createLogger } from "../../lib/logger";
import { aiCompleteJson, isMockAi } from "../../services/ai";
import { generateHooks, generateSeoPack, generateTitleIdeas } from "../../services/generators/seo";
import { generateThumbnailVariants } from "../../services/generators/thumbs";
import { scoreVirality } from "../../services/generators/viral";
import { generateWyrQuestions } from "../../services/generators/wyr";

const log = createLogger("ai.routes");
const router = Router();
router.use(aiLimiter);

const channelTypeSchema = z.enum(["wyr", "clips", "top5"]).optional();

// ── POST /ai/titles ──────────────────────────────────────────────────────────

const titlesSchema = z.object({
  topic: z.string().trim().min(2).max(160),
  count: z.number().int().min(1).max(25).default(10),
  channelType: channelTypeSchema,
});

router.post(
  "/titles",
  validateBody(titlesSchema),
  handler(async (req, res) => {
    const { topic, count, channelType } = req.body as z.infer<typeof titlesSchema>;
    ok(res, await generateTitleIdeas(topic, count, channelType));
  }),
);

// ── POST /ai/seo ─────────────────────────────────────────────────────────────

const seoSchema = z.object({
  title: z.string().trim().min(2).max(200),
  context: z.string().max(2000).optional(),
  channelType: channelTypeSchema,
});

router.post(
  "/seo",
  validateBody(seoSchema),
  handler(async (req, res) => {
    const { title, context, channelType } = req.body as z.infer<typeof seoSchema>;
    ok(res, await generateSeoPack({ title, context, channelType }));
  }),
);

// ── POST /ai/hooks ───────────────────────────────────────────────────────────

const hooksSchema = z.object({
  topic: z.string().trim().min(2).max(160),
  count: z.number().int().min(1).max(20).default(8),
});

router.post(
  "/hooks",
  validateBody(hooksSchema),
  handler(async (req, res) => {
    const { topic, count } = req.body as z.infer<typeof hooksSchema>;
    ok(res, { hooks: await generateHooks(topic, count) });
  }),
);

// ── POST /ai/viral-score ─────────────────────────────────────────────────────

const viralSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(5000).optional(),
  channelType: channelTypeSchema,
  durationSec: z.number().positive().max(600).optional(),
});

router.post(
  "/viral-score",
  validateBody(viralSchema),
  handler(async (req, res) => {
    const body = req.body as z.infer<typeof viralSchema>;
    ok(res, await scoreVirality(body));
  }),
);

// ── POST /ai/wyr-questions ───────────────────────────────────────────────────

const wyrSchema = z.object({
  channelId: z.string().min(1),
  theme: z.string().trim().min(2).max(40),
  difficulty: z.enum(["easy", "medium", "hard", "impossible"]),
  count: z.number().int().min(1).max(20),
});

router.post(
  "/wyr-questions",
  validateBody(wyrSchema),
  handler(async (req, res) => {
    const { channelId, theme, difficulty, count } = req.body as z.infer<typeof wyrSchema>;
    const channel = await prisma.channel.findFirst({
      where: { id: channelId, userId: req.user!.id },
      select: { id: true },
    });
    if (!channel) throw notFound("Channel");
    ok(res, await generateWyrQuestions(req.user!.id, channelId, theme, difficulty, count));
  }),
);

// ── POST /ai/thumbnails ──────────────────────────────────────────────────────

const thumbsSchema = z.object({
  title: z.string().trim().min(2).max(200),
  channelType: channelTypeSchema,
  count: z.number().int().min(1).max(8).default(4),
});

router.post(
  "/thumbnails",
  validateBody(thumbsSchema),
  handler(async (req, res) => {
    const { title, channelType, count } = req.body as z.infer<typeof thumbsSchema>;
    ok(res, await generateThumbnailVariants({ title, channelType, count }));
  }),
);

// ── GET /ai/trends ───────────────────────────────────────────────────────────

const TREND_POOL: Omit<TrendItem, "momentum">[] = [
  { topic: "Impossible money choices", format: "wyr", why: "Finance hypotheticals are spiking with the cost-of-living discourse", suggestedHook: "£1M now... or is it a trap?", sound: "suspense-riser" },
  { topic: "1 HP clutch moments", format: "clips", why: "Clutch compilations are the most-shared gaming format this month", suggestedHook: "One HP. Zero fear.", sound: "heartbeat-bass" },
  { topic: "Streamer rage quits", format: "clips", why: "Rage content spikes every ranked-season reset", suggestedHook: "He lasted 14 seconds.", sound: "breakcore-loop" },
  { topic: "Food would-you-rathers", format: "wyr", why: "Food debates drive the highest comment rates of any WYR theme", suggestedHook: "Pizza or chocolate. Forever.", sound: "kitchen-pop" },
  { topic: "Top 5 wholesome donations", format: "top5", why: "Wholesome countdowns are outperforming pure comedy in retention", suggestedHook: "Number 1 made him cry.", sound: "soft-piano" },
  { topic: "Superpower trade-offs", format: "wyr", why: "'Cursed superpowers' is trending across all quiz formats", suggestedHook: "Fly... but you scream the whole time.", sound: "hero-synth" },
  { topic: "Chat vs streamer chaos", format: "clips", why: "Chat-controlled moments feel interactive and get re-watched", suggestedHook: "Chat made him do it.", sound: "glitch-hop" },
  { topic: "Top 5 sniper miracles", format: "top5", why: "Trick-shot countdowns surge on highlight-reel weekends", suggestedHook: "#1 is cross-map. Blindfolded (almost).", sound: "phonk-drift" },
  { topic: "School would-you-rathers", format: "wyr", why: "Back-to-term cycle pushes school content to teen feeds", suggestedHook: "Your teacher reads your texts. Aloud.", sound: "classroom-lofi" },
  { topic: "Speedrun fails", format: "clips", why: "Fail-run clips convert non-gamers — broad appeal spike", suggestedHook: "World record attempt. Wall: 1, Him: 0.", sound: "circus-remix" },
  { topic: "Luxury vs logic choices", format: "wyr", why: "Flex-vs-function debates are fuelling duet responses", suggestedHook: "Diamond phone case or infinite battery?", sound: "rich-strings" },
  { topic: "Top 5 keyboard rage", format: "top5", why: "Peripheral-abuse compilations are an evergreen laugh format", suggestedHook: "RIP to 5 keyboards.", sound: "metal-boom" },
  { topic: "Animal hypotheticals", format: "wyr", why: "The horse-sized duck debate resurfaces every few months — it's back", suggestedHook: "100 duck-sized horses. Go.", sound: "safari-beat" },
  { topic: "Wholesome cat cameos", format: "clips", why: "Pets interrupting streams reliably crosses into mainstream feeds", suggestedHook: "The cat has seen too much.", sound: "cozy-keys" },
  { topic: "Top 5 teammate betrayals", format: "top5", why: "Betrayal countdowns spark the most heated comment debates", suggestedHook: "He SOLD the bomb.", sound: "villain-cello" },
  { topic: "Time-travel dilemmas", format: "wyr", why: "Sci-fi hypotheticals are pulling older demos into Shorts", suggestedHook: "Past you won't listen. You know you.", sound: "retro-wave" },
  { topic: "Mic muted disasters", format: "clips", why: "Hot-mic moments are the highest-CTR clip thumbnail archetype", suggestedHook: "The mic was NOT muted.", sound: "record-scratch" },
  { topic: "Top 5 chat one-liners", format: "top5", why: "Text-on-screen humour performs with sound-off viewers", suggestedHook: "#2 should be studied.", sound: "typewriter-tap" },
];

function deterministicTrends(): TrendItem[] {
  // Rotate weekly: same list all week, fresh list every Monday-ish boundary.
  const week = Math.floor(Date.now() / (7 * 86_400_000));
  const rand = seededRandom(fnv1a(`trends:${week}`) || 1);

  const shuffled = [...TREND_POOL];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const count = 8 + Math.floor(rand() * 5); // 8-12
  const items = shuffled.slice(0, count).map((item) => ({
    ...item,
    momentum: clamp(Math.round(55 + rand() * 42), 0, 100),
  }));
  items.sort((a, b) => b.momentum - a.momentum);
  return items;
}

interface AiTrendShape {
  trends?: {
    topic?: unknown;
    format?: unknown;
    momentum?: unknown;
    why?: unknown;
    suggestedHook?: unknown;
    sound?: unknown;
  }[];
}

router.get(
  "/trends",
  handler(async (_req, res) => {
    const fallback = deterministicTrends().filter((t) => t.format === "wyr");
    if (isMockAi()) {
      ok(res, fallback);
      return;
    }
    try {
      const ai = await aiCompleteJson<AiTrendShape>({
        system:
          "You are a YouTube Shorts trend analyst for faceless would-you-rather quiz channels. Every trend must be a would-you-rather angle (format 'wyr').",
        prompt: `List 10 currently-hot would-you-rather Shorts trends. JSON: {"trends":[{"topic":"...","format":"wyr","momentum":<0-100>,"why":"one sentence","suggestedHook":"opening line","sound":"sound style"}]}. Themes available: ${WYR_THEMES.join(", ")}.`,
        maxTokens: 1200,
      });
      const list = Array.isArray(ai.trends) ? ai.trends : [];
      const items: TrendItem[] = [];
      for (const t of list) {
        if (typeof t.topic !== "string" || !t.topic.trim()) continue;
        items.push({
          topic: t.topic.trim(),
          format: typeof t.format === "string" && t.format.trim() ? t.format.trim() : "clips",
          momentum: clamp(Math.round(Number(t.momentum)) || 60, 0, 100),
          why: typeof t.why === "string" ? t.why.trim() : "Rising across Shorts feeds this week",
          suggestedHook:
            typeof t.suggestedHook === "string" && t.suggestedHook.trim()
              ? t.suggestedHook.trim()
              : "You need to see this.",
          sound: typeof t.sound === "string" && t.sound.trim() ? t.sound.trim() : undefined,
        });
      }
      if (items.length < 8) {
        ok(res, fallback);
        return;
      }
      items.sort((a, b) => b.momentum - a.momentum);
      ok(res, items.slice(0, 12));
    } catch (err) {
      log.warn(
        `AI trends failed — serving curated rotation: ${err instanceof Error ? err.message : String(err)}`,
      );
      ok(res, fallback);
    }
  }),
);

export default router;
