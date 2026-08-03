import type { SlotStatus, UpcomingSlot, WeeklySchedule } from "@fable/shared";
import { DEFAULT_WEEKLY_SCHEDULE, clamp, fnv1a, safeJson, seededRandom } from "@fable/shared";
import { badRequest, conflict, notFound } from "../../lib/errors";
import { prisma } from "../../lib/prisma";
import { toVideoSummary } from "../videos/videos.service";

// ── Structural row types ─────────────────────────────────────────────────────

interface SlotVideoRow {
  id: string;
  channelId: string;
  projectId: string | null;
  clipId: string | null;
  title: string;
  description: string;
  tagsJson: string;
  hashtagsJson: string;
  filePath: string | null;
  thumbnailPath: string | null;
  durationSec: number;
  status: string;
  visibility: string;
  viralScore: number;
  youtubeId: string | null;
  publishedAt: Date | null;
  createdAt: Date;
}

interface SlotRow {
  id: string;
  channelId: string;
  scheduledAt: Date;
  status: string;
  video?: (SlotVideoRow & { stats?: { views: number }[] }) | null;
  channel?: { name: string } | null;
}

export function toUpcomingSlot(slot: SlotRow): UpcomingSlot {
  return {
    id: slot.id,
    channelId: slot.channelId,
    channelName: slot.channel?.name,
    scheduledAt: slot.scheduledAt.toISOString(),
    status: slot.status as SlotStatus,
    video: slot.video ? toVideoSummary(slot.video, slot.channel?.name) : null,
  };
}

async function getOwnedChannel(userId: string, channelId: string) {
  const channel = await prisma.channel.findFirst({ where: { id: channelId, userId } });
  if (!channel) throw notFound("Channel");
  return channel;
}

// ── Queries ──────────────────────────────────────────────────────────────────

export async function listSlots(
  userId: string,
  range: { from: Date; to: Date; channelId?: string },
): Promise<UpcomingSlot[]> {
  const slots = await prisma.scheduleSlot.findMany({
    where: {
      channel: { userId },
      scheduledAt: { gte: range.from, lte: range.to },
      ...(range.channelId ? { channelId: range.channelId } : {}),
    },
    include: {
      channel: { select: { name: true } },
      video: { include: { stats: { select: { views: true } } } },
    },
    orderBy: { scheduledAt: "asc" },
  });
  return slots.map(toUpcomingSlot);
}

// ── Mutations ────────────────────────────────────────────────────────────────

export async function createSlot(
  userId: string,
  input: { channelId: string; videoId?: string; scheduledAt: Date },
): Promise<UpcomingSlot> {
  const channel = await getOwnedChannel(userId, input.channelId);
  if (Number.isNaN(input.scheduledAt.getTime())) throw badRequest("Invalid scheduledAt date");

  let videoId: string | null = null;
  if (input.videoId) {
    const video = await prisma.video.findFirst({
      where: { id: input.videoId, channel: { userId } },
      include: { slot: { select: { id: true } } },
    });
    if (!video) throw notFound("Video");
    if (video.slot) throw conflict("Video already has a scheduled slot");
    videoId = video.id;
  }

  const slot = await prisma.$transaction(async (tx) => {
    if (videoId) {
      await tx.video.update({ where: { id: videoId }, data: { status: "scheduled" } });
    }
    return tx.scheduleSlot.create({
      data: {
        channelId: channel.id,
        videoId,
        scheduledAt: input.scheduledAt,
        status: "scheduled",
      },
      include: { channel: { select: { name: true } }, video: true },
    });
  });
  return toUpcomingSlot(slot);
}

export interface SlotPatch {
  scheduledAt?: Date;
  status?: SlotStatus;
  videoId?: string | null;
}

export async function updateSlot(
  userId: string,
  slotId: string,
  patch: SlotPatch,
): Promise<UpcomingSlot> {
  const slot = await prisma.scheduleSlot.findFirst({
    where: { id: slotId, channel: { userId } },
    include: { video: { select: { id: true, status: true } } },
  });
  if (!slot) throw notFound("Schedule slot");
  if (patch.scheduledAt && Number.isNaN(patch.scheduledAt.getTime())) {
    throw badRequest("Invalid scheduledAt date");
  }

  const videoChanging = patch.videoId !== undefined && patch.videoId !== slot.videoId;
  let newVideoId: string | null | undefined;
  if (videoChanging) {
    newVideoId = patch.videoId;
    if (newVideoId) {
      const video = await prisma.video.findFirst({
        where: { id: newVideoId, channel: { userId } },
        include: { slot: { select: { id: true } } },
      });
      if (!video) throw notFound("Video");
      if (video.slot && video.slot.id !== slot.id) {
        throw conflict("Video already has a scheduled slot");
      }
    }
  }

  const cancelling = patch.status === "cancelled" && slot.status !== "cancelled";

  const updated = await prisma.$transaction(async (tx) => {
    // Free the previously attached video when it is detached or the slot cancelled.
    const detachingOld = (videoChanging || cancelling) && slot.video?.status === "scheduled";
    if (detachingOld && slot.videoId && (videoChanging || cancelling)) {
      await tx.video.update({ where: { id: slot.videoId }, data: { status: "ready" } });
    }
    if (videoChanging && newVideoId && !cancelling) {
      await tx.video.update({ where: { id: newVideoId }, data: { status: "scheduled" } });
    }
    return tx.scheduleSlot.update({
      where: { id: slot.id },
      data: {
        ...(patch.scheduledAt !== undefined ? { scheduledAt: patch.scheduledAt } : {}),
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(videoChanging ? { videoId: cancelling ? null : newVideoId } : {}),
      },
      include: {
        channel: { select: { name: true } },
        video: { include: { stats: { select: { views: true } } } },
      },
    });
  });
  return toUpcomingSlot(updated);
}

export async function deleteSlot(userId: string, slotId: string) {
  const slot = await prisma.scheduleSlot.findFirst({
    where: { id: slotId, channel: { userId } },
    include: { video: { select: { id: true, status: true } } },
  });
  if (!slot) throw notFound("Schedule slot");
  await prisma.$transaction(async (tx) => {
    if (slot.videoId && slot.video?.status === "scheduled") {
      await tx.video.update({ where: { id: slot.videoId }, data: { status: "ready" } });
    }
    await tx.scheduleSlot.delete({ where: { id: slot.id } });
  });
  return { deleted: true };
}

// ── Best-time suggestions (deterministic heatmap-style scoring) ──────────────

export async function getSuggestions(userId: string, channelId: string) {
  await getOwnedChannel(userId, channelId);
  const snapshots = await prisma.analyticsSnapshot.findMany({
    where: { channelId },
    orderBy: { date: "desc" },
    take: 28,
    select: { views: true },
  });
  const totalViews = snapshots.reduce((sum, s) => sum + s.views, 0);
  const rand = seededRandom(fnv1a(`${channelId}:${totalViews}`) || 1);

  const cells: { day: number; hour: number; score: number }[] = [];
  for (let day = 0; day < 7; day++) {
    for (let hour = 6; hour <= 22; hour++) {
      let score = 35 + rand() * 30; // base noise 35-65
      if (hour >= 17 && hour <= 21) score += 18 + rand() * 8; // evenings win
      if (hour >= 11 && hour <= 13) score += 6 + rand() * 4; // lunch bump
      if (day === 0 || day === 6) score += 10 + rand() * 6; // weekends win
      if (day === 5 && hour >= 18) score += 6; // friday night
      cells.push({ day, hour, score: Math.round(clamp(score, 0, 100)) });
    }
  }
  cells.sort((a, b) => b.score - a.score || a.day - b.day || a.hour - b.hour);
  return { bestTimes: cells.slice(0, 5) };
}

// ── Auto-fill from the channel's weekly schedule ─────────────────────────────

export async function autoFill(
  userId: string,
  channelId: string,
  days: number,
  /** Restrict to specific videos (autopilot passes only its fresh renders —
   *  an unrestricted sweep would queue every ready video on the channel). */
  onlyVideoIds?: string[],
) {
  const channel = await getOwnedChannel(userId, channelId);
  const parsed = safeJson<WeeklySchedule>(channel.scheduleJson, DEFAULT_WEEKLY_SCHEDULE);
  const weekly = Object.keys(parsed).length > 0 ? parsed : DEFAULT_WEEKLY_SCHEDULE;

  const readyVideos = await prisma.video.findMany({
    where: {
      channelId,
      status: "ready",
      slot: null,
      ...(onlyVideoIds ? { id: { in: onlyVideoIds } } : {}),
    },
    orderBy: [{ viralScore: "desc" }, { createdAt: "asc" }],
    select: { id: true },
  });
  if (readyVideos.length === 0) return { created: 0 };

  const now = new Date();
  const horizon = new Date(now.getTime() + days * 86_400_000);
  const existing = await prisma.scheduleSlot.findMany({
    where: {
      channelId,
      scheduledAt: { gte: now, lte: horizon },
      status: { notIn: ["cancelled", "failed"] },
    },
    select: { scheduledAt: true },
  });
  const occupied = new Set(existing.map((s) => s.scheduledAt.getTime()));

  const assignments: { videoId: string; at: Date }[] = [];
  outer: for (let d = 0; d <= days; d++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + d);
    const times = [...(weekly[String(day.getDay())] ?? [])].sort();
    for (const time of times) {
      const [hh, mm] = time.split(":").map((n) => Number(n));
      if (!Number.isFinite(hh)) continue;
      const at = new Date(
        day.getFullYear(),
        day.getMonth(),
        day.getDate(),
        hh,
        Number.isFinite(mm) ? mm : 0,
        0,
        0,
      );
      if (at <= now || at > horizon || occupied.has(at.getTime())) continue;
      const video = readyVideos[assignments.length];
      if (!video) break outer;
      assignments.push({ videoId: video.id, at });
      occupied.add(at.getTime());
    }
  }

  if (assignments.length === 0) return { created: 0 };
  await prisma.$transaction(async (tx) => {
    for (const { videoId, at } of assignments) {
      await tx.scheduleSlot.create({
        data: { channelId, videoId, scheduledAt: at, status: "scheduled" },
      });
      await tx.video.update({ where: { id: videoId }, data: { status: "scheduled" } });
    }
  });
  return { created: assignments.length };
}
