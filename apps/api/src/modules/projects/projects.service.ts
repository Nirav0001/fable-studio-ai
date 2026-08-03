// ── Projects service ─────────────────────────────────────────────────────────
// Owns the project lifecycle: create → generate (queue) → review → render
// (queue) → approve (creates Video rows, optional auto-schedule from the
// channel's weekly schedule). All *Json columns are parsed here so routes and
// the web app only ever see rich objects.

import type {
  ClipStatus,
  CostEstimate,
  EditPlan,
  ScoreBreakdown,
  ScriptPlan,
  SeoPack,
  ThumbnailVariant,
  TranscriptSegment,
  ViralScore,
  WeeklySchedule,
} from "@fable/shared";
import {
  DEFAULT_WEEKLY_SCHEDULE,
  QUEUE_JOBS,
  clamp,
  safeJson,
} from "@fable/shared";
import type { Channel, Clip, Prisma, Project, Video } from "@prisma/client";
import { badRequest, conflict, notFound } from "../../lib/errors";
import { prisma } from "../../lib/prisma";
import { assertSafeSourceUrl } from "../../lib/security";
import { enqueue } from "../../queue/queue";
import { toVideoSummary } from "../videos/videos.service";

export type ProjectType = "wyr" | "clips" | "top5";

const EMPTY_SCRIPT: ScriptPlan = {
  scenes: [],
  totalDurationSec: 0,
  voiceoverLines: [],
  musicStyle: "energetic",
};

const EMPTY_VIRAL: ViralScore = {
  total: 0,
  breakdown: {
    hook: 0,
    editing: 0,
    pacing: 0,
    seo: 0,
    thumbnail: 0,
    retention: 0,
    topic: 0,
    trending: 0,
    psychology: 0,
  },
  suggestions: [],
};

// ── Mappers ──────────────────────────────────────────────────────────────────

type ProjectWithMeta = Project & {
  channel: { name: string; type: string };
  _count?: { clips: number; videos: number };
};

export function toProjectSummary(project: ProjectWithMeta) {
  const viral = safeJson<ViralScore>(project.viralJson, EMPTY_VIRAL);
  return {
    id: project.id,
    channelId: project.channelId,
    channelName: project.channel.name,
    channelType: project.channel.type,
    type: project.type,
    title: project.title,
    status: project.status,
    stage: project.stage,
    progress: project.progress,
    error: project.error,
    sourceUrl: project.sourceUrl,
    viralScore: viral.total ?? 0,
    clipCount: project._count?.clips ?? 0,
    videoCount: project._count?.videos ?? 0,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}

function toClipDto(clip: Clip) {
  return {
    id: clip.id,
    index: clip.index,
    title: clip.title,
    hook: clip.hook,
    startSec: clip.startSec,
    endSec: clip.endSec,
    score: clip.score,
    breakdown: safeJson<Partial<ScoreBreakdown>>(clip.scoreJson, {}),
    transcript: clip.transcript,
    status: clip.status as ClipStatus,
    editPlan: safeJson<Partial<EditPlan>>(clip.editPlanJson, {}),
  };
}

// ── Queries ──────────────────────────────────────────────────────────────────

export async function listProjects(
  userId: string,
  filters: { channelId?: string; status?: string; type?: string },
) {
  const projects = await prisma.project.findMany({
    where: {
      channel: { userId },
      ...(filters.channelId ? { channelId: filters.channelId } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.type ? { type: filters.type } : {}),
    },
    include: {
      channel: { select: { name: true, type: true } },
      _count: { select: { clips: true, videos: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return projects.map(toProjectSummary);
}

async function getOwnedProject(userId: string, projectId: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, channel: { userId } },
    include: { channel: true },
  });
  if (!project) throw notFound("Project");
  return project;
}

export async function getProjectDetail(userId: string, projectId: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, channel: { userId } },
    include: {
      channel: { select: { id: true, name: true, type: true } },
      clips: { orderBy: [{ score: "desc" }, { index: "asc" }] },
      videos: {
        include: { channel: { select: { name: true } }, stats: { select: { views: true } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!project) throw notFound("Project");

  return {
    id: project.id,
    channelId: project.channelId,
    channelName: project.channel.name,
    channelType: project.channel.type,
    type: project.type,
    title: project.title,
    status: project.status,
    stage: project.stage,
    progress: project.progress,
    error: project.error,
    sourceUrl: project.sourceUrl,
    config: safeJson<Record<string, unknown>>(project.configJson, {}),
    script: safeJson<ScriptPlan>(project.scriptJson, EMPTY_SCRIPT),
    seo: safeJson<Partial<SeoPack>>(project.seoJson, {}),
    thumbnails: safeJson<ThumbnailVariant[]>(project.thumbnailJson, []),
    viral: safeJson<ViralScore>(project.viralJson, EMPTY_VIRAL),
    cost: safeJson<Partial<CostEstimate>>(project.costJson, {}),
    transcript: safeJson<TranscriptSegment[]>(project.transcriptJson, []),
    clips: project.clips.map(toClipDto),
    videos: project.videos.map((v) => toVideoSummary(v)),
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}

// ── Create ───────────────────────────────────────────────────────────────────

function defaultTitle(type: ProjectType, config: Record<string, unknown>, sourceUrl?: string): string {
  if (type === "wyr") {
    const theme = typeof config.theme === "string" && config.theme ? config.theme : "random";
    const pretty = theme[0].toUpperCase() + theme.slice(1);
    return `Would You Rather: ${pretty} Edition`;
  }
  if (type === "top5") {
    const from = Number(config.countdownFrom) || 5;
    return `Top ${from} Funniest Stream Moments`;
  }
  let host = "stream";
  try {
    if (sourceUrl) host = new URL(sourceUrl).hostname.replace(/^www\./, "");
  } catch {
    // keep default host label
  }
  return `Viral clips from ${host}`;
}

export async function createProject(
  userId: string,
  input: {
    channelId: string;
    type: ProjectType;
    title?: string;
    config: Record<string, unknown>;
    sourceUrl?: string;
  },
) {
  const channel = await prisma.channel.findFirst({
    where: { id: input.channelId, userId },
  });
  if (!channel) throw notFound("Channel");

  // clips/top5 need a source; validate it hard (allowlisted https host, no
  // arg-injection) BEFORE it can be stored or reach yt-dlp. The freeform
  // config.sourceUrl path is the one the audit flagged — validate it too.
  const rawSource =
    input.sourceUrl ??
    (typeof input.config.sourceUrl === "string" ? input.config.sourceUrl : undefined);
  const sourceUrl =
    input.type === "clips" || input.type === "top5"
      ? assertSafeSourceUrl(rawSource)
      : rawSource && typeof rawSource === "string"
        ? assertSafeSourceUrl(rawSource)
        : undefined;
  const config = { ...input.config, ...(sourceUrl ? { sourceUrl } : {}) };
  const title = input.title?.trim() || defaultTitle(input.type, config, sourceUrl);

  const project = await prisma.project.create({
    data: {
      channelId: channel.id,
      type: input.type,
      title,
      status: "generating",
      stage: "Queued",
      progress: 0,
      sourceUrl: sourceUrl ?? null,
      configJson: JSON.stringify(config),
    },
    include: {
      channel: { select: { name: true, type: true } },
      _count: { select: { clips: true, videos: true } },
    },
  });

  await enqueue(QUEUE_JOBS.PROJECT_GENERATE, { projectId: project.id });
  return toProjectSummary(project);
}

// ── Mutations ────────────────────────────────────────────────────────────────

export async function updateProject(
  userId: string,
  projectId: string,
  patch: { title?: string; seo?: Record<string, unknown>; script?: Record<string, unknown> },
) {
  const project = await getOwnedProject(userId, projectId);
  if (project.status === "generating" || project.status === "rendering") {
    throw conflict(`Project cannot be edited while ${project.status}`);
  }

  const data: Prisma.ProjectUpdateInput = {};
  if (patch.title !== undefined) {
    const title = patch.title.trim();
    if (!title) throw badRequest("Title cannot be empty");
    data.title = title;
  }
  if (patch.seo !== undefined) {
    const current = safeJson<Record<string, unknown>>(project.seoJson, {});
    data.seoJson = JSON.stringify({ ...current, ...patch.seo });
  }
  if (patch.script !== undefined) data.scriptJson = JSON.stringify(patch.script);

  await prisma.project.update({ where: { id: project.id }, data });
  return getProjectDetail(userId, projectId);
}

export async function regenerateProject(userId: string, projectId: string) {
  const project = await getOwnedProject(userId, projectId);
  if (project.status === "generating") throw conflict("Project is already generating");
  if (project.status === "rendering") throw conflict("Project is currently rendering");

  await prisma.project.update({
    where: { id: project.id },
    data: { status: "generating", stage: "Queued", progress: 0, error: null },
  });
  const jobId = await enqueue(QUEUE_JOBS.PROJECT_GENERATE, { projectId: project.id });
  return { jobId, status: "generating" as const };
}

export async function renderProject(userId: string, projectId: string) {
  const project = await getOwnedProject(userId, projectId);
  if (project.status === "generating") throw conflict("Wait for generation to finish first");
  if (project.status === "rendering") throw conflict("Project is already rendering");
  if (project.status === "draft" || project.status === "failed") {
    throw badRequest("Generate the project before rendering");
  }

  await prisma.project.update({
    where: { id: project.id },
    data: { status: "rendering", stage: "Render queued", progress: 0, error: null },
  });
  const jobId = await enqueue(QUEUE_JOBS.PROJECT_RENDER, { projectId: project.id });
  return { jobId, status: "rendering" as const };
}

export async function deleteProject(userId: string, projectId: string) {
  const project = await getOwnedProject(userId, projectId);
  if (project.status === "generating" || project.status === "rendering") {
    throw conflict(`Project cannot be deleted while ${project.status}`);
  }
  await prisma.project.delete({ where: { id: project.id } });
  return { deleted: true };
}

export async function setClipStatus(
  userId: string,
  projectId: string,
  clipId: string,
  status: "kept" | "discarded",
) {
  const clip = await prisma.clip.findFirst({
    where: { id: clipId, projectId, project: { channel: { userId } } },
  });
  if (!clip) throw notFound("Clip");
  const updated = await prisma.clip.update({ where: { id: clip.id }, data: { status } });
  return toClipDto(updated);
}

// ── Approve (+ optional auto-schedule) ───────────────────────────────────────

/**
 * Find the next free future publish times from the channel's weekly schedule
 * (skipping occupied slots), create ScheduleSlots and flip videos to
 * "scheduled". Returns the number of slots created.
 */
async function autoScheduleVideos(channel: Channel, videos: Video[]): Promise<number> {
  if (videos.length === 0) return 0;

  // Only schedule videos that don't already have a slot.
  const existingForVideos = await prisma.scheduleSlot.findMany({
    where: { videoId: { in: videos.map((v) => v.id) } },
    select: { videoId: true },
  });
  const alreadySlotted = new Set(existingForVideos.map((s) => s.videoId));
  const queue = videos
    .filter((v) => !alreadySlotted.has(v.id))
    .sort((a, b) => b.viralScore - a.viralScore);
  if (queue.length === 0) return 0;

  const parsed = safeJson<WeeklySchedule>(channel.scheduleJson, DEFAULT_WEEKLY_SCHEDULE);
  const weekly = Object.keys(parsed).length > 0 ? parsed : DEFAULT_WEEKLY_SCHEDULE;

  const now = new Date();
  const horizonDays = 21;
  const horizon = new Date(now.getTime() + horizonDays * 86_400_000);
  const occupied = new Set(
    (
      await prisma.scheduleSlot.findMany({
        where: {
          channelId: channel.id,
          scheduledAt: { gte: now, lte: horizon },
          status: { notIn: ["cancelled", "failed"] },
        },
        select: { scheduledAt: true },
      })
    ).map((s) => s.scheduledAt.getTime()),
  );

  const assignments: { videoId: string; at: Date }[] = [];
  outer: for (let d = 0; d <= horizonDays; d++) {
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
      if (at <= now || occupied.has(at.getTime())) continue;
      const video = queue[assignments.length];
      if (!video) break outer;
      assignments.push({ videoId: video.id, at });
      occupied.add(at.getTime());
    }
  }

  if (assignments.length === 0) return 0;
  await prisma.$transaction(async (tx) => {
    for (const { videoId, at } of assignments) {
      await tx.scheduleSlot.create({
        data: { channelId: channel.id, videoId, scheduledAt: at, status: "scheduled" },
      });
      await tx.video.update({ where: { id: videoId }, data: { status: "scheduled" } });
    }
  });
  return assignments.length;
}

export async function approveProject(userId: string, projectId: string, schedule: boolean) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, channel: { userId } },
    include: {
      channel: true,
      clips: { orderBy: [{ score: "desc" }, { index: "asc" }] },
      videos: true,
    },
  });
  if (!project) throw notFound("Project");
  if (project.status === "generating") throw conflict("Wait for generation to finish first");
  if (project.status === "rendering") throw conflict("Wait for the render to finish first");
  if (project.status === "draft") throw badRequest("Generate the project before approving");

  const seo = safeJson<Partial<SeoPack>>(project.seoJson, {});
  const viral = safeJson<ViralScore>(project.viralJson, EMPTY_VIRAL);
  const script = safeJson<ScriptPlan>(project.scriptJson, EMPTY_SCRIPT);
  const config = safeJson<Record<string, unknown>>(project.configJson, {});
  const uploadDefaults = safeJson<{ visibility?: string }>(
    project.channel.uploadDefaultsJson,
    {},
  );
  const visibility = uploadDefaults.visibility ?? "public";
  const tagsJson = JSON.stringify(seo.tags ?? []);
  const hashtagsJson = JSON.stringify(seo.hashtags ?? []);

  const videos: Video[] = [];

  if (project.type === "clips") {
    const kept = project.clips.filter((c) => c.status === "kept");
    if (kept.length === 0) throw badRequest("Keep at least one clip before approving");
    for (const clip of kept) {
      // Idempotent: reuse a video already created for this clip (e.g. by render).
      const existing = project.videos.find((v) => v.clipId === clip.id);
      if (existing) {
        videos.push(existing);
        continue;
      }
      const description = [clip.hook, seo.description ?? ""].filter(Boolean).join("\n\n");
      videos.push(
        await prisma.video.create({
          data: {
            channelId: project.channelId,
            projectId: project.id,
            clipId: clip.id,
            title: clip.title,
            description,
            tagsJson,
            hashtagsJson,
            durationSec: clamp(clip.endSec - clip.startSec, 5, 60),
            status: "ready",
            visibility,
            viralScore: clip.score,
          },
        }),
      );
    }
  } else {
    const existing = project.videos.find((v) => !v.clipId);
    if (existing) {
      videos.push(existing);
    } else {
      const durationSec =
        script.totalDurationSec || Number(config.lengthSec) || 30;
      videos.push(
        await prisma.video.create({
          data: {
            channelId: project.channelId,
            projectId: project.id,
            title: seo.title || project.title,
            description: seo.description ?? "",
            tagsJson,
            hashtagsJson,
            durationSec,
            status: "ready",
            visibility,
            viralScore: viral.total ?? 0,
          },
        }),
      );
    }
  }

  let scheduled = 0;
  if (schedule) {
    scheduled = await autoScheduleVideos(
      project.channel,
      videos.filter((v) => v.status === "ready"),
    );
  }

  await prisma.project.update({
    where: { id: project.id },
    data: { status: "ready", stage: "Approved", progress: 100 },
  });

  return {
    projectId: project.id,
    status: "ready" as const,
    scheduled,
    videos: videos.map((v) => toVideoSummary(v, project.channel.name)),
  };
}
