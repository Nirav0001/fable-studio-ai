// ── Fable Studio AI — demo seed ──────────────────────────────────────────────
// Fully self-contained: @prisma/client + bcryptjs + @fable/shared + node builtins.
// Idempotent: wipes every table in FK-safe order, then recreates the demo world.
// Deterministic: all mock numbers flow from seededRandom(fnv1a(stableKey)).
// Run: npm run db:seed  (or `prisma db seed`)

import { PrismaClient, Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  clamp,
  COST_RATES,
  DEMO_USER,
  fnv1a,
  seededRandom,
  wyrHash,
} from "@fable/shared";
import type {
  ChannelType,
  CostEstimate,
  ScriptPlan,
  SceneT,
  WeeklySchedule,
  WyrQuestionT,
} from "@fable/shared";
import {
  buildWyrBank,
  CHANNEL_SEEDS,
  CLIPS_READY_SCHEDULED_FLAGS,
  GIF_1PX_BASE64,
  HASHTAGS,
  LOGO_SEEDS,
  NOTIFICATION_SEEDS,
  PROJECT1_CONFIG,
  PROJECT1_QUESTIONS,
  PROJECT1_SEO,
  PROJECT1_THUMBS,
  PROJECT1_TITLE,
  PROJECT1_VIRAL,
  PROJECT2_CLIPS,
  PROJECT2_CONFIG,
  PROJECT2_SEO,
  PROJECT2_SOURCE_URL,
  PROJECT2_THUMBS,
  PROJECT2_TITLE,
  PROJECT2_TRANSCRIPT,
  PROJECT2_VIRAL,
  PROJECT3_CLIPS,
  PROJECT3_CONFIG,
  PROJECT3_SEO,
  PROJECT3_SOURCE_URL,
  PROJECT3_THUMBS,
  PROJECT3_TITLE,
  PROJECT3_TRANSCRIPT,
  PROJECT3_VIRAL,
  PROJECT4_CONFIG,
  PROJECT4_TITLE,
  PUBLISHED_VIDEOS,
  READY_VIDEOS,
  TAGS,
  TEMPLATE_SEEDS,
  type ChannelSeed,
  type ClipSeed,
} from "./seed-data";

// `prisma db seed` inherits .env, but allow direct `tsx prisma/seed.ts` runs too.
if (!process.env.DATABASE_URL) process.env.DATABASE_URL = "file:./dev.db";

const prisma = new PrismaClient();

const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

// ── Small helpers ────────────────────────────────────────────────────────────

function r1(n: number): number {
  return Math.round(n * 10) / 10;
}
function r2(n: number): number {
  return Math.round(n * 100) / 100;
}
function utcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
function clock(d: Date): string {
  return d.toTimeString().slice(0, 8);
}
function mockYoutubeId(title: string): string {
  return `mock-${(fnv1a(title) >>> 0).toString(36)}`;
}
function videoTags(type: ChannelType, title: string): string[] {
  const pool = TAGS[type];
  const k = fnv1a(title) % pool.length;
  return [...pool.slice(k), ...pool.slice(0, k)].slice(0, 9);
}
function videoDescription(type: ChannelType, title: string): string {
  const tagsLine = HASHTAGS[type].join(" ");
  if (type === "wyr") {
    return `${title}\n\nCan you make it through every question? Comment your picks 👇\nNew dilemmas daily on Brain Battles.\n\n${tagsLine}`;
  }
  if (type === "clips") {
    return `${title}\n\nFull stream on the main channel. Clipped + captioned daily by StreamGold.\n\n${tagsLine}`;
  }
  return `${title}\n\nWhich one was your favourite? Vote in the comments 👇\n\n${tagsLine}`;
}
function costOf(llmTokens: number, ttsChars: number, renderMinutes: number): CostEstimate {
  const llmCostGbp = r2((llmTokens / 1000) * COST_RATES.llmPer1kTokensGbp);
  const ttsCostGbp = r2((ttsChars / 1000) * COST_RATES.ttsPer1kCharsGbp);
  const renderCostGbp = r2(renderMinutes * COST_RATES.renderPerMinuteGbp);
  return {
    llmTokens,
    llmCostGbp,
    ttsChars,
    ttsCostGbp,
    renderMinutes,
    renderCostGbp,
    totalGbp: r2(llmCostGbp + ttsCostGbp + renderCostGbp),
  };
}
async function chunked<T>(items: T[], size: number, fn: (batch: T[]) => Promise<unknown>): Promise<void> {
  for (let i = 0; i < items.length; i += size) {
    await fn(items.slice(i, i + size));
  }
}

/** Tiny valid RIFF/WAVE file: 44-byte header + mono 16-bit PCM sine at `freq` Hz. */
function makeWav(freq: number, seconds = 0.5, sampleRate = 8000): Buffer {
  const numSamples = Math.floor(seconds * sampleRate);
  const dataSize = numSamples * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write("RIFF", 0, "ascii");
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8, "ascii");
  buf.write("fmt ", 12, "ascii");
  buf.writeUInt32LE(16, 16); // fmt chunk size
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28); // byte rate
  buf.writeUInt16LE(2, 32); // block align
  buf.writeUInt16LE(16, 34); // bits per sample
  buf.write("data", 36, "ascii");
  buf.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < numSamples; i++) {
    const fadeIn = Math.min(1, i / (sampleRate * 0.02));
    const fadeOut = Math.min(1, (numSamples - i) / (sampleRate * 0.05));
    const sample = Math.round(Math.sin((2 * Math.PI * freq * i) / sampleRate) * 0.38 * 32767 * fadeIn * fadeOut);
    buf.writeInt16LE(sample, 44 + i * 2);
  }
  return buf;
}

// ── Analytics curves ─────────────────────────────────────────────────────────

function buildSnapshots(channelId: string, seed: ChannelSeed, now: Date): Prisma.AnalyticsSnapshotCreateManyInput[] {
  const rand = seededRandom(fnv1a(`snapshots:${seed.handle}`));
  const spikeCount = 2 + Math.floor(rand() * 2); // 2-3 viral days
  const spikes = new Map<number, number>();
  while (spikes.size < spikeCount) {
    const dayIdx = 10 + Math.floor(rand() * 75);
    if (!spikes.has(dayIdx)) spikes.set(dayIdx, 5 + rand() * 10); // 5-15x
  }
  const rows: Prisma.AnalyticsSnapshotCreateManyInput[] = [];
  for (let i = 89; i >= 0; i--) {
    const date = utcDay(new Date(now.getTime() - i * DAY));
    const dayIdx = 89 - i; // 0 = oldest
    const dow = date.getUTCDay();
    const weekend = dow === 0 || dow === 6 ? 1.22 : 1;
    const trend = 1 + (seed.growth * dayIdx) / 89;
    const noise = 0.82 + rand() * 0.36;
    const spike = spikes.get(dayIdx) ?? 1;
    const views = Math.round(seed.baseViews * weekend * trend * noise * spike);
    const ctr = +(4 + rand() * 5).toFixed(2);
    const avgViewSec = +(18 + rand() * 22).toFixed(1);
    const retention = +(55 + rand() * 33).toFixed(1);
    const subsGained = Math.max(0, Math.round((views / (700 + rand() * 500)) * (spike > 1 ? 1.8 : 1)));
    const rpm = 0.045 + rand() * 0.065;
    const revenueGbp = r2((views / 1000) * rpm);
    const uploads = 2 + (rand() > 0.5 ? 1 : 0);
    const watchMinutes = Math.round((views * avgViewSec) / 60);
    rows.push({ channelId, date, views, watchMinutes, subsGained, revenueGbp, ctr, avgViewSec, retention, uploads });
  }
  return rows;
}

function buildRetentionCurve(rand: () => number): { pct: number; value: number }[] {
  const cliff = 14 + rand() * 16; // % of viewers lost in the hook
  const end = 34 + rand() * 28;
  const points: { pct: number; value: number }[] = [];
  for (let i = 0; i < 20; i++) {
    const pct = Math.round((i / 19) * 100);
    let value: number;
    if (pct <= 12) {
      value = 100 - (pct / 12) * cliff; // hook cliff
    } else {
      const t = (pct - 12) / 88;
      value = (100 - cliff) * (1 - t) + end * t + (rand() - 0.5) * 3;
    }
    if (i === 19 && rand() > 0.5) value += 4; // loop bump
    points.push({ pct, value: r1(clamp(value, 1, 100)) });
  }
  return points;
}

function buildVideoStats(
  videoId: string,
  seedKey: string,
  publishedAt: Date,
  viralScore: number,
  statFactor: number,
  now: Date
): Prisma.VideoStatCreateManyInput[] {
  const rand = seededRandom(fnv1a(`stats:${seedKey}`));
  const daysAvailable = Math.floor((now.getTime() - publishedAt.getTime()) / DAY) + 1;
  const rowCount = Math.max(1, Math.min(14, daysAvailable, 7 + Math.floor(rand() * 8)));
  const peak = Math.round((1500 + rand() * 6000) * (viralScore / 62) ** 2 * statFactor);
  const curveJson = JSON.stringify(buildRetentionCurve(rand));
  const rows: Prisma.VideoStatCreateManyInput[] = [];
  for (let d = 0; d < rowCount; d++) {
    const mult = d === 0 ? 0.55 : Math.exp(-(d - 1) / (2.1 + rand() * 1.4));
    const views = Math.max(50, Math.round(peak * mult * (0.85 + rand() * 0.3)));
    rows.push({
      videoId,
      date: utcDay(new Date(publishedAt.getTime() + d * DAY)),
      views,
      likes: Math.round(views * (0.045 + rand() * 0.035)),
      comments: Math.round(views * (0.002 + rand() * 0.004)),
      shares: Math.round(views * (0.004 + rand() * 0.006)),
      ctr: +(4 + rand() * 5).toFixed(2),
      avgPct: +(52 + rand() * 38).toFixed(1),
      curveJson,
    });
  }
  return rows;
}

// ── Script builders ──────────────────────────────────────────────────────────

function buildWyrScript(
  questions: WyrQuestionT[],
  lengthSec: number,
  hookText: string,
  ctaText: string,
  musicStyle: string
): ScriptPlan {
  const hookDur = 2.6;
  const ctaDur = 3;
  const per = (lengthSec - hookDur - ctaDur) / questions.length;
  const qDur = r1(per * 0.68);
  const revealDur = r1(per - qDur);
  const scenes: SceneT[] = [];
  const voiceoverLines: ScriptPlan["voiceoverLines"] = [];
  let idx = 0;
  let t = 0;

  scenes.push({
    index: idx++,
    kind: "hook",
    startSec: 0,
    durationSec: hookDur,
    text: hookText,
    effects: ["zoom-punch", "text-pop", "bass-drop"],
    sfx: "whoosh",
  });
  voiceoverLines.push({ atSec: 0, text: hookText });
  t = hookDur;

  for (const q of questions) {
    scenes.push({
      index: idx++,
      kind: "question",
      startSec: r1(t),
      durationSec: qDur,
      text: `Would you rather ${q.optionA} or ${q.optionB}?`,
      question: q,
      effects: idx % 2 === 0
        ? ["timer-bar", "split-screen", "option-slide"]
        : ["timer-bar", "split-screen", "shake-pulse"],
      sfx: "clock-tick",
    });
    voiceoverLines.push({ atSec: r1(t), text: `Would you rather ${q.optionA}… or ${q.optionB}?` });
    t += qDur;
    scenes.push({
      index: idx++,
      kind: "reveal",
      startSec: r1(t),
      durationSec: revealDur,
      text: `${q.percentA}% chose A`,
      question: q,
      effects: ["percent-counter", "confetti-burst", "winner-glow"],
      sfx: "ding",
    });
    t += revealDur;
  }

  scenes.push({
    index: idx++,
    kind: "cta",
    startSec: r1(t),
    durationSec: ctaDur,
    text: ctaText,
    effects: ["cta-banner", "subscribe-pulse"],
    sfx: "pop",
  });
  voiceoverLines.push({ atSec: r1(t), text: ctaText });
  t += ctaDur;

  return {
    scenes,
    totalDurationSec: r1(t),
    voiceoverLines,
    musicStyle,
    pacingNotes: "Hard cut on every reveal. Timer SFX sits under the VO. Percentages pop on the beat.",
  };
}

function buildTop5Script(rankedBestFirst: ClipSeed[], hookText: string, ctaText: string, musicStyle: string): ScriptPlan {
  const words = ["five", "four", "three", "two", "one"];
  const scenes: SceneT[] = [];
  const voiceoverLines: ScriptPlan["voiceoverLines"] = [];
  let idx = 0;
  let t = 0;

  scenes.push({
    index: idx++,
    kind: "hook",
    startSec: 0,
    durationSec: 2.5,
    text: hookText,
    effects: ["flash-cut", "text-pop", "riser"],
    sfx: "whoosh",
  });
  voiceoverLines.push({ atSec: 0, text: hookText });
  t = 2.5;

  for (let i = 0; i < 5; i++) {
    const rank = 5 - i;
    const item = rankedBestFirst[rank - 1]; // countdown: worst kept rank first
    const win = item.highlight ?? { startSec: item.startSec, endSec: Math.min(item.startSec + 9, item.endSec) };

    scenes.push({
      index: idx++,
      kind: "number",
      startSec: r1(t),
      durationSec: 1.3,
      text: `#${rank}`,
      effects: ["number-slam", "drumroll", "flash"],
      sfx: "drum-hit",
    });
    voiceoverLines.push({ atSec: r1(t), text: `Number ${words[i]}…` });
    t += 1.3;

    scenes.push({
      index: idx++,
      kind: "clip",
      startSec: r1(t),
      durationSec: r1(win.endSec - win.startSec),
      text: item.title,
      clipRef: { startSec: win.startSec, endSec: win.endSec, label: item.title },
      effects: ["captions-beast", "zoom-follow", "meme-overlay"],
      sfx: rank === 1 ? "airhorn" : undefined,
    });
    t += win.endSec - win.startSec;

    if (i < 4) {
      scenes.push({
        index: idx++,
        kind: "transition",
        startSec: r1(t),
        durationSec: 0.5,
        effects: ["whip-pan"],
        sfx: "whoosh",
      });
      t += 0.5;
    }
  }

  scenes.push({
    index: idx++,
    kind: "cta",
    startSec: r1(t),
    durationSec: 3,
    text: ctaText,
    effects: ["cta-banner", "subscribe-pulse"],
    sfx: "pop",
  });
  voiceoverLines.push({ atSec: r1(t), text: ctaText });
  t += 3;

  return {
    scenes,
    totalDurationSec: r1(t),
    voiceoverLines,
    musicStyle,
    pacingNotes: "Drumroll riser into every number card. Rank #1 gets the airhorn. Keep clips under 9 seconds.",
  };
}

// ── Scheduling helpers ───────────────────────────────────────────────────────

function futureSlotTimes(schedule: WeeklySchedule, now: Date): Date[] {
  const out: Date[] = [];
  for (let off = 0; off <= 7; off++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + off);
    const times = schedule[String(day.getDay())] ?? [];
    for (const hhmm of times) {
      const [h, m] = hhmm.split(":").map(Number);
      const dt = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m, 0, 0);
      if (dt.getTime() > now.getTime() && dt.getTime() <= now.getTime() + 7 * DAY) out.push(dt);
    }
  }
  return out.sort((a, b) => a.getTime() - b.getTime());
}

/** Pick n items evenly spread across the array (keeps the earliest first). */
function spreadPick<T>(arr: T[], n: number): T[] {
  if (arr.length <= n) return arr;
  const out: T[] = [];
  for (let i = 0; i < n; i++) out.push(arr[Math.floor((i * arr.length) / n)]);
  return out;
}

function publishedAtFor(now: Date, daysAgo: number, schedule: WeeklySchedule, title: string): Date {
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo);
  const times = schedule[String(day.getDay())] ?? ["18:00"];
  const hhmm = times[fnv1a(title) % times.length];
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m, fnv1a(title) % 50, 0);
}

// ── Job record factory ───────────────────────────────────────────────────────

function jobRecord(
  name: string,
  refType: string,
  refId: string,
  startedAt: Date,
  durSec: number,
  lines: string[],
  message: string
): Prisma.JobRecordCreateManyInput {
  const finishedAt = new Date(startedAt.getTime() + durSec * 1000);
  const logs = lines.map((line, i) => {
    const at = new Date(startedAt.getTime() + (durSec * 1000 * i) / Math.max(1, lines.length - 1));
    return `[${clock(at)}] ${line}`;
  });
  return {
    queue: "fable",
    name,
    refType,
    refId,
    status: "completed",
    progress: 100,
    message,
    logsJson: JSON.stringify(logs),
    startedAt,
    finishedAt,
    createdAt: new Date(startedAt.getTime() - 1500),
  };
}

const GENERATE_LOG_LINES = [
  "Queued project.generate",
  "Analyzing source",
  "Writing script",
  "Generating SEO pack",
  "Scoring virality",
  "Designing thumbnails",
  "Estimating cost",
  "Generation complete — status review",
];

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const now = new Date();
  console.log("🌱 Seeding Fable Studio AI demo data…\n");

  // 1 · Wipe everything, children first (FK-safe on both SQLite and Postgres).
  await prisma.abTest.deleteMany();
  await prisma.videoStat.deleteMany();
  await prisma.scheduleSlot.deleteMany();
  await prisma.clip.deleteMany();
  await prisma.video.deleteMany();
  await prisma.wyrQuestion.deleteMany();
  await prisma.project.deleteMany();
  await prisma.analyticsSnapshot.deleteMany();
  await prisma.automationRule.deleteMany();
  await prisma.jobRecord.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.template.deleteMany();
  await prisma.asset.deleteMany();
  await prisma.apiKey.deleteMany();
  await prisma.channel.deleteMany();
  await prisma.user.deleteMany();

  // 2 · Demo user.
  const user = await prisma.user.create({
    data: {
      email: DEMO_USER.email,
      passwordHash: bcrypt.hashSync(DEMO_USER.password, 10),
      name: DEMO_USER.name,
      plan: "studio",
      planStatus: "active",
      planRenewsAt: new Date(now.getTime() + 21 * DAY),
      preferencesJson: JSON.stringify({
        notifyRenderDone: true,
        notifyUploadDone: true,
        notifyTrends: true,
        emailDigest: "weekly",
        theme: "dark",
      }),
    },
  });

  // 3 · Assets — write real files into /storage/uploads.
  const repoRoot = join(__dirname, "..", "..", "..");
  const uploadsDir = join(repoRoot, "storage", "uploads");
  mkdirSync(uploadsDir, { recursive: true });

  const logoAssetIds: string[] = [];
  for (const logo of LOGO_SEEDS) {
    const buf = Buffer.from(logo.svg, "utf8");
    writeFileSync(join(uploadsDir, logo.file), buf);
    const asset = await prisma.asset.create({
      data: {
        userId: user.id,
        kind: "logo",
        name: logo.name,
        filePath: join(uploadsDir, logo.file),
        url: `/files/uploads/${logo.file}`,
        sizeBytes: buf.length,
        metaJson: JSON.stringify({ source: "seed", format: "svg", width: 256, height: 256 }),
      },
    });
    logoAssetIds.push(asset.id);
  }

  const audioSeeds = [
    { file: "upbeat-edm-loop.wav", name: "Upbeat EDM Loop", kind: "music", freq: 220, seconds: 2, meta: { bpm: 128, loop: true } },
    { file: "phonk-drive-loop.wav", name: "Phonk Drive Loop", kind: "music", freq: 174, seconds: 2, meta: { bpm: 140, loop: true } },
    { file: "vine-boom.wav", name: "Vine Boom SFX", kind: "sfx", freq: 80, seconds: 0.5, meta: { oneShot: true } },
  ];
  for (const audio of audioSeeds) {
    const buf = makeWav(audio.freq, audio.seconds);
    writeFileSync(join(uploadsDir, audio.file), buf);
    await prisma.asset.create({
      data: {
        userId: user.id,
        kind: audio.kind,
        name: audio.name,
        filePath: join(uploadsDir, audio.file),
        url: `/files/uploads/${audio.file}`,
        sizeBytes: buf.length,
        durationSec: audio.seconds,
        metaJson: JSON.stringify({ source: "seed", format: "wav", sampleRate: 8000, ...audio.meta }),
      },
    });
  }

  const gifBuf = Buffer.from(GIF_1PX_BASE64, "base64");
  writeFileSync(join(uploadsDir, "meme-reaction.gif"), gifBuf);
  await prisma.asset.create({
    data: {
      userId: user.id,
      kind: "gif",
      name: "Meme Reaction Placeholder",
      filePath: join(uploadsDir, "meme-reaction.gif"),
      url: "/files/uploads/meme-reaction.gif",
      sizeBytes: gifBuf.length,
      metaJson: JSON.stringify({ source: "seed", format: "gif", width: 1, height: 1 }),
    },
  });

  // 4 · Channels.
  const channels: { row: { id: string }; seed: ChannelSeed }[] = [];
  for (let i = 0; i < CHANNEL_SEEDS.length; i++) {
    const seed = CHANNEL_SEEDS[i];
    const row = await prisma.channel.create({
      data: {
        userId: user.id,
        name: seed.name,
        handle: seed.handle,
        type: seed.type,
        description: seed.description,
        avatarColor: seed.avatarColor,
        subscriberCount: seed.subscriberCount,
        connected: seed.connected,
        brandingJson: JSON.stringify({ ...seed.branding, logoAssetId: logoAssetIds[i] }),
        uploadDefaultsJson: JSON.stringify(seed.uploadDefaults),
        scheduleJson: JSON.stringify(seed.schedule),
        promptsJson: JSON.stringify(seed.prompts),
        youtubeJson: seed.connected
          ? JSON.stringify({
              mock: true,
              channelId: `UC-mock-${seed.handle}`,
              connectedAt: new Date(now.getTime() - 45 * DAY).toISOString(),
            })
          : "{}",
      },
    });
    channels.push({ row, seed });
  }
  const byKey = (key: ChannelType) => channels.find((c) => c.seed.key === key)!;
  const wyrChannel = byKey("wyr");
  const clipsChannel = byKey("clips");
  const top5Channel = byKey("top5");

  // 5 · 90 days of analytics snapshots per channel.
  let snapshotCount = 0;
  for (const c of channels) {
    const rows = buildSnapshots(c.row.id, c.seed, now);
    snapshotCount += rows.length;
    await chunked(rows, 90, (batch) => prisma.analyticsSnapshot.createMany({ data: batch }));
  }

  // 6 · Published videos + daily stats.
  const published: { id: string; title: string; publishedAt: Date; channelId: string }[] = [];
  const statRows: Prisma.VideoStatCreateManyInput[] = [];
  for (const c of channels) {
    for (const v of PUBLISHED_VIDEOS[c.seed.key]) {
      const publishedAt = publishedAtFor(now, v.daysAgo, c.seed.schedule, v.title);
      const video = await prisma.video.create({
        data: {
          channelId: c.row.id,
          title: v.title,
          description: videoDescription(c.seed.type, v.title),
          tagsJson: JSON.stringify(videoTags(c.seed.type, v.title)),
          hashtagsJson: JSON.stringify(HASHTAGS[c.seed.type]),
          durationSec: v.durationSec,
          status: "published",
          visibility: "public",
          viralScore: v.viralScore,
          youtubeId: mockYoutubeId(v.title),
          publishedAt,
          createdAt: new Date(publishedAt.getTime() - 6 * HOUR),
        },
      });
      published.push({ id: video.id, title: v.title, publishedAt, channelId: c.row.id });
      statRows.push(
        ...buildVideoStats(video.id, `${c.seed.handle}:${v.title}`, publishedAt, v.viralScore, c.seed.statFactor, now)
      );
    }
  }
  await chunked(statRows, 80, (batch) => prisma.videoStat.createMany({ data: batch }));

  // 7 · Projects.
  // P1 — WYR in review, full generation output.
  const p1Script = buildWyrScript(
    PROJECT1_QUESTIONS,
    PROJECT1_CONFIG.lengthSec,
    "8 money questions. Question 7 breaks everyone.",
    wyrChannel.seed.branding.cta,
    wyrChannel.seed.branding.musicStyle
  );
  const p1 = await prisma.project.create({
    data: {
      channelId: wyrChannel.row.id,
      type: "wyr",
      title: PROJECT1_TITLE,
      status: "review",
      stage: "done",
      progress: 100,
      configJson: JSON.stringify(PROJECT1_CONFIG),
      scriptJson: JSON.stringify(p1Script),
      seoJson: JSON.stringify(PROJECT1_SEO),
      thumbnailJson: JSON.stringify(PROJECT1_THUMBS),
      viralJson: JSON.stringify(PROJECT1_VIRAL),
      costJson: JSON.stringify(costOf(7400, 1650, 1.0)),
      createdAt: new Date(now.getTime() - 2.5 * HOUR),
    },
  });

  // P2 — clips project fully processed and rendered ("ready").
  const p2 = await prisma.project.create({
    data: {
      channelId: clipsChannel.row.id,
      type: "clips",
      title: PROJECT2_TITLE,
      status: "ready",
      stage: "done",
      progress: 100,
      sourceUrl: PROJECT2_SOURCE_URL,
      configJson: JSON.stringify(PROJECT2_CONFIG),
      seoJson: JSON.stringify(PROJECT2_SEO),
      thumbnailJson: JSON.stringify(PROJECT2_THUMBS),
      viralJson: JSON.stringify(PROJECT2_VIRAL),
      costJson: JSON.stringify(costOf(9200, 480, 2.4)),
      transcriptJson: JSON.stringify(PROJECT2_TRANSCRIPT),
      createdAt: new Date(now.getTime() - 25 * HOUR),
    },
  });
  const p2KeptClips: { id: string; seed: ClipSeed }[] = [];
  for (const c of PROJECT2_CLIPS) {
    const clipRow = await prisma.clip.create({
      data: {
        projectId: p2.id,
        index: c.index,
        title: c.title,
        hook: c.hook,
        startSec: c.startSec,
        endSec: c.endSec,
        score: c.score,
        scoreJson: JSON.stringify(c.breakdown),
        transcript: c.transcript,
        status: c.status,
        editPlanJson: JSON.stringify(c.editPlan),
      },
    });
    if (c.status === "kept") p2KeptClips.push({ id: clipRow.id, seed: c });
  }

  // P3 — top5 in review with 5 ranked kept clips + countdown script.
  const p3Script = buildTop5Script(
    PROJECT3_CLIPS,
    "The five funniest rage quits ever caught live. Number one is legendary.",
    top5Channel.seed.branding.cta,
    top5Channel.seed.branding.musicStyle
  );
  const p3 = await prisma.project.create({
    data: {
      channelId: top5Channel.row.id,
      type: "top5",
      title: PROJECT3_TITLE,
      status: "review",
      stage: "done",
      progress: 100,
      sourceUrl: PROJECT3_SOURCE_URL,
      configJson: JSON.stringify(PROJECT3_CONFIG),
      scriptJson: JSON.stringify(p3Script),
      seoJson: JSON.stringify(PROJECT3_SEO),
      thumbnailJson: JSON.stringify(PROJECT3_THUMBS),
      viralJson: JSON.stringify(PROJECT3_VIRAL),
      costJson: JSON.stringify(costOf(8100, 900, 1.1)),
      transcriptJson: JSON.stringify(PROJECT3_TRANSCRIPT),
      createdAt: new Date(now.getTime() - 7 * HOUR),
    },
  });
  for (const c of PROJECT3_CLIPS) {
    await prisma.clip.create({
      data: {
        projectId: p3.id,
        index: c.index,
        title: c.title,
        hook: c.hook,
        startSec: c.startSec,
        endSec: c.endSec,
        score: c.score,
        scoreJson: JSON.stringify(c.breakdown),
        transcript: c.transcript,
        status: c.status,
        editPlanJson: JSON.stringify(c.editPlan),
      },
    });
  }

  // P4 — untouched wyr draft.
  await prisma.project.create({
    data: {
      channelId: wyrChannel.row.id,
      type: "wyr",
      title: PROJECT4_TITLE,
      status: "draft",
      stage: "idle",
      progress: 0,
      configJson: JSON.stringify(PROJECT4_CONFIG),
      createdAt: new Date(now.getTime() - 40 * MIN),
    },
  });

  // 8 · Ready pool — 12 videos: 6 stay "ready" (no slot), 6 become "scheduled".
  const scheduledByChannel: Record<ChannelType, string[]> = { wyr: [], clips: [], top5: [] };
  let readyCount = 0;

  for (const key of ["wyr", "top5"] as const) {
    const c = byKey(key);
    for (let i = 0; i < READY_VIDEOS[key].length; i++) {
      const v = READY_VIDEOS[key][i];
      const video = await prisma.video.create({
        data: {
          channelId: c.row.id,
          title: v.title,
          description: videoDescription(key, v.title),
          tagsJson: JSON.stringify(videoTags(key, v.title)),
          hashtagsJson: JSON.stringify(HASHTAGS[key]),
          durationSec: v.durationSec,
          status: v.scheduled ? "scheduled" : "ready",
          visibility: "public",
          viralScore: v.viralScore,
          createdAt: new Date(now.getTime() - (10 + i * 7) * HOUR),
        },
      });
      if (v.scheduled) scheduledByChannel[key].push(video.id);
      else readyCount++;
    }
  }

  for (let i = 0; i < p2KeptClips.length; i++) {
    const kept = p2KeptClips[i];
    const scheduled = CLIPS_READY_SCHEDULED_FLAGS[i] === true;
    const video = await prisma.video.create({
      data: {
        channelId: clipsChannel.row.id,
        projectId: p2.id,
        clipId: kept.id,
        title: kept.seed.title,
        description: videoDescription("clips", kept.seed.title),
        tagsJson: JSON.stringify(videoTags("clips", kept.seed.title)),
        hashtagsJson: JSON.stringify(HASHTAGS.clips),
        durationSec: r1(kept.seed.endSec - kept.seed.startSec),
        status: scheduled ? "scheduled" : "ready",
        visibility: "public",
        viralScore: kept.seed.score,
        createdAt: new Date(now.getTime() - 1 * HOUR - i * 4 * MIN),
      },
    });
    if (scheduled) scheduledByChannel.clips.push(video.id);
    else readyCount++;
  }

  // 9 · 300-question WYR bank (~40 used, the review project's 8 linked to it).
  const bank = buildWyrBank();
  const project1Hashes = new Set(PROJECT1_QUESTIONS.map((q) => wyrHash(q.optionA, q.optionB)));
  const usageRand = seededRandom(fnv1a("bank-usage-v1"));
  const bankRows: Prisma.WyrQuestionCreateManyInput[] = bank.map((q) => {
    const isP1 = project1Hashes.has(q.hash);
    const usedOther = !isP1 && usageRand() < 0.115;
    return {
      channelId: wyrChannel.row.id,
      theme: q.theme,
      difficulty: q.difficulty,
      optionA: q.optionA,
      optionB: q.optionB,
      percentA: q.percentA,
      factoid: q.factoid,
      hash: q.hash,
      usedAt: isP1
        ? new Date(now.getTime() - 2.5 * HOUR)
        : usedOther
          ? new Date(now.getTime() - Math.floor(2 + usageRand() * 55) * DAY)
          : null,
      projectId: isP1 ? p1.id : null,
    };
  });
  await chunked(bankRows, 80, (batch) => prisma.wyrQuestion.createMany({ data: batch }));
  const usedQuestionCount = bankRows.filter((q) => q.usedAt != null).length;

  // 10 · Built-in templates.
  await prisma.template.createMany({
    data: TEMPLATE_SEEDS.map((t) => ({
      userId: user.id,
      name: t.name,
      kind: t.kind,
      description: t.description,
      configJson: JSON.stringify(t.config),
      accent: t.accent,
      builtIn: true,
    })),
  });

  // 11 · Schedule slots — ~10 upcoming (6 filled from the ready pool, 4 empty)
  //      plus 3 past "uploaded" slots for the most recent published videos.
  const futureNeed: Record<ChannelType, number> = { wyr: 4, clips: 3, top5: 3 };
  let filledSlots = 0;
  let emptySlots = 0;
  for (const c of channels) {
    const times = spreadPick(futureSlotTimes(c.seed.schedule, now), futureNeed[c.seed.key]);
    const videoIds = scheduledByChannel[c.seed.key];
    for (let i = 0; i < times.length; i++) {
      const videoId = i < videoIds.length ? videoIds[i] : null;
      await prisma.scheduleSlot.create({
        data: {
          channelId: c.row.id,
          videoId,
          scheduledAt: times[i],
          status: "scheduled",
        },
      });
      if (videoId) filledSlots++;
      else emptySlots++;
    }
  }

  const recentPublished = [...published].sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
  for (const v of recentPublished.slice(0, 3)) {
    await prisma.scheduleSlot.create({
      data: {
        channelId: v.channelId,
        videoId: v.id,
        scheduledAt: v.publishedAt,
        status: "uploaded",
        attempts: 1,
      },
    });
  }

  // 12 · Automation rule — enabled on the WYR channel.
  await prisma.automationRule.create({
    data: {
      channelId: wyrChannel.row.id,
      enabled: true,
      configJson: JSON.stringify({
        videosPerDay: 2,
        minViralScore: 65,
        autoApprove: false,
        themeRotation: ["money", "funny", "gaming", "random"],
      }),
      lastRunAt: new Date(now.getTime() - 3 * HOUR),
    },
  });

  // 13 · Notifications (2 unread).
  for (const n of NOTIFICATION_SEEDS) {
    await prisma.notification.create({
      data: {
        userId: user.id,
        kind: n.kind,
        title: n.title,
        body: n.body,
        read: n.read,
        createdAt: new Date(now.getTime() - n.hoursAgo * HOUR),
      },
    });
  }

  // 14 · Completed job history (10 records).
  const uploadJobs = recentPublished.slice(0, 4).map((v, i) =>
    jobRecord(
      "video.upload",
      "video",
      v.id,
      new Date(v.publishedAt.getTime() - 12_000),
      9 + i,
      [
        "Queued video.upload",
        "Preparing metadata",
        "Uploading to YouTube (mock)",
        `Published as ${mockYoutubeId(v.title)}`,
      ],
      `Published: ${v.title}`
    )
  );
  const jobRows: Prisma.JobRecordCreateManyInput[] = [
    jobRecord("project.generate", "project", p1.id, new Date(now.getTime() - 2.6 * HOUR), 34, GENERATE_LOG_LINES, `Generated: ${PROJECT1_TITLE}`),
    jobRecord("project.generate", "project", p2.id, new Date(now.getTime() - 25 * HOUR), 41, GENERATE_LOG_LINES, `Generated: ${PROJECT2_TITLE}`),
    jobRecord(
      "project.render",
      "project",
      p2.id,
      new Date(now.getTime() - 24.5 * HOUR),
      96,
      [
        "Queued project.render",
        "Rendering clip 1/5",
        "Rendering clip 2/5",
        "Rendering clip 3/5",
        "Rendering clip 4/5",
        "Rendering clip 5/5",
        "Writing thumbnails",
        "Render complete — 5 videos ready",
      ],
      `Rendered 5 clips: ${PROJECT2_TITLE}`
    ),
    jobRecord("project.generate", "project", p3.id, new Date(now.getTime() - 7.2 * HOUR), 38, GENERATE_LOG_LINES, `Generated: ${PROJECT3_TITLE}`),
    ...uploadJobs,
    jobRecord(
      "analytics.sync",
      "channel",
      wyrChannel.row.id,
      new Date(now.getTime() - 30 * MIN),
      3,
      ["Queued analytics.sync", "Fetching channel analytics (mock)", "Snapshot upserted"],
      "Analytics synced: Brain Battles"
    ),
    jobRecord(
      "analytics.sync",
      "channel",
      clipsChannel.row.id,
      new Date(now.getTime() - 32 * MIN),
      3,
      ["Queued analytics.sync", "Fetching channel analytics (mock)", "Snapshot upserted"],
      "Analytics synced: StreamGoldClips"
    ),
  ];
  await prisma.jobRecord.createMany({ data: jobRows });

  // 15 · Summary.
  const [
    users,
    channelCount,
    projects,
    clips,
    videos,
    videoStats,
    snapshots,
    wyrQuestions,
    slots,
    assets,
    templates,
    notifications,
    jobs,
    automationRules,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.channel.count(),
    prisma.project.count(),
    prisma.clip.count(),
    prisma.video.count(),
    prisma.videoStat.count(),
    prisma.analyticsSnapshot.count(),
    prisma.wyrQuestion.count(),
    prisma.scheduleSlot.count(),
    prisma.asset.count(),
    prisma.template.count(),
    prisma.notification.count(),
    prisma.jobRecord.count(),
    prisma.automationRule.count(),
  ]);

  console.table([
    { table: "User", rows: users },
    { table: "Channel", rows: channelCount },
    { table: "AnalyticsSnapshot", rows: snapshots },
    { table: "Project", rows: projects },
    { table: "Clip", rows: clips },
    { table: "Video", rows: videos },
    { table: "VideoStat", rows: videoStats },
    { table: "WyrQuestion", rows: wyrQuestions },
    { table: "ScheduleSlot", rows: slots },
    { table: "Asset", rows: assets },
    { table: "Template", rows: templates },
    { table: "Notification", rows: notifications },
    { table: "JobRecord", rows: jobs },
    { table: "AutomationRule", rows: automationRules },
  ]);
  console.log(
    `\n   Ready videos (no slot): ${readyCount} · Scheduled: ${filledSlots} · Empty upcoming slots: ${emptySlots}` +
      `\n   WYR bank: ${wyrQuestions} questions (${usedQuestionCount} used) · Snapshots: ${snapshotCount}` +
      `\n\n   🔑 Demo login → ${DEMO_USER.email} / ${DEMO_USER.password}\n`
  );
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
