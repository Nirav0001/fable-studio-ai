import bcrypt from "bcryptjs";
import { Router } from "express";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { safeJson } from "@fable/shared";
import { env } from "../../config/env";
import { hasFfmpeg, hasYtdlp, resolveAiProvider } from "../../lib/capabilities";
import { notFound } from "../../lib/errors";
import { prisma } from "../../lib/prisma";
import { handler, ok } from "../../lib/respond";
import { validateBody } from "../../middleware/validate";

const router = Router();

interface ApiKeyRow {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: Date | null;
  createdAt: Date;
}

function toApiKey(row: ApiKeyRow) {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

async function integrationFlags() {
  const [ffmpeg, ytdlp] = await Promise.all([hasFfmpeg(), hasYtdlp()]);
  return {
    aiProvider: resolveAiProvider(),
    ffmpeg,
    ytdlp,
    providers: {
      openai: Boolean(env.openaiKey),
      anthropic: Boolean(env.anthropicKey),
      gemini: Boolean(env.geminiKey),
      elevenlabs: Boolean(env.elevenlabsKey),
    },
    youtube: Boolean(env.ytClientId && env.ytClientSecret),
    stripe: Boolean(env.stripeSecretKey),
    discord: Boolean(env.discordWebhookUrl),
    redis: Boolean(env.redisUrl),
    storage: env.r2.accessKeyId ? ("r2" as const) : ("local" as const),
  };
}

// GET /settings — profile + preferences + api keys + integration capability flags.
router.get(
  "/",
  handler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) throw notFound("User");
    const [apiKeys, integrations] = await Promise.all([
      prisma.apiKey.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
      }),
      integrationFlags(),
    ]);
    ok(res, {
      user: { name: user.name, email: user.email, plan: user.plan },
      preferences: safeJson<Record<string, unknown>>(user.preferencesJson, {}),
      apiKeys: apiKeys.map(toApiKey),
      integrations,
    });
  }),
);

const patchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  preferences: z.record(z.unknown()).optional(),
});

// PATCH /settings — update name and/or merge preferences.
router.patch(
  "/",
  validateBody(patchSchema),
  handler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) throw notFound("User");
    const body = req.body as z.infer<typeof patchSchema>;
    const mergedPrefs =
      body.preferences !== undefined
        ? { ...safeJson<Record<string, unknown>>(user.preferencesJson, {}), ...body.preferences }
        : undefined;
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(mergedPrefs !== undefined ? { preferencesJson: JSON.stringify(mergedPrefs) } : {}),
      },
    });
    ok(res, {
      user: { name: updated.name, email: updated.email, plan: updated.plan },
      preferences: safeJson<Record<string, unknown>>(updated.preferencesJson, {}),
    });
  }),
);

// POST /settings/api-keys — create a key; the full key is returned exactly once.
router.post(
  "/api-keys",
  validateBody(z.object({ name: z.string().trim().min(1).max(60) })),
  handler(async (req, res) => {
    const fullKey = `fable_sk_${randomBytes(16).toString("hex")}`;
    const prefix = fullKey.slice(0, 12);
    const keyHash = bcrypt.hashSync(fullKey, 10);
    const created = await prisma.apiKey.create({
      data: {
        userId: req.user!.id,
        name: req.body.name as string,
        prefix,
        keyHash,
      },
    });
    ok(
      res,
      {
        id: created.id,
        name: created.name,
        prefix: created.prefix,
        key: fullKey, // shown once — only the bcrypt hash is stored
        createdAt: created.createdAt.toISOString(),
      },
      201,
    );
  }),
);

// DELETE /settings/api-keys/:id — revoke.
router.delete(
  "/api-keys/:id",
  handler(async (req, res) => {
    const existing = await prisma.apiKey.findFirst({
      where: { id: req.params.id, userId: req.user!.id },
    });
    if (!existing) throw notFound("API key");
    await prisma.apiKey.delete({ where: { id: existing.id } });
    ok(res, { deleted: true });
  }),
);

export default router;
