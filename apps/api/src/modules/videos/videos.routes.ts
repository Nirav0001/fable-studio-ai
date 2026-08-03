import { Router } from "express";
import { z } from "zod";
import { VIDEO_STATUSES } from "@fable/shared";
import { badRequest } from "../../lib/errors";
import { handler, ok } from "../../lib/respond";
import { validateBody } from "../../middleware/validate";
import {
  createAbTest,
  deleteVideo,
  getVideoDetail,
  listVideos,
  repostVideo,
  updateVideo,
  uploadVideoNow,
  type VideoPatch,
} from "./videos.service";

const router = Router();

const patchSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  description: z.string().max(5000).optional(),
  tags: z.array(z.string().trim().min(1).max(60)).max(30).optional(),
  hashtags: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
  visibility: z.enum(["public", "unlisted", "private"]).optional(),
  status: z.enum(VIDEO_STATUSES).optional(),
});

const abTestSchema = z.object({
  kind: z.enum(["thumbnail", "title"]),
  variants: z.array(z.string().trim().min(1).max(160)).min(2).max(5),
});

router.get(
  "/",
  handler(async (req, res) => {
    const channelId = typeof req.query.channelId === "string" ? req.query.channelId : undefined;
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    if (status && !(VIDEO_STATUSES as readonly string[]).includes(status)) {
      throw badRequest(`Invalid status filter: ${status}`);
    }
    ok(res, await listVideos(req.user!.id, { channelId, status }));
  }),
);

router.get(
  "/:id",
  handler(async (req, res) => {
    ok(res, await getVideoDetail(req.user!.id, req.params.id));
  }),
);

router.patch(
  "/:id",
  validateBody(patchSchema),
  handler(async (req, res) => {
    const patch = req.body as VideoPatch;
    ok(res, await updateVideo(req.user!.id, req.params.id, patch));
  }),
);

router.post(
  "/:id/upload",
  handler(async (req, res) => {
    ok(res, await uploadVideoNow(req.user!.id, req.params.id));
  }),
);

router.delete(
  "/:id",
  handler(async (req, res) => {
    ok(res, await deleteVideo(req.user!.id, req.params.id));
  }),
);

router.post(
  "/:id/abtest",
  validateBody(abTestSchema),
  handler(async (req, res) => {
    const body = req.body as z.infer<typeof abTestSchema>;
    ok(res, await createAbTest(req.user!.id, req.params.id, body.kind, body.variants));
  }),
);

router.post(
  "/:id/repost",
  handler(async (req, res) => {
    ok(res, await repostVideo(req.user!.id, req.params.id));
  }),
);

export default router;
