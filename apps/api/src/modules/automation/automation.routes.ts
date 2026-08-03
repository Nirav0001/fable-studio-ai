import { Router } from "express";
import { z } from "zod";
import { QUEUE_JOBS, WYR_THEMES, fnv1a, pick, safeJson, seededRandom } from "@fable/shared";
import type { ClipsConfig, Top5Config, WyrConfig } from "@fable/shared";
import { badRequest, notFound } from "../../lib/errors";
import { createLogger } from "../../lib/logger";
import { prisma } from "../../lib/prisma";
import { handler, ok } from "../../lib/respond";
import { validateBody } from "../../middleware/validate";
import { enqueue } from "../../queue/queue";

const log = createLogger("automation");
const router = Router();

/** Default source for clips/top5 automation runs when no sourceUrl is configured. */
const DEFAULT_DEMO_SOURCE = "https://www.youtube.com/watch?v=jNQXAC9IVRw";

interface AutomationConfig {
  videosPerDay: number;
  autoApprove: boolean;
  minViralScore: number;
  /** Themes this channel rotates through (empty/omitted = all themes). */
  themeRotation: string[];
  sourceUrl?: string;
}

const DEFAULT_CONFIG: AutomationConfig = {
  videosPerDay: 1,
  autoApprove: false,
  minViralScore: 55,
  themeRotation: [],
};

function resolveConfig(raw: string | null | undefined): AutomationConfig {
  return { ...DEFAULT_CONFIG, ...safeJson<Partial<AutomationConfig>>(raw ?? null, {}) };
}

function capitalize(s: string): string {
  return s.length > 0 ? s[0].toUpperCase() + s.slice(1) : s;
}

// GET /automation — one row per channel with its (possibly default) rule.
router.get(
  "/",
  handler(async (req, res) => {
    const channels = await prisma.channel.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: "asc" },
      include: { automation: true },
    });
    ok(
      res,
      channels.map((c) => ({
        channelId: c.id,
        channelName: c.name,
        channelType: c.type,
        enabled: c.automation?.enabled ?? false,
        config: resolveConfig(c.automation?.configJson),
        lastRunAt: c.automation?.lastRunAt?.toISOString() ?? null,
      })),
    );
  }),
);

const patchSchema = z.object({
  enabled: z.boolean().optional(),
  config: z
    .object({
      videosPerDay: z.number().int().min(1).max(12).optional(),
      autoApprove: z.boolean().optional(),
      minViralScore: z.number().min(0).max(100).optional(),
      themeRotation: z.array(z.string().min(1).max(30)).max(13).optional(),
      sourceUrl: z.string().url().optional(),
    })
    .optional(),
});

// PATCH /automation/:channelId — upsert the rule; config merges over existing.
router.patch(
  "/:channelId",
  validateBody(patchSchema),
  handler(async (req, res) => {
    const channel = await prisma.channel.findFirst({
      where: { id: req.params.channelId, userId: req.user!.id },
    });
    if (!channel) throw notFound("Channel");

    const body = req.body as z.infer<typeof patchSchema>;
    const existing = await prisma.automationRule.findUnique({
      where: { channelId: channel.id },
    });
    const mergedConfig: AutomationConfig = {
      ...resolveConfig(existing?.configJson),
      ...(body.config ?? {}),
    };
    const rule = await prisma.automationRule.upsert({
      where: { channelId: channel.id },
      create: {
        channelId: channel.id,
        enabled: body.enabled ?? false,
        configJson: JSON.stringify(mergedConfig),
      },
      update: {
        ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
        configJson: JSON.stringify(mergedConfig),
      },
    });
    ok(res, {
      channelId: channel.id,
      channelName: channel.name,
      channelType: channel.type,
      enabled: rule.enabled,
      config: mergedConfig,
      lastRunAt: rule.lastRunAt?.toISOString() ?? null,
    });
  }),
);

// POST /automation/run/:channelId — create a project from the rule config NOW + enqueue generation.
router.post(
  "/run/:channelId",
  handler(async (req, res) => {
    const channel = await prisma.channel.findFirst({
      where: { id: req.params.channelId, userId: req.user!.id },
    });
    if (!channel) throw notFound("Channel");

    const rule = await prisma.automationRule.findUnique({
      where: { channelId: channel.id },
    });
    const config = resolveConfig(rule?.configJson);
    const now = new Date();
    const dayOfYear = Math.floor(
      (now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86_400_000,
    );
    const dateLabel = now.toLocaleDateString("en-GB", { day: "numeric", month: "short" });

    let title: string;
    let projectConfig: WyrConfig | ClipsConfig | Top5Config;
    let sourceUrl: string | null = null;

    if (channel.type === "wyr") {
      // Seeded theme rotation — stable per channel per day, no Math.random.
      const rand = seededRandom(fnv1a(`${channel.id}:wyr:${now.getFullYear()}:${dayOfYear}`));
      const pool = config.themeRotation.length > 0 ? config.themeRotation : [...WYR_THEMES];
      const theme = pick(rand, pool);
      const wyr: WyrConfig = {
        difficulty: "medium",
        theme,
        lengthSec: 30,
        questionCount: 5,
      };
      projectConfig = wyr;
      title = `Would You Rather: ${capitalize(theme)} Edition`;
    } else if (channel.type === "clips") {
      sourceUrl = config.sourceUrl ?? DEFAULT_DEMO_SOURCE;
      const clips: ClipsConfig = {
        sourceUrl,
        clipCount: 10,
        minScore: Math.round(config.minViralScore),
        captionStyle: "beast",
        addMemes: true,
      };
      projectConfig = clips;
      title = `Auto Clips — ${dateLabel}`;
    } else if (channel.type === "top5") {
      sourceUrl = config.sourceUrl ?? DEFAULT_DEMO_SOURCE;
      const top5: Top5Config = {
        sourceUrl,
        countdownFrom: 5,
        captionStyle: "beast",
      };
      projectConfig = top5;
      title = `Top 5 Funniest Moments — ${dateLabel}`;
    } else {
      throw badRequest(`Channel type "${channel.type}" does not support automation`);
    }

    const project = await prisma.project.create({
      data: {
        channelId: channel.id,
        type: channel.type,
        title,
        status: "generating",
        stage: "queued",
        progress: 0,
        sourceUrl,
        configJson: JSON.stringify(projectConfig),
      },
    });

    await enqueue(QUEUE_JOBS.PROJECT_GENERATE, {
      projectId: project.id,
      channelId: channel.id,
    });

    await prisma.automationRule.upsert({
      where: { channelId: channel.id },
      create: {
        channelId: channel.id,
        enabled: rule?.enabled ?? false,
        configJson: JSON.stringify(config),
        lastRunAt: now,
      },
      update: { lastRunAt: now },
    });

    log.info(`automation run for channel ${channel.name} → project ${project.id}`);
    ok(res, { projectId: project.id });
  }),
);

export default router;
