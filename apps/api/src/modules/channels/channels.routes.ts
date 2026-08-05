import { Router } from "express";
import { z } from "zod";
import { handler, ok } from "../../lib/respond";
import { validateBody } from "../../middleware/validate";
import {
  connectChannel,
  createChannel,
  deleteChannel,
  disconnectChannel,
  getChannelDetail,
  listChannels,
  updateChannel,
  type ChannelPatch,
} from "./channels.service";

const router = Router();

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Expected a #rrggbb hex color");
const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected HH:mm");

const voiceSchema = z.object({
  provider: z.enum(["openai", "elevenlabs", "google", "microsoft", "mock"]),
  voiceId: z.string().min(1).max(60),
  gender: z.enum(["male", "female"]),
  accent: z.string().min(1).max(40),
  energy: z.enum(["calm", "medium", "high", "hyper"]),
  emotion: z.enum(["neutral", "excited", "dramatic", "funny"]),
  /** "random" narrates each video with a different preset (seeded per video). */
  mode: z.enum(["fixed", "random"]).optional(),
});

const brandingSchema = z
  .object({
    primaryColor: hexColor,
    secondaryColor: hexColor,
    font: z.string().min(1).max(60),
    logoAssetId: z.string().max(60).optional(),
    watermarkText: z.string().max(60),
    introText: z.string().max(200),
    outroText: z.string().max(200),
    cta: z.string().max(120),
    voice: voiceSchema,
    musicStyle: z.string().max(60),
  })
  .partial();

const uploadDefaultsSchema = z
  .object({
    visibility: z.enum(["public", "unlisted", "private"]),
    category: z.string().min(1).max(10),
    madeForKids: z.boolean(),
    notifySubscribers: z.boolean(),
    language: z.string().min(2).max(10),
  })
  .partial();

const createSchema = z.object({
  name: z.string().trim().min(1).max(60),
  handle: z.string().trim().min(1).max(40),
  type: z.enum(["wyr", "clips", "top5"]),
  description: z.string().max(500).optional(),
});

const patchSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  handle: z.string().trim().min(1).max(40).optional(),
  description: z.string().max(500).optional(),
  avatarColor: hexColor.optional(),
  branding: brandingSchema.optional(),
  uploadDefaults: uploadDefaultsSchema.optional(),
  schedule: z.record(z.array(timeOfDay).max(12)).optional(),
  prompts: z.record(z.string().max(2000)).optional(),
});

router.get(
  "/",
  handler(async (req, res) => {
    ok(res, await listChannels(req.user!.id));
  }),
);

router.post(
  "/",
  validateBody(createSchema),
  handler(async (req, res) => {
    const body = req.body as z.infer<typeof createSchema>;
    ok(res, await createChannel(req.user!.id, body), 201);
  }),
);

router.get(
  "/:id",
  handler(async (req, res) => {
    ok(res, await getChannelDetail(req.user!.id, req.params.id));
  }),
);

router.patch(
  "/:id",
  validateBody(patchSchema),
  handler(async (req, res) => {
    const patch = req.body as ChannelPatch;
    ok(res, await updateChannel(req.user!.id, req.params.id, patch));
  }),
);

router.delete(
  "/:id",
  handler(async (req, res) => {
    ok(res, await deleteChannel(req.user!.id, req.params.id));
  }),
);

router.post(
  "/:id/connect",
  handler(async (req, res) => {
    ok(res, await connectChannel(req.user!.id, req.params.id));
  }),
);

router.post(
  "/:id/disconnect",
  handler(async (req, res) => {
    ok(res, await disconnectChannel(req.user!.id, req.params.id));
  }),
);

export default router;
