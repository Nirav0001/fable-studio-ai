import { QUEUE_JOBS } from "@fable/shared";
import { env } from "../../config/env";
import { createLogger } from "../../lib/logger";
import { prisma } from "../../lib/prisma";
import { notify } from "../../modules/notifications/notify";
import { hasRealYoutubeTokens, isYoutubeConfiguredFor, uploadVideo } from "../../services/youtube";
import { enqueue, payloadString, updateJob } from "../queue";
import type { JobPayload } from "../queue";

const log = createLogger("upload");

const MAX_ATTEMPTS = 3;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Upload a rendered video: real resumable YouTube upload when the channel has
 * genuine OAuth tokens and API keys are configured, otherwise a mock publish.
 * Failed slot uploads retry up to 3 times with backoff.
 */
export async function processUpload(payload: JobPayload): Promise<void> {
  const videoId = payloadString(payload, "videoId");
  const jobId = payloadString(payload, "jobId");
  const slotId = typeof payload.slotId === "string" && payload.slotId ? payload.slotId : null;

  await updateJob(jobId, {
    status: "active",
    progress: 10,
    message: "Upload starting",
    log: "Upload job started",
  });

  const video = await prisma.video.findUnique({
    where: { id: videoId },
    include: { channel: true },
  });
  if (!video) {
    await updateJob(jobId, { status: "failed", message: "Video not found" });
    if (slotId) {
      await prisma.scheduleSlot
        .updateMany({ where: { id: slotId }, data: { status: "failed", lastError: "Video not found" } })
        .catch(() => undefined);
    }
    return;
  }
  const userId = video.channel.userId;
  const realUpload = await hasRealYoutubeTokens(video.channel);

  // Never mock-publish in production — a video must not be marked "published"
  // with a fake id. Park it whenever a real upload isn't possible (channel not
  // connected, or no YouTube keys at all). Dev keeps the mock publish only
  // when keys aren't configured, so the demo pipeline still flows end-to-end.
  if (!realUpload && (env.isProd || (await isYoutubeConfiguredFor(userId)))) {
    await prisma.video.update({ where: { id: videoId }, data: { status: "ready" } }).catch(() => undefined);
    if (slotId) {
      await prisma.scheduleSlot
        .updateMany({
          where: { id: slotId },
          data: { status: "failed", lastError: "Channel is not connected to YouTube" },
        })
        .catch(() => undefined);
    }
    await updateJob(jobId, {
      status: "failed",
      message: "Channel not connected to YouTube",
      log: "Upload skipped — connect the channel first",
    });
    await notify(
      userId,
      "upload.failed",
      "Upload skipped",
      `"${video.title}" — connect ${video.channel.name} to YouTube first`,
    ).catch(() => undefined);
    return;
  }

  try {
    await prisma.video.update({ where: { id: videoId }, data: { status: "uploading" } });
    if (slotId) {
      await prisma.scheduleSlot.updateMany({
        where: { id: slotId },
        data: { status: "uploading" },
      });
    }

    await updateJob(jobId, {
      progress: 35,
      message: "Uploading to YouTube",
      log: realUpload
        ? "Starting resumable upload to YouTube"
        : "Mock publish (channel has no real YouTube credentials)",
    });

    let youtubeId: string;
    if (realUpload) {
      const result = await uploadVideo(video.channel, video);
      youtubeId = result.youtubeId;
    } else {
      await delay(1500);
      youtubeId = `mock-${video.id}`;
    }

    await updateJob(jobId, { progress: 80, message: "Finalizing", log: "Upload finished, publishing" });

    await prisma.video.update({
      where: { id: videoId },
      data: { status: "published", youtubeId, publishedAt: new Date() },
    });
    // The slot has a unique videoId, so this covers both slot-driven and
    // direct uploads of a scheduled video.
    await prisma.scheduleSlot.updateMany({
      where: { videoId },
      data: { status: "uploaded" },
    });

    // Stats are REAL only: the periodic YouTube stats sync fills views/likes/
    // comments from the Data API — nothing is seeded at publish time.

    await updateJob(jobId, {
      status: "completed",
      progress: 100,
      message: "Published",
      log: `Published as ${youtubeId}`,
    });
    await notify(
      userId,
      "upload.done",
      "Video published",
      `"${video.title}" is live on ${video.channel.name}`,
    );
    log.info(`Video ${videoId} published (${youtubeId})`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error(`Upload failed for video ${videoId}: ${message}`);

    if (slotId) {
      const slot = await prisma.scheduleSlot.findUnique({ where: { id: slotId } });
      if (slot) {
        const attempts = slot.attempts + 1;
        const willRetry = attempts < MAX_ATTEMPTS;
        await prisma.scheduleSlot.update({
          where: { id: slotId },
          data: {
            attempts,
            lastError: message,
            status: willRetry ? "queued" : "failed",
          },
        });
        if (willRetry) {
          await prisma.video
            .update({ where: { id: videoId }, data: { status: "scheduled" } })
            .catch(() => undefined);
          await updateJob(jobId, {
            status: "failed",
            message: `Upload failed (attempt ${attempts}/${MAX_ATTEMPTS}) — retrying`,
            log: `Attempt ${attempts} failed: ${message}. Retrying in ${5 * attempts}s`,
          });
          setTimeout(() => {
            void enqueue(QUEUE_JOBS.VIDEO_UPLOAD, {
              videoId,
              slotId,
              channelId: video.channelId,
            });
          }, 5_000 * attempts);
          return;
        }
      }
    }

    await prisma.video
      .update({ where: { id: videoId }, data: { status: "failed" } })
      .catch(() => undefined);
    await updateJob(jobId, { status: "failed", message, log: `Upload failed: ${message}` });
    await notify(userId, "upload.failed", "Upload failed", `"${video.title}": ${message}`).catch(
      () => undefined,
    );
  }
}
