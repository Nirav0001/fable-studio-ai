import { Router } from "express";
import { z } from "zod";
import { SLOT_STATUSES } from "@fable/shared";
import { badRequest } from "../../lib/errors";
import { handler, ok } from "../../lib/respond";
import { validateBody } from "../../middleware/validate";
import {
  autoFill,
  createSlot,
  deleteSlot,
  getSuggestions,
  listSlots,
  updateSlot,
  type SlotPatch,
} from "./schedule.service";

const router = Router();

const DAY_MS = 86_400_000;

const createSchema = z.object({
  channelId: z.string().min(1),
  videoId: z.string().min(1).optional(),
  scheduledAt: z.coerce.date(),
});

const patchSchema = z.object({
  scheduledAt: z.coerce.date().optional(),
  status: z.enum(SLOT_STATUSES).optional(),
  videoId: z.string().min(1).nullable().optional(),
});

const autoFillSchema = z.object({
  channelId: z.string().min(1),
  days: z.number().int().min(1).max(31).default(7),
});

function parseDateParam(value: unknown, fallback: Date): Date {
  if (typeof value !== "string" || value === "") return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw badRequest(`Invalid date: ${value}`);
  return date;
}

router.get(
  "/",
  handler(async (req, res) => {
    const now = new Date();
    const from = parseDateParam(req.query.from, new Date(now.getTime() - DAY_MS));
    const to = parseDateParam(req.query.to, new Date(now.getTime() + 7 * DAY_MS));
    if (from > to) throw badRequest("`from` must be before `to`");
    const channelId = typeof req.query.channelId === "string" ? req.query.channelId : undefined;
    ok(res, await listSlots(req.user!.id, { from, to, channelId }));
  }),
);

// Registered before the generic param routes so "suggestions" is never treated as an id.
router.get(
  "/suggestions",
  handler(async (req, res) => {
    const channelId = typeof req.query.channelId === "string" ? req.query.channelId : "";
    if (!channelId) throw badRequest("channelId query parameter is required");
    ok(res, await getSuggestions(req.user!.id, channelId));
  }),
);

router.post(
  "/",
  validateBody(createSchema),
  handler(async (req, res) => {
    const body = req.body as z.infer<typeof createSchema>;
    ok(res, await createSlot(req.user!.id, body), 201);
  }),
);

router.patch(
  "/:id",
  validateBody(patchSchema),
  handler(async (req, res) => {
    const patch = req.body as SlotPatch;
    ok(res, await updateSlot(req.user!.id, req.params.id, patch));
  }),
);

router.delete(
  "/:id",
  handler(async (req, res) => {
    ok(res, await deleteSlot(req.user!.id, req.params.id));
  }),
);

router.post(
  "/auto-fill",
  validateBody(autoFillSchema),
  handler(async (req, res) => {
    const body = req.body as z.infer<typeof autoFillSchema>;
    ok(res, await autoFill(req.user!.id, body.channelId, body.days));
  }),
);

export default router;
