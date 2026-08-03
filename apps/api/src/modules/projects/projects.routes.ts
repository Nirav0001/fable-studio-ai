// ── /api/v1/projects ─────────────────────────────────────────────────────────
// Thin HTTP layer over projects.service — validation via zod, ownership and
// state rules enforced in the service.

import { Router } from "express";
import { z } from "zod";
import { handler, ok } from "../../lib/respond";
import { validateBody } from "../../middleware/validate";
import { heavyJobLimiter } from "../../middleware/rateLimit";
import {
  approveProject,
  createProject,
  deleteProject,
  getProjectDetail,
  listProjects,
  regenerateProject,
  renderProject,
  setClipStatus,
  updateProject,
} from "./projects.service";

const router = Router();

// ── GET /projects?channelId=&status=&type= ───────────────────────────────────

router.get(
  "/",
  handler(async (req, res) => {
    const channelId = typeof req.query.channelId === "string" ? req.query.channelId : undefined;
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const type = typeof req.query.type === "string" ? req.query.type : undefined;
    ok(res, await listProjects(req.user!.id, { channelId, status, type }));
  }),
);

// ── POST /projects ───────────────────────────────────────────────────────────

const createSchema = z.object({
  channelId: z.string().min(1),
  type: z.enum(["wyr", "clips", "top5"]),
  title: z.string().trim().max(160).optional(),
  config: z.record(z.unknown()).default({}),
  sourceUrl: z.string().trim().url().max(500).optional(),
});

router.post(
  "/",
  heavyJobLimiter,
  validateBody(createSchema),
  handler(async (req, res) => {
    const body = req.body as z.infer<typeof createSchema>;
    const project = await createProject(req.user!.id, body);
    ok(res, project, 201);
  }),
);

// ── GET /projects/:id ────────────────────────────────────────────────────────

router.get(
  "/:id",
  handler(async (req, res) => {
    ok(res, await getProjectDetail(req.user!.id, req.params.id));
  }),
);

// ── PATCH /projects/:id ──────────────────────────────────────────────────────

const patchSchema = z
  .object({
    title: z.string().trim().min(1).max(160).optional(),
    seo: z.record(z.unknown()).optional(),
    script: z.record(z.unknown()).optional(),
  })
  .refine((v) => v.title !== undefined || v.seo !== undefined || v.script !== undefined, {
    message: "Provide at least one of title, seo or script",
  });

router.patch(
  "/:id",
  validateBody(patchSchema),
  handler(async (req, res) => {
    const body = req.body as z.infer<typeof patchSchema>;
    ok(res, await updateProject(req.user!.id, req.params.id, body));
  }),
);

// ── POST /projects/:id/generate ──────────────────────────────────────────────

router.post(
  "/:id/generate",
  heavyJobLimiter,
  handler(async (req, res) => {
    ok(res, await regenerateProject(req.user!.id, req.params.id));
  }),
);

// ── POST /projects/:id/render ────────────────────────────────────────────────

router.post(
  "/:id/render",
  heavyJobLimiter,
  handler(async (req, res) => {
    ok(res, await renderProject(req.user!.id, req.params.id));
  }),
);

// ── POST /projects/:id/approve ───────────────────────────────────────────────

const approveSchema = z.object({ schedule: z.boolean().default(false) });

router.post(
  "/:id/approve",
  validateBody(approveSchema),
  handler(async (req, res) => {
    const { schedule } = req.body as z.infer<typeof approveSchema>;
    ok(res, await approveProject(req.user!.id, req.params.id, schedule));
  }),
);

// ── DELETE /projects/:id ─────────────────────────────────────────────────────

router.delete(
  "/:id",
  handler(async (req, res) => {
    ok(res, await deleteProject(req.user!.id, req.params.id));
  }),
);

// ── PATCH /projects/:id/clips/:clipId ────────────────────────────────────────

const clipSchema = z.object({ status: z.enum(["kept", "discarded"]) });

router.patch(
  "/:id/clips/:clipId",
  validateBody(clipSchema),
  handler(async (req, res) => {
    const { status } = req.body as z.infer<typeof clipSchema>;
    ok(res, await setClipStatus(req.user!.id, req.params.id, req.params.clipId, status));
  }),
);

export default router;
