// ── Transcript service ───────────────────────────────────────────────────────
// Real path: yt-dlp extracts audio → OpenAI Whisper transcribes (only when the
// binary AND key are both present, wrapped fully in try/catch). Default path:
// a 56-beat curated gaming-stream transcript — streamer + chat moments with
// laughter/shouting markers — rotated and re-timed deterministically per URL
// via fnv1a so different sources give different (but stable) content.

import { execFile } from "node:child_process";
import { readFile, readdir, unlink, mkdir } from "node:fs/promises";
import { basename, join } from "node:path";
import type { TranscriptSegment, TranscriptWord } from "@fable/shared";
import { fnv1a, seededRandom } from "@fable/shared";
import { env } from "../../config/env";
import { hasYtdlp } from "../../lib/capabilities";
import { activeKeys } from "../../lib/providerKeys";
import { createLogger } from "../../lib/logger";
import { addUsage, estimateTokens } from "../ai";

const log = createLogger("gen:transcript");

// ── Curated mock stream (streamer "Riko" + chat) ─────────────────────────────

interface PoolItem {
  text: string;
  speaker: string;
  dur: number; // base seconds, jittered per URL
  markers?: string[];
}

const POOL: PoolItem[] = [
  { text: "Alright chat, ranked grind day. I am NOT losing my placement to a level 12 again, I refuse.", speaker: "Riko", dur: 14 },
  { text: "He says that every placement day. Clip it for the archive.", speaker: "Chat", dur: 8 },
  { text: "Okay first game, easy lobby, easy lobby — WHY IS HE ALREADY BEHIND ME?", speaker: "Riko", dur: 12, markers: ["shouting"] },
  { text: "The jump scare at spawn is crazy work.", speaker: "Chat", dur: 7, markers: ["laughter"] },
  { text: "I panicked and threw my grenade at a wall. It bounced back. Chat, it bounced BACK.", speaker: "Riko", dur: 15, markers: ["laughter"] },
  { text: "Self-destruct speedrun any percent, world record attempt.", speaker: "Chat", dur: 8, markers: ["laughter"] },
  { text: "Okay serious mode. Headphones on. Crosshair placement. We are locked in.", speaker: "Riko", dur: 12 },
  { text: "Locked in for exactly forty seconds, start the timer.", speaker: "Chat", dur: 7 },
  { text: "One HP. ONE HP and he tried to knife me. Sit down. SIT DOWN.", speaker: "Riko", dur: 13, markers: ["shouting"] },
  { text: "THE DISRESPECT KNIFE ATTEMPT LMAOOO he got deleted.", speaker: "Chat", dur: 8, markers: ["laughter", "shouting"] },
  { text: "That's the clutch, that's the clip, that's dinner content right there. I want that framed.", speaker: "Riko", dur: 14 },
  { text: "Someone's mum just called mid-clutch and he still won the round. Built different.", speaker: "Chat", dur: 9, markers: ["laughter"] },
  { text: "Wait. Wait wait wait. Did my teammate just sell the bomb for a sniper? He SOLD it?", speaker: "Riko", dur: 14, markers: ["shouting"] },
  { text: "The economy is in shambles. Financial ruin speedrun.", speaker: "Chat", dur: 7, markers: ["laughter"] },
  { text: "I'm not tilted. I'm not tilted. I'm playing the piano with my keyboard right now but I'm NOT tilted.", speaker: "Riko", dur: 16, markers: ["laughter"] },
  { text: "The keyboard is filing a workplace complaint as we speak.", speaker: "Chat", dur: 8, markers: ["laughter"] },
  { text: "Donation says 'you would lose to a bot lobby'. Five pounds to bully me? That's five pounds of TRUTH actually.", speaker: "Riko", dur: 16, markers: ["laughter"] },
  { text: "He read it out loud and agreed. Self-aware king.", speaker: "Chat", dur: 7, markers: ["laughter"] },
  { text: "Okay this next round, if I win, everyone in chat has to say one nice thing about my aim.", speaker: "Riko", dur: 13 },
  { text: "Impossible challenge issued. Chat sweating.", speaker: "Chat", dur: 6, markers: ["laughter"] },
  { text: "AND HE MISSES EVERY SHOT AND WINS ON THE DEFUSE. I'M A TACTICAL GENIUS, NOT AN AIMER.", speaker: "Riko", dur: 15, markers: ["shouting", "laughter"] },
  { text: "Nice thing about his aim: it's very generous to the enemy team.", speaker: "Chat", dur: 9, markers: ["laughter"] },
  { text: "New teammate just joined. He's level 200. Chat, act natural, act GOOD, pretend we're good.", speaker: "Riko", dur: 14, markers: ["laughter"] },
  { text: "The level 200 just watched him fall off the map in warmup.", speaker: "Chat", dur: 8, markers: ["laughter"] },
  { text: "That fall was intentional. Map knowledge. I was checking what's down there. It's death. Death is down there.", speaker: "Riko", dur: 16, markers: ["laughter"] },
  { text: "Educational content, honestly.", speaker: "Chat", dur: 5 },
  { text: "Okay the enemy team keeps rushing the same door. Plan: I put my turret there and we go for lunch.", speaker: "Riko", dur: 14 },
  { text: "Strategy so lazy it wrapped around to genius.", speaker: "Chat", dur: 7 },
  { text: "THE TURRET GOT A TRIPLE. THE TURRET IS THE MVP. I'm putting the turret on the payroll.", speaker: "Riko", dur: 14, markers: ["shouting", "laughter"] },
  { text: "Turret outfragging the streamer is the content we subbed for.", speaker: "Chat", dur: 8, markers: ["laughter"] },
  { text: "My hands are shaking, chat. Match point. If we win this I hit the rank I've been chasing for three months.", speaker: "Riko", dur: 16 },
  { text: "Ninety thousand people watching a man forget how to breathe.", speaker: "Chat", dur: 8 },
  { text: "Last round. One versus one. He doesn't know where I am. I don't know where I am either, but that's fine.", speaker: "Riko", dur: 15, markers: ["laughter"] },
  { text: "The minimap is RIGHT THERE Riko.", speaker: "Chat", dur: 6, markers: ["laughter"] },
  { text: "HE PEEKED. HE PEEKED AND I HIT THE SHOT. WE DID IT. WE ACTUALLY DID IT!", speaker: "Riko", dur: 13, markers: ["shouting"] },
  { text: "THE SCREAM. My headphones are gone. Worth it. WORTH IT.", speaker: "Chat", dur: 8, markers: ["shouting", "laughter"] },
  { text: "I jumped out of my chair and my cat left the room in disgust. She's seen too much.", speaker: "Riko", dur: 13, markers: ["laughter"] },
  { text: "The cat has been through every rank-up and every rage. Pay the cat.", speaker: "Chat", dur: 8, markers: ["laughter"] },
  { text: "Donation from Meg: 'been here since 40 viewers, proud of you'. Okay who's cutting onions. Chat. CHAT.", speaker: "Riko", dur: 15 },
  { text: "Not the streamer crying on rank-up day. Wholesome overload.", speaker: "Chat", dur: 8 },
  { text: "I'm not crying, my eyes are sweating from the clutch. That's a medical fact.", speaker: "Riko", dur: 12, markers: ["laughter"] },
  { text: "Medical fact from the man who thought bandages heal faster if you crouch.", speaker: "Chat", dur: 9, markers: ["laughter"] },
  { text: "Victory lap game, no scopes only. What could possibly go wrong.", speaker: "Riko", dur: 11 },
  { text: "Everything. Everything can go wrong. It's about to be beautiful.", speaker: "Chat", dur: 8 },
  { text: "I just no-scoped a guy THROUGH the smoke. I'm never using a scope again. Delete scopes from the game.", speaker: "Riko", dur: 14, markers: ["shouting", "laughter"] },
  { text: "One lucky shot and he's rewriting the game design. Classic.", speaker: "Chat", dur: 8, markers: ["laughter"] },
  { text: "Okay chat vote: one more game or do I finally eat the pizza that arrived forty minutes ago?", speaker: "Riko", dur: 13 },
  { text: "The pizza has been sitting there so long it's a returning character now.", speaker: "Chat", dur: 9, markers: ["laughter"] },
  { text: "Chat voted 'one more game' at 98%. You people do NOT care about my pizza and honestly? Respect.", speaker: "Riko", dur: 14, markers: ["laughter"] },
  { text: "Cold pizza is a stream tradition at this point.", speaker: "Chat", dur: 7 },
  { text: "Final game. My duo picked the sniper. He has never hit a sniper shot in his LIFE.", speaker: "Riko", dur: 13, markers: ["laughter"] },
  { text: "Believe in the duo. The duo lore demands one miracle per month.", speaker: "Chat", dur: 8 },
  { text: "HE HIT IT. FIRST TRY. CROSS-MAP. I'm deafened, I'm deceased, I'm subscribing to my own duo.", speaker: "Riko", dur: 14, markers: ["shouting", "laughter"] },
  { text: "The miracle arrived early this month. Someone check on the duo, he's speechless.", speaker: "Chat", dur: 9, markers: ["laughter"] },
  { text: "And on that PERFECT note — raid time. Thank you for the best stream in months, chat. Same time tomorrow.", speaker: "Riko", dur: 14 },
  { text: "W stream. W cat. W turret. Clip everything.", speaker: "Chat", dur: 7, markers: ["laughter"] },
];

/**
 * Pure deterministic transcript: rotates the curated pool by a URL-derived
 * offset and re-times segments with seeded jitter across roughly 20 minutes.
 * Exported for unit tests and used as the default path.
 */
export function mockTranscript(sourceUrl: string): TranscriptSegment[] {
  const seed = fnv1a(sourceUrl || "mock-source") || 1;
  const rand = seededRandom(seed);
  const offset = seed % POOL.length;
  const count = 45 + (seed % 8); // 45-52 segments

  const segments: TranscriptSegment[] = [];
  let t = 3 + Math.floor(rand() * 6);
  for (let i = 0; i < count; i++) {
    const item = POOL[(offset + i) % POOL.length];
    const dur = item.dur + Math.floor(rand() * 5);
    segments.push({
      startSec: t,
      endSec: t + dur,
      text: item.text,
      speaker: item.speaker,
      markers: item.markers ? [...item.markers] : undefined,
    });
    t += dur + 3 + Math.floor(rand() * 10);
  }
  return segments;
}

// ── Real path: yt-dlp + Whisper ──────────────────────────────────────────────

const YTDLP_TIMEOUT_MS = 180_000;
const WHISPER_MAX_BYTES = 24 * 1024 * 1024; // Whisper API hard limit is 25MB

function execFileAsync(cmd: string, args: string[], timeout: number): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout }, (err) => (err ? reject(err) : resolve()));
  });
}

interface WhisperSegment {
  start?: number;
  end?: number;
  text?: string;
}

async function transcribeWithWhisper(sourceUrl: string): Promise<TranscriptSegment[]> {
  const dir = join(env.storageDir, "uploads");
  await mkdir(dir, { recursive: true });
  const audioPath = join(dir, `transcribe-${(fnv1a(sourceUrl) >>> 0).toString(36)}.m4a`);

  try {
    await execFileAsync(
      env.ytdlpPath,
      [
        "-x",
        "--audio-format",
        "m4a",
        // Mono 48kbps keeps even hour-long audio under Whisper's 25MB cap.
        "--postprocessor-args",
        "ExtractAudio:-b:a 48k -ac 1",
        // Streams/VODs can run for hours — transcribe the first 30 minutes
        // (bounds Whisper cost + time; clips are selected inside this window).
        "--download-sections",
        "*0-1800",
        "--js-runtimes",
        "node",
        "--no-playlist",
        "--force-overwrites",
        "-o",
        audioPath,
        "--",
        sourceUrl,
      ],
      YTDLP_TIMEOUT_MS,
    );

    let audio = await readFile(audioPath);
    if (audio.byteLength === 0) throw new Error("Audio download produced an empty file");
    if (audio.byteLength > WHISPER_MAX_BYTES) {
      // yt-dlp's postprocessor bitrate flags are unreliable across extractors —
      // squeeze to 32k mono ourselves (30min ≈ 7MB, far under the 25MB cap).
      const smallPath = audioPath.replace(/\.m4a$/, ".small.m4a");
      await execFileAsync(
        env.ffmpegPath,
        ["-y", "-i", audioPath, "-vn", "-c:a", "aac", "-b:a", "32k", "-ac", "1", smallPath],
        180_000,
      );
      audio = await readFile(smallPath);
      await unlink(smallPath).catch(() => undefined);
      if (audio.byteLength > WHISPER_MAX_BYTES) {
        throw new Error(`Audio still ${audio.byteLength} bytes after re-encode`);
      }
    }

    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(audio)], { type: "audio/mp4" }), "audio.m4a");
    form.append("model", "whisper-1");
    form.append("response_format", "verbose_json");

    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { authorization: `Bearer ${activeKeys().openaiKey}` },
      body: form,
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Whisper request failed (${res.status}): ${detail.slice(0, 200)}`);
    }
    const data = (await res.json()) as { segments?: WhisperSegment[] };
    const segments: TranscriptSegment[] = (data.segments ?? [])
      .filter((s) => typeof s.text === "string" && s.text.trim().length > 0)
      .map((s) => ({
        startSec: Math.max(0, Number(s.start) || 0),
        endSec: Math.max(0, Number(s.end) || 0),
        text: (s.text as string).trim(),
      }))
      .filter((s) => s.endSec > s.startSec);

    addUsage(estimateTokens(segments.map((s) => s.text).join(" ")));
    return segments;
  } finally {
    await unlink(audioPath).catch(() => undefined);
  }
}

// ── Real path B: yt-dlp caption tracks (no Whisper key needed) ───────────────

interface Json3Event {
  tStartMs?: number;
  dDurationMs?: number;
  /** `tOffsetMs` is the word's offset from tStartMs — this is what makes
   *  karaoke captions land on the right syllable. Dropping it (as this type
   *  used to) forces the renderer to spread words evenly and drift. */
  segs?: { utf8?: string; tOffsetMs?: number }[];
}

/**
 * Pull the video's own (auto-)captions via yt-dlp in json3 format and fold the
 * word-level events into sentence-sized transcript segments.
 */
async function fetchYoutubeCaptions(sourceUrl: string): Promise<TranscriptSegment[]> {
  const dir = join(env.storageDir, "uploads");
  await mkdir(dir, { recursive: true });
  const base = join(dir, `subs-${(fnv1a(sourceUrl) >>> 0).toString(36)}`);

  await new Promise<void>((resolve, reject) => {
    execFile(
      env.ytdlpPath,
      [
        "--skip-download",
        "--js-runtimes", "node",
        "--write-subs",
        "--write-auto-subs",
        "--sub-langs", "en.*,en,en-US,en-GB",
        "--sub-format", "json3",
        "--no-playlist",
        "--force-overwrites",
        "-o", base,
        "--", sourceUrl,
      ],
      { timeout: YTDLP_TIMEOUT_MS },
      (err) => (err ? reject(err) : resolve()),
    );
  });

  const prefix = basename(base);
  const produced = (await readdir(dir)).filter((f) => f.startsWith(prefix) && f.endsWith(".json3"));
  if (produced.length === 0) throw new Error("video has no English caption track");

  const capPath = join(dir, produced[0]);
  try {
    const data = JSON.parse(await readFile(capPath, "utf8")) as { events?: Json3Event[] };
    const events = (data.events ?? []).filter(
      (e) => Array.isArray(e.segs) && typeof e.tStartMs === "number",
    );

    const segments: TranscriptSegment[] = [];
    let curText: string[] = [];
    let curWords: TranscriptWord[] = [];
    let curStart = 0;
    let curEnd = 0;
    const flush = (): void => {
      const text = curText
        .join(" ")
        .replace(/\[(music|applause|laughter)\]/gi, "")
        .replace(/\s+/g, " ")
        .trim();
      if (text.length > 1 && curEnd > curStart) {
        const markers: string[] = [];
        if (/\blaugh|lmao|lol|haha/i.test(text)) markers.push("laughter");
        if (/[A-Z]{4,}|!{2,}/.test(text)) markers.push("shouting");
        // Each word runs until the next one starts (capped at 1s so a pause
        // does not leave one word hanging). Strictly non-overlapping, so the
        // renderer never draws two words on top of each other.
        const words = curWords
          .map((w, i) => {
            const nextStart = curWords[i + 1]?.startSec ?? Math.max(curEnd, w.startSec + 0.4);
            return { ...w, endSec: Math.min(nextStart, w.startSec + 1) };
          })
          .filter((w) => w.endSec - w.startSec >= 0.08);
        segments.push({
          startSec: curStart,
          endSec: curEnd,
          text,
          markers,
          ...(words.length > 0 ? { words } : {}),
        });
      }
      curText = [];
      curWords = [];
    };

    for (const event of events) {
      const start = (event.tStartMs ?? 0) / 1000;
      const end = start + (event.dDurationMs ?? 0) / 1000;
      const text = (event.segs ?? [])
        .map((s) => s.utf8 ?? "")
        .join("")
        .replace(/\n/g, " ")
        .trim();
      if (!text) continue;
      if (curText.length === 0) curStart = start;
      // New segment when the pause is long or the chunk is sentence-sized.
      if (curText.length > 0 && (start - curEnd > 1.6 || curText.join(" ").length > 90)) {
        flush();
        curStart = start;
      }
      curText.push(text);
      // Keep each word's own timing. YouTube's rolling captions re-emit the
      // same word across consecutive events, so drop a repeat that lands within
      // 300ms of the one already recorded — otherwise two identical words would
      // be drawn on top of each other.
      for (const seg of event.segs ?? []) {
        const word = (seg.utf8 ?? "").replace(/\n/g, " ").replace(/^>+/, "").trim();
        if (!word) continue;
        const at = start + (seg.tOffsetMs ?? 0) / 1000;
        const prev = curWords[curWords.length - 1];
        if (prev && prev.text === word && at - prev.startSec < 0.3) continue;
        curWords.push({ startSec: at, endSec: at, text: word });
      }
      curEnd = Math.max(curEnd, end);
    }
    flush();

    if (segments.length === 0) throw new Error("caption track parsed to zero segments");
    addUsage(estimateTokens(segments.map((s) => s.text).join(" ")));
    return segments.slice(0, 400);
  } finally {
    for (const f of produced) {
      await unlink(join(dir, f)).catch(() => undefined);
    }
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetch a transcript for a source video. Preference order:
 * 1. yt-dlp + Whisper (highest fidelity — needs binary + OpenAI key)
 * 2. yt-dlp caption tracks (needs only the binary)
 * 3. curated deterministic mock (always available)
 */
export async function getTranscript(sourceUrl: string): Promise<TranscriptSegment[]> {
  const ytdlpOk = await hasYtdlp();

  if (ytdlpOk && activeKeys().openaiKey) {
    try {
      const real = await transcribeWithWhisper(sourceUrl);
      if (real.length > 0) {
        log.info(`Whisper transcribed ${real.length} segments from ${sourceUrl}`);
        return real;
      }
    } catch (err) {
      log.warn(
        `Whisper transcription failed — trying captions: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  if (ytdlpOk) {
    try {
      const captions = await fetchYoutubeCaptions(sourceUrl);
      log.info(`yt-dlp captions produced ${captions.length} segments from ${sourceUrl}`);
      return captions;
    } catch (err) {
      log.warn(
        `Caption fetch failed — using mock transcript: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return mockTranscript(sourceUrl);
}
