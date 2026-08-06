// External ingest (clip-engine M5) — key-authed push of finished clips.
//
// Mounted BEFORE requireAuth in app.ts (plan amendment A9 / ED6): callers
// authenticate with a per-user API key (Settings → API keys), never the
// session cookie. Videos land as status "draft" (A2) — drafts are NEVER
// swept into the posting schedule by autoFill; a human promotes them in the
// dashboard. Media files live under STORAGE_DIR/external/ and are pruned by
// the daily tick in queue/prune.ts (A4/ED17).

import bcrypt from "bcryptjs";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import multer from "multer";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { unlink } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { z } from "zod";
import { env } from "../../config/env";
import { AppError, badRequest, conflict, forbidden, notFound, unauthorized } from "../../lib/errors";
import { createLogger } from "../../lib/logger";
import { prisma } from "../../lib/prisma";
import { handler, ok } from "../../lib/respond";
import { heavyJobLimiter } from "../../middleware/rateLimit";

const log = createLogger("external");
const router = Router();

// ── API-key auth (Authorization: Bearer fable_sk_…) ──────────────────────────

/** Must mirror issuance in settings.routes.ts: `fable_sk_` + 32 hex chars,
 *  prefix = first 12 chars stored in plaintext for lookup, bcrypt hash for
 *  verification. */
const KEY_SCHEME = "fable_sk_";
const KEY_PREFIX_LEN = 12;

async function requireApiKey(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization ?? "";
    const [scheme, token] = header.split(/\s+/);
    if (!token || scheme.toLowerCase() !== "bearer" || !token.startsWith(KEY_SCHEME)) {
      return next(
        unauthorized("Missing or malformed API key — send `Authorization: Bearer fable_sk_…`"),
      );
    }
    // Prefix narrows the candidate set; bcrypt compare proves possession.
    const candidates = await prisma.apiKey.findMany({
      where: { prefix: token.slice(0, KEY_PREFIX_LEN) },
      include: { user: true },
    });
    for (const key of candidates) {
      if (await bcrypt.compare(token, key.keyHash)) {
        await prisma.apiKey
          .update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })
          .catch(() => undefined);
        req.user = {
          id: key.user.id,
          email: key.user.email,
          name: key.user.name,
          plan: key.user.plan,
        };
        return next();
      }
    }
    next(unauthorized("Invalid API key"));
  } catch (err) {
    next(err);
  }
}

// ── Upload storage (STORAGE_DIR/external, mp4 only, 200MB cap) ───────────────

const MAX_UPLOAD_BYTES = 200 * 1024 * 1024; // 200MB

const externalDir = join(env.storageDir, "external");
if (!existsSync(externalDir)) mkdirSync(externalDir, { recursive: true });

/** Strip any path components and unsafe characters; keep a readable stem + extension. */
function sanitizeFilename(original: string): string {
  const base = basename(original || "clip.mp4");
  const ext = extname(base).toLowerCase().replace(/[^a-z0-9.]/g, "").slice(0, 12);
  const stem = base
    .slice(0, base.length - extname(base).length)
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 60);
  return `${stem || "clip"}${ext || ".mp4"}`;
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, externalDir),
  filename: (_req, file, cb) => cb(null, `${randomUUID()}-${sanitizeFilename(file.originalname)}`),
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    const mime = file.mimetype.toLowerCase();
    const ext = extname(file.originalname).toLowerCase();
    // mp4 only — the clip-engine delivers finished H.264 mp4s. Generic
    // octet-stream is accepted when the filename says .mp4 (curl et al.).
    if (mime !== "video/mp4" && !(mime === "application/octet-stream" && ext === ".mp4")) {
      cb(new AppError("Only .mp4 video uploads are accepted", 400, "UNSUPPORTED_MEDIA"));
      return;
    }
    cb(null, true);
  },
});

// ── Payload validation ───────────────────────────────────────────────────────

const CLIENT_REF_RE = /^[A-Za-z0-9_-]{1,64}$/;

/** Multipart fields arrive as strings — coerce "true"/"1"/"yes" to boolean. */
const boolishField = z.preprocess((v) => {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return ["true", "1", "yes"].includes(v.trim().toLowerCase());
  return false;
}, z.boolean());

/** Tags: JSON array string, comma-separated string, or repeated fields. */
const tagsField = z.preprocess(
  (v) => {
    if (Array.isArray(v)) return v;
    if (typeof v !== "string" || v.trim() === "") return [];
    try {
      const parsed: unknown = JSON.parse(v);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      /* not JSON — fall through to comma-separated */
    }
    return v.split(",");
  },
  z
    .array(z.string().trim().min(1).max(60))
    .max(30),
);

const ingestSchema = z.object({
  clientRef: z
    .string()
    .regex(CLIENT_REF_RE, "clientRef must match ^[A-Za-z0-9_-]{1,64}$"),
  channelId: z.string().trim().min(1),
  title: z.string().trim().min(1).max(120),
  description: z.string().max(5000).optional().default(""),
  tags: tagsField.optional().default([]),
  aiDisclosure: boolishField.optional().default(false),
  attribution: z.string().trim().min(1).max(500).optional(),
});

// ── POST /external/clips — ingest one finished clip as a draft ──────────────

router.post(
  "/clips",
  requireApiKey,
  heavyJobLimiter,
  upload.single("file"),
  handler(async (req, res) => {
    const file = req.file;
    const discard = async () => {
      if (file) await unlink(file.path).catch(() => undefined);
    };

    const parsed = ingestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      await discard();
      throw badRequest("Invalid ingest payload", parsed.error.flatten());
    }
    const body = parsed.data;

    // Channel must exist AND belong to the key's user — loud 404/403.
    const channel = await prisma.channel.findUnique({ where: { id: body.channelId } });
    if (!channel) {
      await discard();
      throw notFound("Channel");
    }
    if (channel.userId !== req.user!.id) {
      await discard();
      throw forbidden("Channel belongs to a different account");
    }

    // Idempotency: a replayed clientRef returns the existing row (200, not 409).
    const existing = await prisma.video.findUnique({
      where: { clientRef: body.clientRef },
      include: { channel: { select: { userId: true } } },
    });
    if (existing) {
      await discard();
      if (existing.channel.userId !== req.user!.id) {
        // Never leak another account's video id through a ref collision.
        throw conflict("clientRef is already in use");
      }
      ok(res, { id: existing.id, duplicate: true, status: existing.status });
      return;
    }

    if (!file) {
      throw badRequest('No media received — send a multipart form with a "file" field');
    }

    try {
      const video = await prisma.video.create({
        data: {
          channelId: channel.id,
          clientRef: body.clientRef,
          title: body.title,
          description: body.description,
          tagsJson: JSON.stringify(body.tags),
          filePath: file.path,
          durationSec: 0,
          // A2 — "draft", never "ready": autoFill sweeps only ready videos, so
          // an external clip can never reach the schedule without human review.
          status: "draft",
          containsSyntheticMedia: body.aiDisclosure,
          attribution: body.attribution ?? null,
        },
      });
      log.info(
        `external clip ingested: ${video.id} (ref=${body.clientRef}, channel=${channel.id}, synthetic=${body.aiDisclosure})`,
      );
      ok(res, { id: video.id, duplicate: false, status: video.status }, 201);
    } catch (err) {
      await discard();
      // Race on the unique clientRef — a concurrent replay won; return its row.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        const winner = await prisma.video.findFirst({
          where: { clientRef: body.clientRef, channel: { userId: req.user!.id } },
        });
        if (winner) {
          ok(res, { id: winner.id, duplicate: true, status: winner.status });
          return;
        }
      }
      throw err;
    }
  }),
);

export default router;
