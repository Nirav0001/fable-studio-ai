import { Router } from "express";
import type { JobSummary } from "@fable/shared";
import { prisma } from "../../lib/prisma";
import { handler, ok } from "../../lib/respond";

const router = Router();

interface JobRow {
  id: string;
  queue: string;
  name: string;
  refType: string;
  refId: string;
  status: string;
  progress: number;
  message: string;
  createdAt: Date;
}

function toSummary(row: JobRow): JobSummary {
  return {
    id: row.id,
    queue: row.queue,
    name: row.name,
    refType: row.refType,
    refId: row.refId,
    status: row.status,
    progress: row.progress,
    message: row.message,
    createdAt: row.createdAt.toISOString(),
  };
}

// GET /jobs/active — this user's queued + running jobs (latest 12).
router.get(
  "/active",
  handler(async (req, res) => {
    const rows = await prisma.jobRecord.findMany({
      where: { userId: req.user!.id, status: { in: ["queued", "active"] } },
      orderBy: { createdAt: "desc" },
      take: 12,
    });
    ok(res, rows.map(toSummary));
  }),
);

// GET /jobs/recent — this user's latest 25 jobs across all statuses.
router.get(
  "/recent",
  handler(async (req, res) => {
    const rows = await prisma.jobRecord.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: "desc" },
      take: 25,
    });
    ok(res, rows.map(toSummary));
  }),
);

export default router;
