import { Queue } from "bullmq";
import IORedis from "ioredis";
import { clamp, safeJson } from "@fable/shared";
import { env } from "../config/env";
import { createLogger } from "../lib/logger";
import { prisma } from "../lib/prisma";
import { runAsUser } from "../lib/providerKeys";

const log = createLogger("queue");

export const QUEUE_NAME = "fable";

export type JobPayload = Record<string, unknown>;
export type ProcessorFn = (payload: JobPayload) => Promise<void>;

// ── Processor registry (used by both drivers) ────────────────────────────────

const processors = new Map<string, ProcessorFn>();

export function registerProcessor(name: string, fn: ProcessorFn): void {
  // Every job runs inside the owning user's provider-key context (JobRecord
  // stores userId at enqueue) so deep call sites — AI text, TTS, music,
  // Whisper — resolve that user's keys automatically, env keys as fallback.
  processors.set(name, async (payload) => {
    let userId: string | null = null;
    if (typeof payload.jobId === "string" && payload.jobId) {
      try {
        const record = await prisma.jobRecord.findUnique({
          where: { id: payload.jobId },
          select: { userId: true },
        });
        userId = record?.userId ?? null;
      } catch {
        /* best effort — fall back to env keys */
      }
    }
    return runAsUser(userId, () => fn(payload));
  });
}

export function getProcessor(name: string): ProcessorFn | undefined {
  return processors.get(name);
}

export function getQueueDriverName(): "bullmq" | "memory" {
  return env.redisUrl ? "bullmq" : "memory";
}

// ── BullMQ driver (lazy — nothing connects until the first enqueue) ──────────

let redisConnection: IORedis | null = null;

export function createRedisConnection(): IORedis {
  if (!redisConnection) {
    redisConnection = new IORedis(env.redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      lazyConnect: true,
    });
    redisConnection.on("error", (err) => log.warn(`Redis error: ${err.message}`));
  }
  return redisConnection;
}

let bullQueue: Queue | null = null;

function getBullQueue(): Queue {
  if (!bullQueue) {
    bullQueue = new Queue(QUEUE_NAME, { connection: createRedisConnection() });
  }
  return bullQueue;
}

// ── In-memory driver ─────────────────────────────────────────────────────────

function dispatchMemory(name: string, payload: JobPayload & { jobId: string }, attempt = 0): void {
  setImmediate(() => {
    const fn = processors.get(name);
    if (!fn) {
      // Workers may not have registered yet during startup — retry briefly.
      if (attempt < 40) {
        setTimeout(() => dispatchMemory(name, payload, attempt + 1), 250);
      } else {
        void updateJob(payload.jobId, {
          status: "failed",
          message: `No processor registered for "${name}"`,
          log: `No processor registered for "${name}" after startup grace period`,
        });
      }
      return;
    }
    fn(payload).catch(async (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      log.error(`Processor "${name}" crashed: ${message}`);
      await updateJob(payload.jobId, {
        status: "failed",
        message,
        log: `Processor crashed: ${message}`,
      });
    });
  });
}

// ── Public API ───────────────────────────────────────────────────────────────

function deriveRef(payload: JobPayload): { refType: string; refId: string } {
  if (typeof payload.projectId === "string" && payload.projectId) {
    return { refType: "project", refId: payload.projectId };
  }
  if (typeof payload.videoId === "string" && payload.videoId) {
    return { refType: "video", refId: payload.videoId };
  }
  if (typeof payload.channelId === "string" && payload.channelId) {
    return { refType: "channel", refId: payload.channelId };
  }
  return { refType: "system", refId: "system" };
}

/**
 * Create a JobRecord and dispatch it to the active driver.
 * Returns the JobRecord id (also injected into the payload as `jobId`).
 */
/** Resolve the owning userId from the job's referenced resource. */
async function resolveOwner(refType: string, refId: string): Promise<string | null> {
  try {
    if (refType === "project") {
      const p = await prisma.project.findUnique({
        where: { id: refId },
        select: { channel: { select: { userId: true } } },
      });
      return p?.channel.userId ?? null;
    }
    if (refType === "video") {
      const v = await prisma.video.findUnique({
        where: { id: refId },
        select: { channel: { select: { userId: true } } },
      });
      return v?.channel.userId ?? null;
    }
    if (refType === "channel") {
      const c = await prisma.channel.findUnique({ where: { id: refId }, select: { userId: true } });
      return c?.userId ?? null;
    }
  } catch {
    /* best effort */
  }
  return null;
}

export async function enqueue(jobName: string, payload: Record<string, unknown>): Promise<string> {
  const { refType, refId } = deriveRef(payload);
  const userId =
    typeof payload.userId === "string" && payload.userId
      ? payload.userId
      : await resolveOwner(refType, refId);
  const record = await prisma.jobRecord.create({
    data: {
      queue: QUEUE_NAME,
      name: jobName,
      userId,
      refType,
      refId,
      status: "queued",
      progress: 0,
      message: "Queued",
      logsJson: JSON.stringify([`[${new Date().toISOString()}] Enqueued ${jobName}`]),
    },
  });
  const fullPayload: JobPayload & { jobId: string } = { ...payload, jobId: record.id };

  if (getQueueDriverName() === "bullmq") {
    try {
      await getBullQueue().add(jobName, fullPayload, {
        jobId: record.id,
        removeOnComplete: 500,
        removeOnFail: 500,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.warn(`BullMQ enqueue failed (${message}) — falling back to memory dispatch`);
      dispatchMemory(jobName, fullPayload);
    }
  } else {
    dispatchMemory(jobName, fullPayload);
  }

  log.info(`Enqueued ${jobName} (job=${record.id}, ${refType}=${refId})`);
  return record.id;
}

export interface JobPatch {
  status?: "queued" | "active" | "completed" | "failed";
  progress?: number;
  message?: string;
  log?: string;
}

/** Patch a JobRecord; log lines are timestamped and capped at 100 entries. */
export async function updateJob(id: string, patch: JobPatch): Promise<void> {
  try {
    const existing = await prisma.jobRecord.findUnique({ where: { id } });
    if (!existing) return;

    const logs = safeJson<string[]>(existing.logsJson, []);
    if (patch.log) {
      logs.push(`[${new Date().toISOString()}] ${patch.log}`);
      while (logs.length > 100) logs.shift();
    }

    await prisma.jobRecord.update({
      where: { id },
      data: {
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.progress !== undefined
          ? { progress: Math.round(clamp(patch.progress, 0, 100)) }
          : {}),
        ...(patch.message !== undefined ? { message: patch.message } : {}),
        ...(patch.log !== undefined ? { logsJson: JSON.stringify(logs) } : {}),
        ...(patch.status === "active" && !existing.startedAt ? { startedAt: new Date() } : {}),
        ...(patch.status === "completed" || patch.status === "failed"
          ? { finishedAt: new Date() }
          : {}),
      },
    });
  } catch (err) {
    log.warn(`updateJob(${id}) failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** Extract a required string field from a job payload. */
export function payloadString(payload: JobPayload, key: string): string {
  const value = payload[key];
  if (typeof value === "string" && value.length > 0) return value;
  throw new Error(`Job payload is missing required field "${key}"`);
}
