import { Router } from "express";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { unlink } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { z } from "zod";
import { safeJson } from "@fable/shared";
import type { AssetKind } from "@fable/shared";
import { env } from "../../config/env";
import { badRequest, notFound } from "../../lib/errors";
import { createLogger } from "../../lib/logger";
import { prisma } from "../../lib/prisma";
import { handler, ok } from "../../lib/respond";
import { validateBody } from "../../middleware/validate";

const log = createLogger("assets");
const router = Router();

const ASSET_KINDS = [
  "video",
  "music",
  "sfx",
  "gif",
  "logo",
  "font",
  "voiceover",
  "thumbnail",
] as const satisfies readonly AssetKind[];

const MAX_UPLOAD_BYTES = 200 * 1024 * 1024; // 200MB

const uploadsDir = join(env.storageDir, "uploads");
if (!existsSync(uploadsDir)) mkdirSync(uploadsDir, { recursive: true });

/** Strip any path components and unsafe characters; keep a readable stem + extension. */
function sanitizeFilename(original: string): string {
  const base = basename(original || "upload");
  const ext = extname(base).toLowerCase().replace(/[^a-z0-9.]/g, "").slice(0, 12);
  const stem = base
    .slice(0, base.length - extname(base).length)
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 60);
  return `${stem || "upload"}${ext}`;
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => cb(null, `${randomUUID()}-${sanitizeFilename(file.originalname)}`),
});

// Allowlist real media types only — never accept SVG/HTML/scripts that could
// execute if served (stored-XSS class). Executable/markup mimes are rejected.
const ALLOWED_MIME = /^(image\/(png|jpeg|gif|webp)|audio\/|video\/|font\/|application\/(ogg|font-|x-font-))/;
const upload = multer({
  storage,
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    const mime = file.mimetype.toLowerCase();
    if (mime === "image/svg+xml" || mime.includes("html") || !ALLOWED_MIME.test(mime)) {
      cb(new Error("Unsupported file type"));
      return;
    }
    cb(null, true);
  },
});

// Per-user storage ceiling — blocks disk-exhaustion abuse.
const MAX_USER_STORAGE_BYTES = 2 * 1024 * 1024 * 1024; // 2GB / user
const MAX_USER_ASSETS = 500;

interface AssetRow {
  id: string;
  kind: string;
  name: string;
  filePath: string;
  url: string | null;
  sizeBytes: number;
  durationSec: number | null;
  metaJson: string;
  createdAt: Date;
}

function toAsset(row: AssetRow) {
  return {
    id: row.id,
    kind: row.kind as AssetKind,
    name: row.name,
    url: row.url ?? `/files/uploads/${basename(row.filePath)}`,
    sizeBytes: row.sizeBytes,
    durationSec: row.durationSec,
    meta: safeJson<Record<string, unknown>>(row.metaJson, {}),
    createdAt: row.createdAt.toISOString(),
  };
}

// GET /assets?kind= — the current user's asset library.
router.get(
  "/",
  handler(async (req, res) => {
    const kindRaw = typeof req.query.kind === "string" ? req.query.kind : undefined;
    if (kindRaw && !(ASSET_KINDS as readonly string[]).includes(kindRaw)) {
      throw badRequest(`Unknown asset kind "${kindRaw}"`, { allowed: ASSET_KINDS });
    }
    const rows = await prisma.asset.findMany({
      where: { userId: req.user!.id, ...(kindRaw ? { kind: kindRaw } : {}) },
      orderBy: { createdAt: "desc" },
    });
    ok(res, rows.map(toAsset));
  }),
);

const uploadBodySchema = z.object({
  kind: z.enum(ASSET_KINDS),
  name: z.string().trim().max(120).optional(),
  durationSec: z.coerce.number().positive().max(60 * 60 * 12).optional(),
});

// POST /assets — multipart upload: field "file" + "kind" (+ optional "name", "durationSec").
router.post(
  "/",
  upload.single("file"),
  handler(async (req, res) => {
    const file = req.file;
    if (!file) throw badRequest('No file received — send a multipart form with a "file" field');

    const parsed = uploadBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      // Body invalid — don't leave the uploaded file orphaned on disk.
      await unlink(file.path).catch(() => undefined);
      throw badRequest("Invalid asset payload", parsed.error.flatten());
    }

    // Enforce the per-user storage quota before committing the asset row.
    const usage = await prisma.asset.aggregate({
      where: { userId: req.user!.id },
      _sum: { sizeBytes: true },
      _count: true,
    });
    if (
      (usage._sum.sizeBytes ?? 0) + file.size > MAX_USER_STORAGE_BYTES ||
      usage._count >= MAX_USER_ASSETS
    ) {
      await unlink(file.path).catch(() => undefined);
      throw badRequest("Storage quota reached — delete some assets first");
    }

    const { kind, name, durationSec } = parsed.data;
    const asset = await prisma.asset.create({
      data: {
        userId: req.user!.id,
        kind,
        name: name && name.length > 0 ? name : sanitizeFilename(file.originalname),
        filePath: file.path,
        url: `/files/uploads/${file.filename}`,
        sizeBytes: file.size,
        durationSec: durationSec ?? null,
        metaJson: JSON.stringify({
          originalName: file.originalname,
          mimeType: file.mimetype,
        }),
      },
    });
    log.info(`asset uploaded: ${asset.name} (${asset.kind}, ${asset.sizeBytes} bytes)`);
    ok(res, toAsset(asset), 201);
  }),
);

// PATCH /assets/:id — rename.
router.patch(
  "/:id",
  validateBody(z.object({ name: z.string().trim().min(1).max(120) })),
  handler(async (req, res) => {
    const existing = await prisma.asset.findFirst({
      where: { id: req.params.id, userId: req.user!.id },
    });
    if (!existing) throw notFound("Asset");
    const updated = await prisma.asset.update({
      where: { id: existing.id },
      data: { name: req.body.name as string },
    });
    ok(res, toAsset(updated));
  }),
);

// DELETE /assets/:id — remove record + unlink file best-effort.
router.delete(
  "/:id",
  handler(async (req, res) => {
    const existing = await prisma.asset.findFirst({
      where: { id: req.params.id, userId: req.user!.id },
    });
    if (!existing) throw notFound("Asset");
    await prisma.asset.delete({ where: { id: existing.id } });
    if (existing.filePath) {
      await unlink(existing.filePath).catch(() => {
        log.debug(`could not unlink ${existing.filePath} (already gone?)`);
      });
    }
    ok(res, { deleted: true });
  }),
);

export default router;
