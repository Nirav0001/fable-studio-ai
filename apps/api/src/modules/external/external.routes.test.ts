// External-ingest route tests (plan amendment A9) — the repo's first
// route-level tests, running the real express app + a real (ephemeral,
// per-file) SQLite database via supertest. See tests/helpers/testDb.ts.
//
// Coverage (A2/A4/A9 + ED5/ED6/ED7/ED17):
//   - auth reject: missing key, malformed key, wrong key
//   - mount-order regression: sibling cookie-authed routes still 401 (ED6)
//   - happy path creates a "draft" Video bound to the channel
//   - idempotent replay on clientRef → 200 { duplicate: true }
//   - wrong-owner channel → 403, unknown channel → 404, bad clientRef → 400
//   - autoFill NEVER sweeps externally ingested drafts (A2)
//   - prune selection: published >24h / stale drafts >30d only (A4/ED17)

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Express } from "express";
import { setupTestDb, type TestDbHarness } from "../../../tests/helpers/testDb";

type PrismaMod = typeof import("../../lib/prisma");
type ScheduleMod = typeof import("../schedule/schedule.service");
type PruneMod = typeof import("../../queue/prune");
type ProjectsMod = typeof import("../projects/projects.service");

let harness: TestDbHarness;
let app: Express;
let prisma: PrismaMod["prisma"];
let autoFill: ScheduleMod["autoFill"];
let pruneExternalMedia: PruneMod["pruneExternalMedia"];
let approveProject: ProjectsMod["approveProject"];

// Seeded fixtures
let ownerId: string;
let ownChannelId: string;
let otherChannelId: string;
let apiKey: string; // full plaintext key for the owner

const MP4_BYTES = Buffer.concat([
  Buffer.from([0x00, 0x00, 0x00, 0x18]),
  Buffer.from("ftypmp42"),
  Buffer.from("fable-test-clip-payload"),
]);

function postClip(fields: Record<string, string>, opts: { key?: string; file?: boolean } = {}) {
  let req = request(app).post("/api/v1/external/clips");
  if (opts.key !== undefined) req = req.set("Authorization", `Bearer ${opts.key}`);
  for (const [k, v] of Object.entries(fields)) req = req.field(k, v);
  if (opts.file !== false) {
    req = req.attach("file", MP4_BYTES, { filename: "clip.mp4", contentType: "video/mp4" });
  }
  return req;
}

beforeAll(async () => {
  harness = setupTestDb();

  // Import AFTER the harness pointed DATABASE_URL/STORAGE_DIR at the temp dir —
  // src/config/env and src/lib/prisma read the environment at import time.
  ({ prisma } = await import("../../lib/prisma"));
  const appMod = await import("../../app");
  app = appMod.createApp();
  ({ autoFill } = await import("../schedule/schedule.service"));
  ({ pruneExternalMedia } = await import("../../queue/prune"));
  ({ approveProject } = await import("../projects/projects.service"));

  const passwordHash = bcrypt.hashSync("irrelevant", 4);
  const owner = await prisma.user.create({
    data: { email: "owner@test.local", passwordHash, name: "Owner" },
  });
  const other = await prisma.user.create({
    data: { email: "other@test.local", passwordHash, name: "Other" },
  });
  ownerId = owner.id;

  const ownChannel = await prisma.channel.create({
    data: { userId: owner.id, name: "Owner Clips", handle: "ownerclips", type: "clips" },
  });
  const otherChannel = await prisma.channel.create({
    data: { userId: other.id, name: "Foreign", handle: "foreign", type: "clips" },
  });
  ownChannelId = ownChannel.id;
  otherChannelId = otherChannel.id;

  // Issue an API key exactly like settings.routes.ts does (lower bcrypt cost
  // for test speed — the stored hash embeds its own cost, compare still works).
  apiKey = `fable_sk_${randomBytes(16).toString("hex")}`;
  await prisma.apiKey.create({
    data: {
      userId: owner.id,
      name: "clip-engine",
      prefix: apiKey.slice(0, 12),
      keyHash: bcrypt.hashSync(apiKey, 4),
    },
  });
}, 120_000);

afterAll(async () => {
  await prisma?.$disconnect().catch(() => undefined);
  await harness?.cleanup();
});

// ── Auth ─────────────────────────────────────────────────────────────────────

describe("POST /external/clips auth", () => {
  it("rejects a request with no API key", async () => {
    const res = await postClip({ clientRef: "noauth-1", channelId: "x", title: "t" }, { file: false });
    expect(res.status).toBe(401);
    expect(res.body.ok).toBe(false);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  }, 15_000);

  it("rejects a malformed key (wrong scheme prefix)", async () => {
    const res = await postClip(
      { clientRef: "noauth-2", channelId: "x", title: "t" },
      { key: "not-a-fable-key", file: false },
    );
    expect(res.status).toBe(401);
  }, 15_000);

  it("rejects a well-formed but wrong key sharing a real prefix", async () => {
    const forged = apiKey.slice(0, 12) + "0".repeat(apiKey.length - 12);
    const res = await postClip(
      { clientRef: "noauth-3", channelId: "x", title: "t" },
      { key: forged, file: false },
    );
    expect(res.status).toBe(401);
  }, 15_000);
});

// ── Mount-order regression (A9/ED6) ──────────────────────────────────────────

describe("mount order", () => {
  it("sibling cookie-authed routes still 401 without a session", async () => {
    const videos = await request(app).get("/api/v1/videos");
    expect(videos.status).toBe(401);
    const settings = await request(app).get("/api/v1/settings");
    expect(settings.status).toBe(401);
  }, 15_000);

  it("the external route authenticates with the API key alone (no cookie)", async () => {
    const res = await postClip({
      clientRef: "mount-order-1",
      channelId: ownChannelId,
      title: "Mount order check",
    }, { key: apiKey });
    expect(res.status).toBe(201);
  }, 15_000);
});

// ── Ingest behaviour ─────────────────────────────────────────────────────────

describe("ingest", () => {
  it("happy path creates a draft Video bound to the channel", async () => {
    const res = await postClip({
      clientRef: "run1-clip1",
      channelId: ownChannelId,
      title: "Insane 1v4 clutch",
      description: "From the Tuesday VOD",
      tags: JSON.stringify(["gaming", "clips"]),
      aiDisclosure: "true",
      attribution: "Source: creator VOD (licensed)",
    }, { key: apiKey });

    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.duplicate).toBe(false);
    expect(res.body.data.status).toBe("draft");

    const video = await prisma.video.findUnique({ where: { clientRef: "run1-clip1" } });
    expect(video).not.toBeNull();
    expect(video!.id).toBe(res.body.data.id);
    expect(video!.channelId).toBe(ownChannelId);
    expect(video!.status).toBe("draft");
    expect(video!.title).toBe("Insane 1v4 clutch");
    expect(video!.description).toBe("From the Tuesday VOD");
    expect(JSON.parse(video!.tagsJson)).toEqual(["gaming", "clips"]);
    expect(video!.containsSyntheticMedia).toBe(true);
    expect(video!.attribution).toBe("Source: creator VOD (licensed)");
    expect(video!.mediaExpired).toBe(false);
    // Media stored under STORAGE_DIR/external/
    expect(video!.filePath).toContain("external");
    expect(existsSync(video!.filePath!)).toBe(true);
  }, 15_000);

  it("replaying the same clientRef is idempotent: 200 { duplicate: true }", async () => {
    const first = await prisma.video.findUnique({ where: { clientRef: "run1-clip1" } });
    const res = await postClip({
      clientRef: "run1-clip1",
      channelId: ownChannelId,
      title: "Insane 1v4 clutch (retry)",
    }, { key: apiKey });

    expect(res.status).toBe(200);
    expect(res.body.data.duplicate).toBe(true);
    expect(res.body.data.id).toBe(first!.id);
    const count = await prisma.video.count({ where: { clientRef: "run1-clip1" } });
    expect(count).toBe(1);
  }, 15_000);

  it("403s loudly when the channel belongs to a different account", async () => {
    const res = await postClip({
      clientRef: "wrong-channel-1",
      channelId: otherChannelId,
      title: "Should not land",
    }, { key: apiKey });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
    expect(await prisma.video.count({ where: { clientRef: "wrong-channel-1" } })).toBe(0);
  }, 15_000);

  it("404s loudly on an unknown channel", async () => {
    const res = await postClip({
      clientRef: "no-channel-1",
      channelId: "does-not-exist",
      title: "Should not land",
    }, { key: apiKey });
    expect(res.status).toBe(404);
  }, 15_000);

  it("400s on a clientRef that fails the ^[A-Za-z0-9_-]{1,64}$ contract", async () => {
    const res = await postClip({
      clientRef: "bad ref!",
      channelId: ownChannelId,
      title: "Bad ref",
    }, { key: apiKey });
    expect(res.status).toBe(400);
  }, 15_000);

  it("rejects non-mp4 uploads", async () => {
    const res = await request(app)
      .post("/api/v1/external/clips")
      .set("Authorization", `Bearer ${apiKey}`)
      .field("clientRef", "not-a-video-1")
      .field("channelId", ownChannelId)
      .field("title", "Not a video")
      .attach("file", Buffer.from("plain text"), {
        filename: "notes.txt",
        contentType: "text/plain",
      });
    expect(res.status).toBe(400);
    expect(await prisma.video.count({ where: { clientRef: "not-a-video-1" } })).toBe(0);
  }, 15_000);
});

// ── A2 — autoFill must NEVER sweep externally ingested drafts ────────────────

describe("autoFill regression (A2)", () => {
  it("schedules ready videos but never a clientRef draft", async () => {
    // Dedicated channel (default weekly schedule) so slots are deterministic.
    const channel = await prisma.channel.create({
      data: { userId: ownerId, name: "AutoFill", handle: "autofill", type: "clips" },
    });
    const ready = await prisma.video.create({
      data: { channelId: channel.id, title: "Internal ready video", status: "ready" },
    });
    const res = await postClip({
      clientRef: "autofill-draft-1",
      channelId: channel.id,
      title: "External draft",
    }, { key: apiKey });
    expect(res.status).toBe(201);
    const draftId = res.body.data.id as string;

    const result = await autoFill(ownerId, channel.id, 7);
    expect(result.created).toBe(1);

    const slots = await prisma.scheduleSlot.findMany({ where: { channelId: channel.id } });
    expect(slots).toHaveLength(1);
    expect(slots[0].videoId).toBe(ready.id);

    // The externally ingested draft was NOT swept: no slot, still a draft.
    expect(await prisma.scheduleSlot.count({ where: { videoId: draftId } })).toBe(0);
    const draft = await prisma.video.findUnique({ where: { id: draftId } });
    expect(draft!.status).toBe("draft");
  }, 15_000);
});

// ── approve must never mint a video with no rendered file ────────────────────
//
// Regression for the "Video has no rendered file to upload yet" bug: approving
// a generated-but-never-rendered project created status:"ready" rows with a
// NULL filePath, which auto-schedule then flipped to "scheduled" — unuploadable
// rows that burned real posting slots.

describe("approveProject render precondition", () => {
  it("refuses a clips project whose kept clips were never rendered", async () => {
    const channel = await prisma.channel.create({
      data: { userId: ownerId, name: "Approve", handle: "approve", type: "clips" },
    });
    const project = await prisma.project.create({
      data: { channelId: channel.id, title: "Unrendered", type: "clips", status: "review" },
    });
    await prisma.clip.create({
      data: {
        projectId: project.id,
        index: 0,
        startSec: 0,
        endSec: 13,
        title: "The Shot That Changed Everything!",
        status: "kept",
        score: 90,
      },
    });

    await expect(approveProject(ownerId, project.id, true)).rejects.toThrow(/Render the project/i);

    // Nothing was created and no slot was burned.
    expect(await prisma.video.count({ where: { projectId: project.id } })).toBe(0);
    expect(await prisma.scheduleSlot.count({ where: { channelId: channel.id } })).toBe(0);
  }, 15_000);

  it("approves once a rendered video backs the kept clip", async () => {
    const channel = await prisma.channel.create({
      data: { userId: ownerId, name: "Approve OK", handle: "approveok", type: "clips" },
    });
    const project = await prisma.project.create({
      data: { channelId: channel.id, title: "Rendered", type: "clips", status: "ready" },
    });
    const clip = await prisma.clip.create({
      data: {
        projectId: project.id,
        index: 0,
        startSec: 0,
        endSec: 13,
        title: "Rendered clip",
        status: "kept",
        score: 90,
      },
    });
    // What the render worker would have produced.
    await prisma.video.create({
      data: {
        channelId: channel.id,
        projectId: project.id,
        clipId: clip.id,
        title: "Rendered clip",
        status: "ready",
        filePath: "renders/rendered-clip.mp4",
      },
    });

    const res = await approveProject(ownerId, project.id, false);
    expect(res.projectId).toBe(project.id);
    // Reused the render's row rather than minting a second, file-less one.
    expect(await prisma.video.count({ where: { projectId: project.id } })).toBe(1);
  }, 15_000);
});

// ── A4/ED17 — prune selection ────────────────────────────────────────────────

describe("prune selection (A4/ED17)", () => {
  it("prunes published >24h and expires drafts >30d — nothing else", async () => {
    const channel = await prisma.channel.create({
      data: { userId: ownerId, name: "Prune", handle: "prune", type: "clips" },
    });
    const now = Date.now();
    const HOUR = 60 * 60_000;
    const DAY = 24 * HOUR;

    const mediaDir = join(process.env.STORAGE_DIR!, "external");
    mkdirSync(mediaDir, { recursive: true });
    const filePathFor = (name: string) => {
      const p = join(mediaDir, `${name}.mp4`);
      writeFileSync(p, MP4_BYTES);
      return p;
    };

    const publishedOld = await prisma.video.create({
      data: {
        channelId: channel.id, title: "Published old", status: "published",
        clientRef: "prune-pub-old", publishedAt: new Date(now - 25 * HOUR),
        filePath: filePathFor("pub-old"),
      },
    });
    const publishedFresh = await prisma.video.create({
      data: {
        channelId: channel.id, title: "Published fresh", status: "published",
        clientRef: "prune-pub-fresh", publishedAt: new Date(now - 2 * HOUR),
        filePath: filePathFor("pub-fresh"),
      },
    });
    const draftOld = await prisma.video.create({
      data: {
        channelId: channel.id, title: "Draft old", status: "draft",
        clientRef: "prune-draft-old", createdAt: new Date(now - 31 * DAY),
        filePath: filePathFor("draft-old"),
      },
    });
    const draftFresh = await prisma.video.create({
      data: {
        channelId: channel.id, title: "Draft fresh", status: "draft",
        clientRef: "prune-draft-fresh", createdAt: new Date(now - 5 * DAY),
        filePath: filePathFor("draft-fresh"),
      },
    });
    // Internal (non-external) video: no clientRef — prune must never touch it.
    const internalOld = await prisma.video.create({
      data: {
        channelId: channel.id, title: "Internal published", status: "published",
        publishedAt: new Date(now - 3 * DAY), filePath: filePathFor("internal-old"),
      },
    });

    const result = await pruneExternalMedia();
    expect(result).toEqual({ publishedPruned: 1, draftsExpired: 1 });

    // Published >24h: file gone, filePath cleared.
    const pubOld = await prisma.video.findUnique({ where: { id: publishedOld.id } });
    expect(pubOld!.filePath).toBeNull();
    expect(existsSync(join(mediaDir, "pub-old.mp4"))).toBe(false);

    // Published <24h: untouched.
    const pubFresh = await prisma.video.findUnique({ where: { id: publishedFresh.id } });
    expect(pubFresh!.filePath).not.toBeNull();
    expect(existsSync(join(mediaDir, "pub-fresh.mp4"))).toBe(true);

    // Draft >30d: media gone, row KEPT and flagged, owner notified.
    const dOld = await prisma.video.findUnique({ where: { id: draftOld.id } });
    expect(dOld).not.toBeNull();
    expect(dOld!.status).toBe("draft");
    expect(dOld!.mediaExpired).toBe(true);
    expect(dOld!.filePath).toBeNull();
    expect(existsSync(join(mediaDir, "draft-old.mp4"))).toBe(false);
    const note = await prisma.notification.findFirst({
      where: { userId: ownerId, title: "External clip media expired" },
    });
    expect(note).not.toBeNull();
    expect(note!.body).toContain("Draft old");

    // Draft <30d: untouched.
    const dFresh = await prisma.video.findUnique({ where: { id: draftFresh.id } });
    expect(dFresh!.mediaExpired).toBe(false);
    expect(existsSync(join(mediaDir, "draft-fresh.mp4"))).toBe(true);

    // Internal video without clientRef: never selected.
    const internal = await prisma.video.findUnique({ where: { id: internalOld.id } });
    expect(internal!.filePath).not.toBeNull();
    expect(existsSync(join(mediaDir, "internal-old.mp4"))).toBe(true);

    // Second run is a no-op (selection is idempotent).
    const again = await pruneExternalMedia();
    expect(again).toEqual({ publishedPruned: 0, draftsExpired: 0 });
  }, 20_000);
});
