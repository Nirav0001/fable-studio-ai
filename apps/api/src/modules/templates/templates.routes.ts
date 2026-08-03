import { Router } from "express";
import { z } from "zod";
import { safeJson } from "@fable/shared";
import { forbidden, notFound } from "../../lib/errors";
import { prisma } from "../../lib/prisma";
import { handler, ok } from "../../lib/respond";
import { validateBody } from "../../middleware/validate";

const router = Router();

const TEMPLATE_KINDS = ["wyr", "clips", "top5", "caption", "thumbnail"] as const;

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

interface TemplateRow {
  id: string;
  name: string;
  kind: string;
  description: string;
  configJson: string;
  accent: string;
  builtIn: boolean;
  createdAt: Date;
}

function toTemplate(row: TemplateRow) {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    description: row.description,
    config: safeJson<Record<string, unknown>>(row.configJson, {}),
    accent: row.accent,
    builtIn: row.builtIn,
    createdAt: row.createdAt.toISOString(),
  };
}

// GET /templates — the user's templates, built-ins first.
router.get(
  "/",
  handler(async (req, res) => {
    const rows = await prisma.template.findMany({
      where: { userId: req.user!.id },
      orderBy: [{ builtIn: "desc" }, { createdAt: "desc" }],
    });
    ok(res, rows.map(toTemplate));
  }),
);

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  kind: z.enum(TEMPLATE_KINDS),
  description: z.string().trim().max(400).default(""),
  accent: z.string().regex(HEX_COLOR, "accent must be a #rrggbb hex colour").default("#8b5cf6"),
  config: z.record(z.unknown()).default({}),
});

// POST /templates — create.
router.post(
  "/",
  validateBody(createSchema),
  handler(async (req, res) => {
    const body = req.body as z.infer<typeof createSchema>;
    const created = await prisma.template.create({
      data: {
        userId: req.user!.id,
        name: body.name,
        kind: body.kind,
        description: body.description,
        accent: body.accent,
        configJson: JSON.stringify(body.config),
        builtIn: false,
      },
    });
    ok(res, toTemplate(created), 201);
  }),
);

const updateSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  kind: z.enum(TEMPLATE_KINDS).optional(),
  description: z.string().trim().max(400).optional(),
  accent: z.string().regex(HEX_COLOR, "accent must be a #rrggbb hex colour").optional(),
  config: z.record(z.unknown()).optional(),
});

// PATCH /templates/:id — edit any field; config replaces wholesale (free-form object).
router.patch(
  "/:id",
  validateBody(updateSchema),
  handler(async (req, res) => {
    const existing = await prisma.template.findFirst({
      where: { id: req.params.id, userId: req.user!.id },
    });
    if (!existing) throw notFound("Template");
    const body = req.body as z.infer<typeof updateSchema>;
    const updated = await prisma.template.update({
      where: { id: existing.id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.kind !== undefined ? { kind: body.kind } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.accent !== undefined ? { accent: body.accent } : {}),
        ...(body.config !== undefined ? { configJson: JSON.stringify(body.config) } : {}),
      },
    });
    ok(res, toTemplate(updated));
  }),
);

// DELETE /templates/:id — built-ins are protected.
router.delete(
  "/:id",
  handler(async (req, res) => {
    const existing = await prisma.template.findFirst({
      where: { id: req.params.id, userId: req.user!.id },
    });
    if (!existing) throw notFound("Template");
    if (existing.builtIn) throw forbidden("Built-in templates cannot be deleted");
    await prisma.template.delete({ where: { id: existing.id } });
    ok(res, { deleted: true });
  }),
);

export default router;
