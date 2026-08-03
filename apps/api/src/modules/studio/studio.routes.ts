import { Router } from "express";
import { COST_RATES, QUEUE_JOBS, safeJson } from "@fable/shared";
import { prisma } from "../../lib/prisma";
import { handler, ok } from "../../lib/respond";
import { getUsage } from "../../services/ai";

const router = Router();

export type StudioAgentKey = "writer" | "voice" | "render" | "upload" | "analyst";

interface StudioAgent {
  key: StudioAgentKey;
  status: "idle" | "working" | "queued";
  task: string | null;
  progress: number | null;
}

interface StudioLogLine {
  atMs: number;
  agent: StudioAgentKey | "system";
  job: string;
  line: string;
}

function agentForJob(name: string, message: string): StudioAgentKey {
  if (name === QUEUE_JOBS.VIDEO_UPLOAD) return "upload";
  if (name === QUEUE_JOBS.PROJECT_RENDER) {
    return /voiceover/i.test(message) ? "voice" : "render";
  }
  return "writer";
}

/** Live mission-control state: agent stations, real logs, real spend. */
router.get(
  "/state",
  handler(async (req, res) => {
    const userId = req.user!.id;
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);

    const [activeJobs, recentJobs, uploadsToday, rendersToday, generatedToday, queueDepth] =
      await Promise.all([
        prisma.jobRecord.findMany({
          where: { userId, status: "active" },
          orderBy: { createdAt: "desc" },
          take: 10,
        }),
        prisma.jobRecord.findMany({
          where: { userId },
          orderBy: { createdAt: "desc" },
          take: 18,
        }),
        prisma.video.count({
          where: {
            channel: { userId },
            status: "published",
            publishedAt: { gte: dayStart },
            NOT: { youtubeId: { startsWith: "mock-" } },
          },
        }),
        prisma.video.count({
          where: { channel: { userId }, createdAt: { gte: dayStart } },
        }),
        prisma.project.count({
          where: { channel: { userId }, createdAt: { gte: dayStart } },
        }),
        prisma.jobRecord.count({ where: { userId, status: "queued" } }),
      ]);

    // Agent stations derived from what's actually running.
    const agents: StudioAgent[] = (
      ["writer", "voice", "render", "upload", "analyst"] as StudioAgentKey[]
    ).map((key) => ({ key, status: "idle", task: null, progress: null }));
    const byKey = new Map(agents.map((a) => [a.key, a]));
    for (const job of activeJobs) {
      const agent = byKey.get(agentForJob(job.name, job.message));
      if (agent && agent.status !== "working") {
        agent.status = "working";
        agent.task = job.message || job.name;
        agent.progress = job.progress;
      }
    }
    const analyst = byKey.get("analyst")!;
    analyst.task = "Live stats sync every 30 min";

    // Real log stream: merge timestamped lines from recent jobs.
    const logs: StudioLogLine[] = [];
    for (const job of recentJobs) {
      const agent = agentForJob(job.name, job.message);
      for (const raw of safeJson<string[]>(job.logsJson, [])) {
        const match = /^\[([^\]]+)\]\s*(.*)$/.exec(raw);
        const atMs = match ? Date.parse(match[1]) : job.createdAt.getTime();
        logs.push({
          atMs: Number.isFinite(atMs) ? atMs : job.createdAt.getTime(),
          agent,
          job: job.name,
          line: match ? match[2] : raw,
        });
      }
    }
    logs.sort((a, b) => a.atMs - b.atMs);

    // Real spend: blended token counter (LLM + TTS chars/4) since server start.
    const tokens = getUsage();
    const estCostGbp = (tokens / 1000) * COST_RATES.llmPer1kTokensGbp;

    ok(res, {
      agents,
      logs: logs.slice(-60),
      usage: {
        tokens,
        estCostGbp: Math.round(estCostGbp * 10000) / 10000,
        sinceLabel: "since server start",
      },
      counters: {
        generatedToday,
        rendersToday,
        uploadsToday,
        uploadQuota: 6,
        queueDepth,
      },
    });
  }),
);

export default router;
