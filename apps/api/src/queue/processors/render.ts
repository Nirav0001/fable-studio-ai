import { join } from "node:path";
import { mkdir } from "node:fs/promises";
import { clamp, safeJson } from "@fable/shared";
import type {
  Branding,
  EditPlan,
  ScriptPlan,
  SeoPack,
  ThumbnailVariant,
  TranscriptSegment,
  ViralScore,
  WyrConfig,
} from "@fable/shared";
import type { Clip } from "@prisma/client";
import { env } from "../../config/env";
import { hasFfmpeg } from "../../lib/capabilities";
import { createLogger } from "../../lib/logger";
import { prisma } from "../../lib/prisma";
import { notify } from "../../modules/notifications/notify";
import {
  renderClipFromSource,
  renderClipVideo,
  renderThumbnail,
  renderTop5FromSource,
  renderTop5Video,
  renderWyrVideo,
} from "../../services/media/ffmpeg";
import {
  ensureSourceSection,
  ensureSourceVideo,
  getSourceDurationSec,
} from "../../services/media/source";
import { cleanupVoiceover, synthesizeVoiceover } from "../../services/media/voiceover";
import type { VoiceTrack } from "../../services/media/voiceover";
import { retimeScriptToVoice } from "../../services/media/retime";
import { ensureMusicBed } from "../../services/media/music";
import { autoFill } from "../../modules/schedule/schedule.service";
import { payloadString, updateJob } from "../queue";
import type { JobPayload } from "../queue";

const log = createLogger("render");

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function emptyViral(): ViralScore {
  return {
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
}

function fallbackSeo(title: string): SeoPack {
  return {
    title,
    description: "",
    hashtags: [],
    tags: [],
    keywords: [],
    pinnedComment: "",
    communityPost: "",
  };
}

function defaultEditPlan(clip: Clip): EditPlan {
  return {
    reframe: { mode: "center" },
    zooms: [],
    captions: { style: "beast", animated: true },
    overlays: [],
    sfx: [],
    hookText: clip.hook || clip.title,
    ctaText: "Follow for more",
  };
}

function fallbackThumbVariant(title: string, index: number): ThumbnailVariant {
  return {
    id: `fallback-${index}`,
    headline: title.slice(0, 40) || "Watch this",
    subtext: "New upload",
    emoji: "",
    bgFrom: "#4c1d95",
    bgTo: "#8b5cf6",
    accentColor: "#f59e0b",
    style: "bold",
    predictedCtr: 6.5,
    imagePath: undefined,
  };
}

/**
 * Render pipeline: wyr/top5 produce one video, clips produce one video per
 * kept clip. Real mp4s via ffmpeg when available; otherwise a simulated 2s
 * render that still creates the Video rows (filePath/thumbnailPath null).
 */
export async function processRender(payload: JobPayload): Promise<void> {
  const projectId = payloadString(payload, "projectId");
  const jobId = payloadString(payload, "jobId");

  await updateJob(jobId, {
    status: "active",
    progress: 5,
    message: "Render starting",
    log: "Render job started",
  });

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { channel: true, clips: { orderBy: { index: "asc" } } },
  });
  if (!project) {
    await updateJob(jobId, { status: "failed", message: "Project not found" });
    return;
  }
  const userId = project.channel.userId;

  const stage = async (progress: number, label: string): Promise<void> => {
    await prisma.project.update({
      where: { id: projectId },
      data: { stage: label, progress },
    });
    await updateJob(jobId, { progress, message: label, log: label });
  };

  try {
    await prisma.project.update({
      where: { id: projectId },
      data: { status: "rendering", stage: "Rendering", progress: 5, error: null },
    });

    const ffmpegOk = await hasFfmpeg();
    const script = safeJson<ScriptPlan>(project.scriptJson, {
      scenes: [],
      totalDurationSec: 0,
      voiceoverLines: [],
      musicStyle: "energetic",
    });
    const seo = safeJson<SeoPack>(project.seoJson, fallbackSeo(project.title));
    const viral = safeJson<ViralScore>(project.viralJson, emptyViral());
    const thumbs = safeJson<ThumbnailVariant[]>(project.thumbnailJson, []);
    const uploadDefaults = safeJson<{ visibility?: string }>(
      project.channel.uploadDefaultsJson,
      {},
    );
    const visibility = uploadDefaults.visibility ?? "public";

    const rendersDir = join(env.storageDir, "renders");
    const thumbsDir = join(env.storageDir, "thumbnails");
    await mkdir(rendersDir, { recursive: true });
    await mkdir(thumbsDir, { recursive: true });

    let createdCount = 0;
    const createdVideoIds: string[] = [];

    if (project.type === "clips") {
      const kept = project.clips.filter((c) => c.status === "kept");
      if (kept.length === 0) {
        await prisma.project.update({
          where: { id: projectId },
          data: { status: "review", stage: "Ready for review", progress: 100 },
        });
        await updateJob(jobId, {
          status: "failed",
          message: "No kept clips to render",
          log: "Render aborted — no clips are marked as kept",
        });
        await notify(
          userId,
          "system",
          "Render skipped",
          `${project.title}: keep at least one clip before rendering`,
        );
        return;
      }

      if (!ffmpegOk) {
        await stage(30, "Simulating render (ffmpeg not available)");
        await delay(2000);
      }

      // Real footage when the source can be fetched. Short sources download in
      // full; long VODs (Twitch streams etc.) pull only each clip's window.
      let sourcePath: string | null = null;
      let useSections = false;
      if (ffmpegOk && project.sourceUrl) {
        await stage(8, "Fetching source video");
        const durSec = await getSourceDurationSec(project.sourceUrl);
        if (durSec > 0 && durSec <= 1500) {
          sourcePath = await ensureSourceVideo(project.sourceUrl);
        } else {
          useSections = true;
        }
        if (!sourcePath && !useSections)
          log.warn(`No source video for ${projectId} — using text-style render`);
      }
      const transcriptSegments = safeJson<TranscriptSegment[]>(project.transcriptJson, []);
      const handleTag = project.channel.handle.startsWith("@")
        ? project.channel.handle
        : `@${project.channel.handle}`;

      for (let i = 0; i < kept.length; i++) {
        const clip = kept[i];
        await stage(
          10 + Math.round((i / kept.length) * 80),
          `Rendering clip ${i + 1}/${kept.length}`,
        );
        const fileName = `clip-${project.id}-${clip.id}.mp4`;
        const duration = clamp(clip.endSec - clip.startSec, 5, 60);
        let filePath: string | null = null;

        if (ffmpegOk) {
          const plan = safeJson<EditPlan>(clip.editPlanJson, defaultEditPlan(clip));
          const mergedPlan: EditPlan = { ...defaultEditPlan(clip), ...plan };
          let clipSrc = sourcePath ? { path: sourcePath, fileStartSec: 0 } : null;
          if (!clipSrc && useSections && project.sourceUrl) {
            clipSrc = await ensureSourceSection(project.sourceUrl, clip.startSec, clip.endSec);
          }
          if (clipSrc) {
            const shift = clipSrc.fileStartSec;
            await renderClipFromSource(
              {
                sourcePath: clipSrc.path,
                startSec: clip.startSec - shift,
                endSec: clip.endSec - shift,
                hook: mergedPlan.hookText || clip.hook || clip.title,
                captions: transcriptSegments
                  .filter((s) => s.endSec > clip.startSec && s.startSec < clip.endSec)
                  .map((s) => ({ startSec: s.startSec - shift, endSec: s.endSec - shift, text: s.text })),
                watermark: handleTag,
              },
              join(rendersDir, fileName),
            );
          } else {
            await renderClipVideo(
              { id: project.id, title: project.title },
              {
                id: clip.id,
                title: clip.title,
                hook: clip.hook,
                startSec: clip.startSec,
                endSec: clip.endSec,
                transcript: clip.transcript,
              },
              mergedPlan,
              join(rendersDir, fileName),
            );
          }
          filePath = `renders/${fileName}`;
        }

        const description = [clip.hook, seo.description].filter(Boolean).join("\n\n");
        const video = await prisma.video.create({
          data: {
            channelId: project.channelId,
            projectId: project.id,
            clipId: clip.id,
            title: clip.title,
            description,
            tagsJson: JSON.stringify(seo.tags),
            hashtagsJson: JSON.stringify(seo.hashtags),
            filePath,
            durationSec: duration,
            status: "ready",
            visibility,
            viralScore: clip.score,
          },
        });
        createdCount++;
        createdVideoIds.push(video.id);

        if (ffmpegOk) {
          const base = thumbs[i % Math.max(1, thumbs.length)] ?? fallbackThumbVariant(clip.title, i);
          const variant: ThumbnailVariant = { ...base, headline: clip.title.slice(0, 44) };
          const thumbName = `thumb-${video.id}.png`;
          try {
            await renderThumbnail(variant, join(thumbsDir, thumbName));
            await prisma.video.update({
              where: { id: video.id },
              data: { thumbnailPath: `thumbnails/${thumbName}` },
            });
          } catch (err) {
            log.warn(
              `Thumbnail render failed for video ${video.id}: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        }
      }
    } else {
      // wyr | top5 — single video
      const config = safeJson<Partial<WyrConfig>>(project.configJson, {});
      let renderScript = script;
      const fileName = `${project.type}-${project.id}.mp4`;
      let filePath: string | null = null;
      let footageDurationSec = 0;

      // Top-5 with fetchable source → real stitched footage countdown.
      const keptClips = project.clips.filter((c) => c.status === "kept");
      if (ffmpegOk && project.type === "top5" && project.sourceUrl && keptClips.length > 0) {
        await stage(10, "Fetching source video");
        const durSec = await getSourceDurationSec(project.sourceUrl);
        const fullSource =
          durSec > 0 && durSec <= 1500 ? await ensureSourceVideo(project.sourceUrl) : null;

        const segments = safeJson<TranscriptSegment[]>(project.transcriptJson, []);
        const ranked = [...keptClips].sort((a, b) => b.score - a.score).slice(0, 5);
        const parts = [];
        for (const [i, c] of ranked.entries()) {
          const section = fullSource
            ? null
            : await ensureSourceSection(project.sourceUrl, c.startSec, c.endSec);
          if (!fullSource && !section) continue; // skip unfetchable windows
          parts.push({
            rank: i + 1,
            title: c.title,
            startSec: c.startSec,
            endSec: c.endSec,
            captions: segments
              .filter((s) => s.endSec > c.startSec && s.startSec < c.endSec)
              .map((s) => ({ startSec: s.startSec, endSec: s.endSec, text: s.text })),
            ...(section ? { sourcePath: section.path, fileStartSec: section.fileStartSec } : {}),
          });
        }

        if (parts.length > 0) {
          await stage(35, "Cutting real footage countdown");
          const handleTag = project.channel.handle.startsWith("@")
            ? project.channel.handle
            : `@${project.channel.handle}`;
          const ctaScene = script.scenes.find((s) => s.kind === "cta");
          await renderTop5FromSource(
            fullSource,
            parts,
            ctaScene?.text ?? "Which one broke you? Subscribe!",
            handleTag,
            join(rendersDir, fileName),
          );
          filePath = `renders/${fileName}`;
          footageDurationSec =
            parts.reduce((acc, p) => acc + Math.min(p.endSec - p.startSec, 8) + 1, 0) + 2.2;
        } else {
          log.warn(`No source footage for top5 ${projectId} — using text-style render`);
        }
      }

      if (!filePath && ffmpegOk && script.scenes.length > 0) {
        // Voiceover: ElevenLabs → OpenAI TTS → Windows SAPI, or music-only.
        const branding = safeJson<Partial<Branding>>(project.channel.brandingJson, {});
        const voWorkDir = join(rendersDir, `vo-${project.id}`);
        let voice: VoiceTrack[] | undefined;
        if (script.voiceoverLines.length > 0) {
          await stage(20, "Synthesizing voiceover");
          voice =
            (await synthesizeVoiceover(script.voiceoverLines, branding.voice, voWorkDir)) ??
            undefined;
          if (!voice) log.warn(`Voiceover unavailable for ${project.id} — rendering music-only`);
        }

        // Stretch scenes to the measured speech so lines never overlap, and
        // persist the retimed script so the UI matches the final video.
        if (voice && voice.length > 0) {
          const retimed = retimeScriptToVoice(script, voice);
          renderScript = retimed.script;
          voice = retimed.tracks;
          await prisma.project.update({
            where: { id: projectId },
            data: { scriptJson: JSON.stringify(renderScript) },
          });
        }

        await stage(40, "Rendering video");
        try {
          if (project.type === "wyr") {
            const handle = project.channel.handle.startsWith("@")
              ? project.channel.handle
              : `@${project.channel.handle}`;
            const musicPath = (await ensureMusicBed()) ?? undefined;
            await renderWyrVideo(
              { id: project.id, title: project.title },
              renderScript,
              join(rendersDir, fileName),
              { voice, watermark: branding.watermarkText || handle, theme: config.theme, musicPath },
            );
          } else {
            await renderTop5Video(
              { id: project.id, title: project.title },
              renderScript,
              join(rendersDir, fileName),
              { voice },
            );
          }
        } finally {
          await cleanupVoiceover(voWorkDir);
        }
        filePath = `renders/${fileName}`;
      } else if (!filePath) {
        await stage(30, "Simulating render (ffmpeg not available)");
        await delay(2000);
      }

      await stage(70, "Saving video");
      const video = await prisma.video.create({
        data: {
          channelId: project.channelId,
          projectId: project.id,
          title: seo.title || project.title,
          description: seo.description,
          tagsJson: JSON.stringify(seo.tags),
          hashtagsJson: JSON.stringify(seo.hashtags),
          filePath,
          durationSec:
            footageDurationSec || renderScript.totalDurationSec || Number(config.lengthSec) || 30,
          status: "ready",
          visibility,
          viralScore: viral.total ?? 0,
        },
      });
      createdCount++;
      createdVideoIds.push(video.id);

      await stage(85, "Creating thumbnail");
      if (ffmpegOk) {
        const variant = thumbs[0] ?? fallbackThumbVariant(seo.title || project.title, 0);
        const thumbName = `thumb-${video.id}.png`;
        try {
          await renderThumbnail(variant, join(thumbsDir, thumbName));
          await prisma.video.update({
            where: { id: video.id },
            data: { thumbnailPath: `thumbnails/${thumbName}` },
          });
        } catch (err) {
          log.warn(
            `Thumbnail render failed for video ${video.id}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    }

    await prisma.project.update({
      where: { id: projectId },
      data: { status: "ready", stage: "Done", progress: 100 },
    });
    await updateJob(jobId, {
      status: "completed",
      progress: 100,
      message: "Render complete",
      log: `Rendered ${createdCount} video(s)`,
    });
    await notify(
      userId,
      "render.done",
      "Render complete",
      `${project.title} — ${createdCount} video(s) ready to upload`,
    );

    // Autopilot hop 2: slot freshly rendered videos into the channel's next
    // free posting times — the due-slot scanner then uploads them on schedule.
    const rule = await prisma.automationRule.findUnique({
      where: { channelId: project.channelId },
    });
    if (rule?.enabled) {
      const cfg = safeJson<{ autoApprove?: boolean }>(rule.configJson, {});
      if (cfg.autoApprove) {
        try {
          const { created } = await autoFill(userId, project.channelId, 7, createdVideoIds);
          if (created > 0) {
            await notify(
              userId,
              "system",
              "Autopilot scheduled uploads",
              `${project.title} — ${created} video(s) queued on your posting schedule`,
            );
          }
        } catch (err) {
          log.warn(
            `Autopilot auto-schedule failed for ${projectId}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error(`Render failed for project ${projectId}: ${message}`);
    await prisma.project
      .update({
        where: { id: projectId },
        data: { status: "failed", stage: "Failed", error: message },
      })
      .catch(() => undefined);
    await updateJob(jobId, { status: "failed", message, log: `Render failed: ${message}` });
    await notify(userId, "system", "Render failed", `${project.title}: ${message}`).catch(
      () => undefined,
    );
  }
}
