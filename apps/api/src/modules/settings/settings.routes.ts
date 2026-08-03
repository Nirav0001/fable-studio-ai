import bcrypt from "bcryptjs";
import { Router } from "express";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { safeJson } from "@fable/shared";
import { env } from "../../config/env";
import { hasFfmpeg, hasYtdlp, resolveAiProvider } from "../../lib/capabilities";
import { notFound } from "../../lib/errors";
import { prisma } from "../../lib/prisma";
import { activeKeys, invalidateUserKeys } from "../../lib/providerKeys";
import { handler, ok } from "../../lib/respond";
import { seal, unseal } from "../../lib/secretbox";
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
  // Per-user effective keys (their own over env fallback) via the request's
  // active key context — the matrix reflects what THIS user's work would use.
  const keys = activeKeys();
  return {
    aiProvider: resolveAiProvider(),
    ffmpeg,
    ytdlp,
    providers: {
      openai: Boolean(keys.openaiKey),
      anthropic: Boolean(keys.anthropicKey),
      gemini: Boolean(keys.geminiKey),
      elevenlabs: Boolean(keys.elevenlabsKey),
    },
    youtube: Boolean(keys.ytClientId && keys.ytClientSecret),
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

// ── Provider API keys (user-pasted, encrypted at rest) ───────────────────────

const PROVIDER_FIELDS = [
  "openaiKey",
  "anthropicKey",
  "geminiKey",
  "elevenlabsKey",
  "ytClientId",
  "ytClientSecret",
] as const;
type ProviderField = (typeof PROVIDER_FIELDS)[number];

function envFallback(field: ProviderField): string {
  switch (field) {
    case "openaiKey":
      return env.openaiKey;
    case "anthropicKey":
      return env.anthropicKey;
    case "geminiKey":
      return env.geminiKey;
    case "elevenlabsKey":
      return env.elevenlabsKey;
    case "ytClientId":
      return env.ytClientId;
    case "ytClientSecret":
      return env.ytClientSecret;
  }
}

interface ProviderKeyStatus {
  set: boolean;
  source: "user" | "env" | null;
  /** Last 4 characters of the user's own key — never more, never for env keys. */
  hint: string | null;
}

/** Masked per-key status — values themselves NEVER leave the server. */
async function providerKeySummary(
  userId: string,
): Promise<Record<ProviderField, ProviderKeyStatus>> {
  let row: Record<ProviderField, string> | null = null;
  try {
    row = (await prisma.providerCredential.findUnique({ where: { userId } })) as Record<
      ProviderField,
      string
    > | null;
  } catch {
    /* pre-migration or transient DB error — env-only view */
  }
  const summary = {} as Record<ProviderField, ProviderKeyStatus>;
  for (const field of PROVIDER_FIELDS) {
    const plain = row?.[field] ? unseal(row[field]) : "";
    if (plain) {
      summary[field] = {
        set: true,
        source: "user",
        hint: plain.length >= 8 ? `…${plain.slice(-4)}` : null,
      };
    } else if (envFallback(field)) {
      summary[field] = { set: true, source: "env", hint: null };
    } else {
      summary[field] = { set: false, source: null, hint: null };
    }
  }
  return summary;
}

// GET /settings/keys — masked status of each provider key (never the values).
router.get(
  "/keys",
  handler(async (req, res) => {
    ok(res, {
      keys: await providerKeySummary(req.user!.id),
      oauthRedirectUri: `${env.publicUrl || env.apiUrl}/api/v1/oauth/youtube/callback`,
    });
  }),
);

const keyField = z
  .string()
  .trim()
  .max(300)
  .refine((v) => v === "" || v.length >= 10, "That key looks too short");

const putKeysSchema = z.object({
  openaiKey: keyField.optional(),
  anthropicKey: keyField.optional(),
  geminiKey: keyField.optional(),
  elevenlabsKey: keyField.optional(),
  ytClientId: keyField.optional(),
  ytClientSecret: keyField.optional(),
});

// PUT /settings/keys — save/clear provider keys. "" clears; omitted = unchanged.
// Values are sealed (AES-256-GCM) before touching the database.
router.put(
  "/keys",
  validateBody(putKeysSchema),
  handler(async (req, res) => {
    const body = req.body as z.infer<typeof putKeysSchema>;
    const data: Partial<Record<ProviderField, string>> = {};
    for (const field of PROVIDER_FIELDS) {
      const value = body[field];
      if (value === undefined) continue;
      data[field] = value === "" ? "" : seal(value);
    }
    if (Object.keys(data).length > 0) {
      await prisma.providerCredential.upsert({
        where: { userId: req.user!.id },
        create: { userId: req.user!.id, ...data },
        update: data,
      });
      invalidateUserKeys(req.user!.id);
    }
    ok(res, { keys: await providerKeySummary(req.user!.id) });
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
