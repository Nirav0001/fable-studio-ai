import { Router } from "express";
import { z } from "zod";
import type { NotificationT } from "@fable/shared";
import { notFound } from "../../lib/errors";
import { prisma } from "../../lib/prisma";
import { handler, ok } from "../../lib/respond";
import { validateBody } from "../../middleware/validate";

const router = Router();

function toNotification(row: {
  id: string;
  kind: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: Date;
}): NotificationT {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    read: row.read,
    createdAt: row.createdAt.toISOString(),
  };
}

// GET /notifications — latest 50 for the current user.
router.get(
  "/",
  handler(async (req, res) => {
    const rows = await prisma.notification.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    ok(res, rows.map(toNotification));
  }),
);

// POST /notifications/read-all — mark everything read.
router.post(
  "/read-all",
  handler(async (req, res) => {
    const result = await prisma.notification.updateMany({
      where: { userId: req.user!.id, read: false },
      data: { read: true },
    });
    ok(res, { updated: result.count });
  }),
);

// PATCH /notifications/:id — toggle read state.
router.patch(
  "/:id",
  validateBody(z.object({ read: z.boolean() })),
  handler(async (req, res) => {
    const existing = await prisma.notification.findFirst({
      where: { id: req.params.id, userId: req.user!.id },
    });
    if (!existing) throw notFound("Notification");
    const updated = await prisma.notification.update({
      where: { id: existing.id },
      data: { read: req.body.read as boolean },
    });
    ok(res, toNotification(updated));
  }),
);

export default router;
