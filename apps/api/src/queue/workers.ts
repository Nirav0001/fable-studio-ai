import { Worker } from "bullmq";
import type { Channel } from "@prisma/client";
import {
  QUEUE_JOBS,
  SHORT_LENGTHS,
  WYR_DIFFICULTIES,
  WYR_THEMES,
  fnv1a,
  pick,
  safeJson,
  seededRandom,
} from "@fable/shared";
import type { WyrConfig, WyrDifficulty } from "@fable/shared";
import { createLogger } from "../lib/logger";
import { prisma } from "../lib/prisma";
import {
  QUEUE_NAME,
  createRedisConnection,
  enqueue,
  getProcessor,
  getQueueDriverName,
  registerProcessor,
  updateJob,
} from "./queue";
import {
  refreshChannelIdentity,
  syncAnalytics,
  syncVideoStats,
} from "../services/youtube";
import type { JobPayload } from "./queue";
import { BATCH_STAGE } from "../lib/batch";
import { processGenerate } from "./processors/generate";
import { processRender } from "./processors/render";
import { processUpload } from "./processors/upload";

const log = createLogger("workers");

let started = false;
const runningTicks = new Set<string>();

async function runSafely(name: string, fn: () => Promise<void>): Promise<void> {
  if (runningTicks.has(name)) return;
  runningTicks.add(name);
  try {
    await fn();
  } catch (err) {
    log.error(`${name} failed: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    runningTicks.delete(name);
  }
}

/**
 * Register processors, start the BullMQ worker (when Redis is configured) and
 * kick off the two interval scanners: due schedule slots + automation rules.
 */
export async function startWorkers(): Promise<void> {
  if (started) return;
  started = true;

  registerProcessor(QUEUE_JOBS.PROJECT_GENERATE, processGenerate);
  registerProcessor(QUEUE_JOBS.PROJECT_RENDER, processRender);
  registerProcessor(QUEUE_JOBS.VIDEO_UPLOAD, processUpload);

  if (getQueueDriverName() === "bullmq") {
    const worker = new Worker(
      QUEUE_NAME,
      async (job) => {
        const fn = getProcessor(job.name);
        if (!fn) throw new Error(`No processor registered for job "${job.name}"`);
        await fn((job.data ?? {}) as JobPayload);
      },
      { connection: createRedisConnection(), concurrency: 2 },
    );
    worker.on("failed", (job, err) => {
      log.error(`Job ${job?.name ?? "?"} failed: ${err.message}`);
      const data = (job?.data ?? {}) as JobPayload;
      if (typeof data.jobId === "string" && data.jobId) {
        void updateJob(data.jobId, {
          status: "failed",
          message: err.message,
          log: `Worker failure: ${err.message}`,
        });
      }
    });
    worker.on("error", (err) => log.warn(`Worker error: ${err.message}`));
  }

  const slotTimer = setInterval(() => void runSafely("slot-scan", scanDueSlots), 60_000);
  slotTimer.unref();
  // Drains bulk-queued projects one at a time (see batchTick).
  const batchTimer = setInterval(() => void runSafely("batch-tick", batchTick), 20_000);
  batchTimer.unref();
  const automationTimer = setInterval(
    () => void runSafely("automation-tick", automationTick),
    5 * 60_000,
  );
  automationTimer.unref();

  // Real statistics: refresh subs + per-video views/likes/comments + daily
  // channel analytics for every connected channel — 30s after boot, then
  // every 30 minutes (Data API cost: ~2 units per channel per pass).
  const statsTimer = setInterval(() => void runSafely("stats-sync", syncAllChannelStats), 30 * 60_000);
  statsTimer.unref();
  setTimeout(() => void runSafely("stats-sync-boot", syncAllChannelStats), 30_000).unref();

  log.info(`Workers started (driver=${getQueueDriverName()})`);
}

// ── Real YouTube stats sync (every 30 min) ───────────────────────────────────

async function syncAllChannelStats(): Promise<void> {
  const channels = await prisma.channel.findMany({ where: { connected: true } });
  for (const channel of channels) {
    try {
      await refreshChannelIdentity(channel);
      const videoStats = await syncVideoStats(channel);
      const daily = await syncAnalytics(channel).catch((err) => {
        log.warn(
          `Daily analytics sync failed for ${channel.name}: ${err instanceof Error ? err.message : String(err)}`,
        );
        return { synced: 0, mock: false };
      });
      if (!videoStats.mock) {
        log.info(
          `Stats sync ${channel.name}: ${videoStats.synced} video(s), ${daily.synced} analytics day(s)`,
        );
      }
    } catch (err) {
      log.warn(
        `Stats sync failed for ${channel.name}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

// ── Bulk batch drain (every 20s) ─────────────────────────────────────────────

/**
 * Release ONE bulk-queued project at a time.
 *
 * A single WYR render opens ~35 ffmpeg inputs; the container's cgroup caps
 * total threads, so concurrent renders exhaust it and every one fails. Strict
 * serialisation is therefore a correctness requirement, not a nicety: nothing
 * new starts until the generate/render pipeline is idle.
 */
/** A generate+render cycle takes ~2 min; anything older is orphaned. */
const STALE_JOB_MS = 20 * 60_000;

async function batchTick(): Promise<void> {
  // The in-memory queue dies with the process, so a restart mid-job leaves
  // JobRecords pinned at "active" forever. Those would make the batch look
  // permanently busy and stall it, so reap them first.
  const staleBefore = new Date(Date.now() - STALE_JOB_MS);
  const reaped = await prisma.jobRecord.updateMany({
    where: { status: { in: ["queued", "active"] }, createdAt: { lt: staleBefore } },
    data: {
      status: "failed",
      message: "Abandoned — the worker restarted before this job finished",
      finishedAt: new Date(),
    },
  });
  if (reaped.count > 0) log.warn(`Reaped ${reaped.count} orphaned job(s)`);

  const busy = await prisma.jobRecord.count({
    where: {
      name: { in: [QUEUE_JOBS.PROJECT_GENERATE, QUEUE_JOBS.PROJECT_RENDER] },
      status: { in: ["queued", "active"] },
      createdAt: { gte: staleBefore },
    },
  });
  if (busy > 0) return;

  const next = await prisma.project.findFirst({
    where: { stage: BATCH_STAGE },
    orderBy: { createdAt: "asc" },
  });
  if (!next) return;

  // Claim it first so a concurrent tick can't release the same project twice.
  const claimed = await prisma.project.updateMany({
    where: { id: next.id, stage: BATCH_STAGE },
    data: { stage: "queued", status: "generating" },
  });
  if (claimed.count !== 1) return;

  await enqueue(QUEUE_JOBS.PROJECT_GENERATE, {
    projectId: next.id,
    channelId: next.channelId,
  });
  const remaining = await prisma.project.count({ where: { stage: BATCH_STAGE } });
  log.info(`Batch: released project ${next.id} (${remaining} still queued)`);
}

// ── Due schedule slots → enqueue uploads (every 60s) ─────────────────────────

async function scanDueSlots(): Promise<void> {
  const due = await prisma.scheduleSlot.findMany({
    where: {
      status: "scheduled",
      scheduledAt: { lte: new Date() },
      videoId: { not: null },
    },
    take: 25,
    orderBy: { scheduledAt: "asc" },
  });

  for (const slot of due) {
    if (!slot.videoId) continue;
    // Claim the slot first (status -> queued) so a concurrent scan can never
    // enqueue the same slot twice.
    const claimed = await prisma.scheduleSlot.updateMany({
      where: { id: slot.id, status: "scheduled" },
      data: { status: "queued" },
    });
    if (claimed.count !== 1) continue;
    await enqueue(QUEUE_JOBS.VIDEO_UPLOAD, {
      videoId: slot.videoId,
      slotId: slot.id,
      channelId: slot.channelId,
    });
    log.info(`Slot ${slot.id} due — upload enqueued for video ${slot.videoId}`);
  }
}

// ── Automation tick (every 5 min) ────────────────────────────────────────────

interface AutomationConfig {
  videosPerDay?: number;
  autoApprove?: boolean;
  minViralScore?: number;
  themeRotation?: string[];
  difficulty?: string;
  lengthSec?: number;
  questionCount?: number;
  sourceUrl?: string;
  clipCount?: number;
  minScore?: number;
}

async function automationTick(): Promise<void> {
  const rules = await prisma.automationRule.findMany({
    where: { enabled: true },
    include: { channel: true },
  });
  if (rules.length === 0) return;

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  for (const rule of rules) {
    const cfg = safeJson<AutomationConfig>(rule.configJson, {});
    const perDay = Math.max(0, Math.floor(Number(cfg.videosPerDay ?? 1)));
    if (perDay <= 0) continue;

    const createdToday = await prisma.project.count({
      where: { channelId: rule.channelId, createdAt: { gte: startOfDay } },
    });
    if (createdToday >= perDay) continue;

    const project = await createAutomationProject(rule.channel, cfg, createdToday);
    await enqueue(QUEUE_JOBS.PROJECT_GENERATE, {
      projectId: project.id,
      channelId: rule.channelId,
    });
    await prisma.automationRule.update({
      where: { id: rule.id },
      data: { lastRunAt: now },
    });
    log.info(
      `Automation created project ${project.id} for channel ${rule.channel.name} (${createdToday + 1}/${perDay} today)`,
    );
  }
}

function capitalize(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}

/**
 * Minimal inline project creation for automation runs. Deliberately duplicates
 * the automation module's creation logic to avoid a circular module import —
 * kept to the smallest possible surface (type-specific config + title).
 */
async function createAutomationProject(
  channel: Channel,
  cfg: AutomationConfig,
  createdToday: number,
) {
  const now = new Date();
  const dateKey = now.toISOString().slice(0, 10);
  const rand = seededRandom(fnv1a(`auto:${channel.id}:${dateKey}:${createdToday}`));

  let title: string;
  let configJson: string;
  let sourceUrl: string | null = null;

  if (channel.type === "wyr") {
    const themes =
      Array.isArray(cfg.themeRotation) && cfg.themeRotation.length > 0
        ? cfg.themeRotation
        : [...WYR_THEMES];
    const theme = pick(rand, themes);
    const difficulty: WyrDifficulty = WYR_DIFFICULTIES.includes(cfg.difficulty as WyrDifficulty)
      ? (cfg.difficulty as WyrDifficulty)
      : "medium";
    const lengthSec = (SHORT_LENGTHS as readonly number[]).includes(Number(cfg.lengthSec))
      ? (Number(cfg.lengthSec) as WyrConfig["lengthSec"])
      : 30;
    const config: WyrConfig = {
      difficulty,
      theme,
      lengthSec,
      questionCount: Math.min(10, Math.max(3, Math.floor(Number(cfg.questionCount ?? 5)))),
    };
    title = `Would You Rather — ${capitalize(theme)} (auto ${dateKey})`;
    configJson = JSON.stringify(config);
  } else if (channel.type === "clips") {
    sourceUrl =
      cfg.sourceUrl && cfg.sourceUrl.length > 0
        ? cfg.sourceUrl
        : `https://www.youtube.com/watch?v=auto${dateKey.replace(/-/g, "")}`;
    const config = {
      sourceUrl,
      clipCount: [5, 10, 20].includes(Number(cfg.clipCount)) ? Number(cfg.clipCount) : 5,
      minScore: Math.min(95, Math.max(0, Math.floor(Number(cfg.minScore ?? 70)))),
      captionStyle: "beast",
      addMemes: true,
    };
    title = `Auto Clips — ${dateKey}`;
    configJson = JSON.stringify(config);
  } else {
    sourceUrl =
      cfg.sourceUrl && cfg.sourceUrl.length > 0
        ? cfg.sourceUrl
        : `https://www.youtube.com/watch?v=auto${dateKey.replace(/-/g, "")}`;
    const config = { sourceUrl, countdownFrom: 5, captionStyle: "beast" };
    title = `Top 5 Funniest — ${dateKey}`;
    configJson = JSON.stringify(config);
  }

  return prisma.project.create({
    data: {
      channelId: channel.id,
      type: channel.type,
      title,
      status: "generating",
      stage: "queued",
      progress: 0,
      sourceUrl,
      configJson,
    },
  });
}
