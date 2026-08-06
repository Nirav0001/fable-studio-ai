// External clip media lifecycle (plan amendments A4 + ED17).
//
// Externally ingested clips (Video.clientRef != null) carry big mp4s on the
// storage volume that Fable itself never re-renders, so nothing else bounds
// their disk usage:
//   - published >24h ago            → delete the media file (YouTube has it)
//   - never-approved drafts >30d    → notify the owner, delete the media file
//     ONLY, and flag mediaExpired=true — the Video row stays visible so
//     nothing user-facing silently vanishes while the volume stays bounded.
//
// workers.ts runs pruneExternalMedia() on a daily tick.

import { unlink } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { env } from "../config/env";
import { createLogger } from "../lib/logger";
import { prisma } from "../lib/prisma";
import { notify } from "../modules/notifications/notify";

const log = createLogger("prune");

/** Published external clips keep their local media this long after publish. */
export const PUBLISHED_PRUNE_MS = 24 * 60 * 60_000;
/** Never-approved external drafts keep their media this long after ingest. */
export const DRAFT_EXPIRE_MS = 30 * 24 * 60 * 60_000;

function absPath(filePath: string): string {
  return isAbsolute(filePath) ? filePath : join(env.storageDir, filePath);
}

/**
 * Delete a media file only when no OTHER video row still points at it.
 *
 * repostVideo copies filePath verbatim rather than duplicating the media, so
 * an ingested clip and its reposts share one file on disk. Unlinking on the
 * original's schedule would strand every repost with the row intact but the
 * media gone, surfacing later as "Rendered video file is missing on disk"
 * at upload time. The row is always cleared; only the unlink is conditional.
 */
async function releaseMedia(videoId: string, filePath: string | null): Promise<void> {
  if (!filePath) return;
  const otherReferences = await prisma.video.count({
    where: { filePath, id: { not: videoId } },
  });
  if (otherReferences > 0) return;
  await unlink(absPath(filePath)).catch(() => undefined);
}

export async function pruneExternalMedia(
  now = new Date(),
): Promise<{ publishedPruned: number; draftsExpired: number }> {
  let publishedPruned = 0;
  let draftsExpired = 0;

  // 1) Published >24h ago — the upload succeeded long ago; drop the local file.
  //    filePath=null afterwards is the "already pruned" marker.
  const published = await prisma.video.findMany({
    where: {
      clientRef: { not: null },
      status: "published",
      publishedAt: { lt: new Date(now.getTime() - PUBLISHED_PRUNE_MS) },
      filePath: { not: null },
    },
    select: { id: true, filePath: true },
  });
  for (const video of published) {
    await releaseMedia(video.id, video.filePath);
    await prisma.video.update({ where: { id: video.id }, data: { filePath: null } });
    publishedPruned++;
  }

  // 2) Never-approved drafts >30d — media file only; the row is kept and
  //    flagged, and the owner is told (ED17: no silent data loss on a timer).
  const staleDrafts = await prisma.video.findMany({
    where: {
      clientRef: { not: null },
      status: "draft",
      mediaExpired: false,
      createdAt: { lt: new Date(now.getTime() - DRAFT_EXPIRE_MS) },
    },
    include: { channel: { select: { userId: true, name: true } } },
  });
  for (const video of staleDrafts) {
    await releaseMedia(video.id, video.filePath);
    await prisma.video.update({
      where: { id: video.id },
      data: { mediaExpired: true, filePath: null },
    });
    await notify(
      video.channel.userId,
      "system",
      "External clip media expired",
      `"${video.title}" on ${video.channel.name} sat unapproved for 30 days — its media file was removed to free space. The draft entry itself remains.`,
    ).catch(() => undefined);
    draftsExpired++;
  }

  if (publishedPruned > 0 || draftsExpired > 0) {
    log.info(
      `external media prune: ${publishedPruned} published file(s) removed, ${draftsExpired} stale draft(s) expired`,
    );
  }
  return { publishedPruned, draftsExpired };
}
