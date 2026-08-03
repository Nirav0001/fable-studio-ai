import {
  QUEUE_JOBS,
  SHORT_LENGTHS,
  WYR_DIFFICULTIES,
  safeJson,
} from "@fable/shared";
import type {
  ChannelType,
  ClipsConfig,
  EditPlan,
  ScoreBreakdown,
  ScriptPlan,
  Top5Config,
  TranscriptSegment,
  WyrConfig,
  WyrDifficulty,
} from "@fable/shared";
import { createLogger } from "../../lib/logger";
import { prisma } from "../../lib/prisma";
import { assertSafeSourceUrl } from "../../lib/security";
import { notify } from "../../modules/notifications/notify";
import {
  buildWyrScript,
  generateWyrQuestions,
  markQuestionsUsed,
} from "../../services/generators/wyr";
import { generateSeoPack } from "../../services/generators/seo";
import { scoreVirality } from "../../services/generators/viral";
import { generateThumbnailVariants } from "../../services/generators/thumbs";
import { getTranscript } from "../../services/generators/transcript";
import {
  buildClipEditPlan,
  buildTop5Script,
  detectMoments,
  pickTop5Funniest,
} from "../../services/generators/clipDetect";
import { estimateCost } from "../../services/generators/cost";
import { enqueue, payloadString, updateJob } from "../queue";
import type { JobPayload } from "../queue";

const log = createLogger("generate");

/** Shape produced by the clip detector for a scored moment. */
interface Moment {
  title: string;
  hook: string;
  startSec: number;
  endSec: number;
  score: number;
  breakdown: ScoreBreakdown;
  transcript: string;
}

const STAGE_PAUSE_MS = 400;

function pause(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, STAGE_PAUSE_MS));
}

function normalizeWyrConfig(raw: Partial<WyrConfig>): WyrConfig {
  const difficulty: WyrDifficulty = WYR_DIFFICULTIES.includes(raw.difficulty as WyrDifficulty)
    ? (raw.difficulty as WyrDifficulty)
    : "medium";
  const lengthSec = (SHORT_LENGTHS as readonly number[]).includes(Number(raw.lengthSec))
    ? (Number(raw.lengthSec) as WyrConfig["lengthSec"])
    : 30;
  return {
    difficulty,
    theme: typeof raw.theme === "string" && raw.theme ? raw.theme : "random",
    lengthSec,
    questionCount: Math.min(10, Math.max(1, Math.floor(Number(raw.questionCount ?? 5)))),
  };
}

function normalizeClipsConfig(raw: Partial<ClipsConfig>, sourceUrl: string): ClipsConfig {
  return {
    sourceUrl: raw.sourceUrl || sourceUrl,
    clipCount: [5, 10, 20].includes(Number(raw.clipCount))
      ? (Number(raw.clipCount) as ClipsConfig["clipCount"])
      : 5,
    minScore: Math.min(95, Math.max(0, Math.floor(Number(raw.minScore ?? 70)))),
    captionStyle: raw.captionStyle || "beast",
    addMemes: raw.addMemes !== false,
  };
}

function normalizeTop5Config(raw: Partial<Top5Config>, sourceUrl: string): Top5Config {
  return {
    sourceUrl: raw.sourceUrl || sourceUrl,
    countdownFrom: Math.min(10, Math.max(3, Math.floor(Number(raw.countdownFrom ?? 5)))),
    captionStyle: raw.captionStyle || "beast",
  };
}

/**
 * Full generation pipeline: source analysis → script → SEO → viral score →
 * thumbnails → cost estimate. Progress is mirrored on both the Project row
 * (stage/progress) and the JobRecord so the UI can poll either.
 */
export async function processGenerate(payload: JobPayload): Promise<void> {
  const projectId = payloadString(payload, "projectId");
  const jobId = payloadString(payload, "jobId");

  await updateJob(jobId, {
    status: "active",
    progress: 5,
    message: "Generation starting",
    log: "Generation job started",
  });

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { channel: true },
  });
  if (!project) {
    await updateJob(jobId, { status: "failed", message: "Project not found" });
    return;
  }

  const channel = project.channel;
  const userId = channel.userId;
  const channelType = channel.type as ChannelType;

  const stage = async (progress: number, label: string): Promise<void> => {
    await prisma.project.update({
      where: { id: projectId },
      data: { stage: label, progress },
    });
    await updateJob(jobId, { progress, message: label, log: label });
    await pause();
  };

  try {
    await prisma.project.update({
      where: { id: projectId },
      data: { status: "generating", error: null, progress: 5, stage: "Starting" },
    });

    await stage(10, "Analyzing source");

    let script: ScriptPlan | null = null;
    let durationSec = 30;
    let contextText = "";
    let unitCount = 0;

    if (project.type === "wyr") {
      const config = normalizeWyrConfig(safeJson<Partial<WyrConfig>>(project.configJson, {}));
      const questions = await generateWyrQuestions(
        userId,
        channel.id,
        config.theme,
        config.difficulty,
        config.questionCount,
      );
      if (!questions.length) throw new Error("No unique questions could be generated");

      await stage(25, "Writing script");
      script = buildWyrScript(questions, config);
      const usedIds = questions
        .map((q) => q.id)
        .filter((id): id is string => typeof id === "string" && id.length > 0);
      if (usedIds.length) await markQuestionsUsed(usedIds, project.id);

      durationSec = script.totalDurationSec || config.lengthSec;
      unitCount = questions.length;
      contextText = `Would-you-rather quiz, theme "${config.theme}", difficulty ${config.difficulty}, ${questions.length} questions`;
      await prisma.project.update({
        where: { id: projectId },
        data: { scriptJson: JSON.stringify(script) },
      });
    } else {
      const rawConfig = safeJson<Record<string, unknown>>(project.configJson, {});
      const candidate =
        project.sourceUrl ||
        (typeof rawConfig.sourceUrl === "string" ? rawConfig.sourceUrl : "");
      // Re-validate before any yt-dlp/ffmpeg spawn — covers projects created
      // outside the API route (automation) as well as stored values.
      const sourceUrl = candidate
        ? assertSafeSourceUrl(candidate)
        : "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

      const transcript: TranscriptSegment[] = await getTranscript(sourceUrl);
      await prisma.project.update({
        where: { id: projectId },
        data: { transcriptJson: JSON.stringify(transcript) },
      });
      contextText = transcript
        .slice(0, 6)
        .map((s) => s.text)
        .join(" ")
        .slice(0, 240);

      await stage(25, "Writing script");
      // Re-generation should replace previous candidates.
      await prisma.clip.deleteMany({ where: { projectId } });

      if (project.type === "clips") {
        const config = normalizeClipsConfig(
          safeJson<Partial<ClipsConfig>>(project.configJson, {}),
          sourceUrl,
        );
        const moments = (await detectMoments(transcript, {
          count: config.clipCount,
          minScore: config.minScore,
        })) as unknown as Moment[];
        if (!moments.length) throw new Error("No clip-worthy moments detected in the source");
        // Never hard-fail on a quiet source: when nothing clears the bar, keep
        // the best three anyway and let review (or the viral gate) decide.
        const bestByScore = [...moments].sort((a, b) => b.score - a.score);
        const keepFloor = bestByScore.every((m) => m.score < config.minScore)
          ? new Set(bestByScore.slice(0, 3).map((m) => m))
          : null;

        let kept = 0;
        for (const [i, moment] of moments.entries()) {
          const isKept = keepFloor ? keepFloor.has(moment) : moment.score >= config.minScore;
          if (isKept) kept++;
          const plan = (await buildClipEditPlan(moment, config)) as unknown as EditPlan;
          await prisma.clip.create({
            data: {
              projectId,
              index: i,
              title: moment.title,
              hook: moment.hook,
              startSec: moment.startSec,
              endSec: moment.endSec,
              score: Math.round(moment.score),
              scoreJson: JSON.stringify(moment.breakdown ?? {}),
              transcript: moment.transcript,
              status: isKept ? "kept" : "candidate",
              editPlanJson: JSON.stringify(plan),
            },
          });
        }
        unitCount = moments.length;
        const keptMoments = moments.filter((m) => m.score >= config.minScore);
        const avgLen = keptMoments.length
          ? keptMoments.reduce((a, m) => a + (m.endSec - m.startSec), 0) / keptMoments.length
          : 30;
        durationSec = Math.round(Math.min(60, Math.max(10, avgLen)));
        log.info(`Detected ${moments.length} moments (${kept} kept) for project ${projectId}`);
      } else {
        const config = normalizeTop5Config(
          safeJson<Partial<Top5Config>>(project.configJson, {}),
          sourceUrl,
        );
        const moments = (await pickTop5Funniest(transcript)) as unknown as Moment[];
        if (!moments.length) throw new Error("No funny moments detected in the source");

        for (const [i, moment] of moments.entries()) {
          await prisma.clip.create({
            data: {
              projectId,
              index: i,
              title: moment.title,
              hook: moment.hook,
              startSec: moment.startSec,
              endSec: moment.endSec,
              score: Math.round(moment.score),
              scoreJson: JSON.stringify(moment.breakdown ?? {}),
              transcript: moment.transcript,
              status: "kept",
              editPlanJson: JSON.stringify({}),
            },
          });
        }
        script = (await buildTop5Script(moments, config)) as unknown as ScriptPlan;
        durationSec = script.totalDurationSec || 45;
        unitCount = moments.length;
        await prisma.project.update({
          where: { id: projectId },
          data: { scriptJson: JSON.stringify(script) },
        });
      }
    }

    await stage(45, "Generating SEO");
    const seo = await generateSeoPack({
      title: project.title,
      context: contextText,
      channelType,
    });

    await stage(60, "Scoring virality");
    const viral = await scoreVirality({
      title: seo.title || project.title,
      description: seo.description,
      channelType,
      durationSec,
    });

    await stage(75, "Designing thumbnails");
    const thumbnails = await generateThumbnailVariants({
      title: seo.title || project.title,
      channelType,
      count: 4,
    });

    await stage(90, "Estimating cost");
    const ttsChars = script
      ? script.voiceoverLines.reduce((acc, line) => acc + line.text.length, 0)
      : 400;
    const llmTokens = 1800 + 350 * Math.max(unitCount, script?.scenes.length ?? 0);
    const cost = estimateCost({
      llmTokens,
      ttsChars,
      renderMinutes: Math.max(0.5, durationSec / 60),
    });

    await prisma.project.update({
      where: { id: projectId },
      data: {
        status: "review",
        stage: "Ready for review",
        progress: 100,
        title: project.title || seo.title,
        seoJson: JSON.stringify(seo),
        viralJson: JSON.stringify(viral),
        thumbnailJson: JSON.stringify(thumbnails),
        costJson: JSON.stringify(cost),
      },
    });
    await updateJob(jobId, {
      status: "completed",
      progress: 100,
      message: "Ready for review",
      log: "Generation complete",
    });
    await notify(
      userId,
      "system",
      "Generation complete",
      `"${seo.title || project.title}" is ready for review`,
    );

    // Autopilot hop 1: when the channel's automation rule auto-approves and
    // the viral score clears the bar, go straight to rendering.
    const rule = await prisma.automationRule.findUnique({ where: { channelId: project.channelId } });
    if (rule?.enabled) {
      const cfg = safeJson<{ autoApprove?: boolean; minViralScore?: number }>(rule.configJson, {});
      const minScore = Number(cfg.minViralScore ?? 0);
      if (cfg.autoApprove) {
        if (viral.total >= minScore) {
          await prisma.project.update({
            where: { id: projectId },
            data: { status: "rendering", stage: "Autopilot: rendering", progress: 0 },
          });
          await enqueue(QUEUE_JOBS.PROJECT_RENDER, { projectId, channelId: project.channelId });
          log.info(`Autopilot: project ${projectId} (score ${viral.total}) sent to render`);
        } else {
          await notify(
            userId,
            "system",
            "Autopilot held a video for review",
            `"${seo.title || project.title}" scored ${viral.total} — below your ${minScore} bar`,
          );
        }
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error(`Generation failed for project ${projectId}: ${message}`);
    await prisma.project
      .update({
        where: { id: projectId },
        data: { status: "failed", stage: "Failed", error: message },
      })
      .catch(() => undefined);
    await updateJob(jobId, {
      status: "failed",
      message,
      log: `Generation failed: ${message}`,
    });
    await notify(userId, "system", "Generation failed", `${project.title}: ${message}`).catch(
      () => undefined,
    );
  }
}
