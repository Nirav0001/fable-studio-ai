import { spawn } from "node:child_process";
import { existsSync, mkdirSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { clamp, fnv1a } from "@fable/shared";
import type { EditPlan, ScriptPlan, SceneT, ThumbnailVariant } from "@fable/shared";
import { env } from "../../config/env";
import { hasFfmpeg } from "../../lib/capabilities";
import { createLogger } from "../../lib/logger";
import { emojiPng, optionArt } from "./emojiArt";

const log = createLogger("ffmpeg");

const W = 1080;
const H = 1920;
const FPS = 30;
const RENDER_TIMEOUT_MS = 240_000;

// VoteVerse-style split palette
const SPLIT_BLUE = "0x2a52cc";
const SPLIT_RED = "0xdf2b2b";
const WIN_GREEN = "0x35e055";

// Palette (drawbox/drawtext accept 0xRRGGBB[@alpha])
const BG_WYR = "0x120826";
const BG_TOP5 = "0x1a0b2e";
const BG_CLIP = "0x0d0a1f";
const PURPLE = "0x8b5cf6";
const VIOLET_DEEP = "0x6d28d9";
const INDIGO = "0x312e81";
const NAVY = "0x1e1b4b";
const CYAN = "0x06b6d4";
const PINK = "0xec4899";
const AMBER = "0xf59e0b";

/** Contract-named wrapper reusing lib/capabilities' cached probe. */
export function hasFfmpegSync(): Promise<boolean> {
  return hasFfmpeg();
}

// ── Font resolution (Windows first, sane fallbacks elsewhere) ────────────────

let cachedFont: string | null | undefined;
let cachedComicFont: string | null | undefined;

function resolveFontFile(): string | null {
  if (cachedFont !== undefined) return cachedFont;
  const candidates = [
    "C:/Windows/Fonts/arialbd.ttf",
    "C:/Windows/Fonts/arial.ttf",
    "C:/Windows/Fonts/segoeui.ttf",
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
  ];
  cachedFont = candidates.find((p) => existsSync(p)) ?? null;
  if (!cachedFont) log.warn("No known font file found — drawtext will rely on fontconfig");
  return cachedFont;
}

/** Rounded comic display font for the VoteVerse-style renders. */
function resolveComicFont(): string | null {
  if (cachedComicFont !== undefined) return cachedComicFont;
  const candidates = [
    "C:/Windows/Fonts/comicbd.ttf",
    "C:/Windows/Fonts/impact.ttf",
    "C:/Windows/Fonts/arialbd.ttf",
    // Linux (Railway): Comic Neue installed by the Dockerfile keeps the look.
    "/usr/share/fonts/truetype/comic-neue/ComicNeue-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
  ];
  cachedComicFont = candidates.find((p) => existsSync(p)) ?? resolveFontFile();
  return cachedComicFont;
}

/** Escape a filesystem path for use inside a quoted filtergraph option. */
function escapePath(p: string): string {
  return p.replace(/\\/g, "/").replace(/:/g, "\\:");
}

function fontOption(kind: "default" | "comic" = "default"): string {
  const font = kind === "comic" ? resolveComicFont() : resolveFontFile();
  // Windows font path with escaped colon, e.g. fontfile='C\:/Windows/Fonts/arialbd.ttf'
  return font ? `fontfile='${escapePath(font)}':` : "";
}

/**
 * Sanitize text for drawtext: strip backslashes + apostrophes + non-ASCII
 * (emoji arrive via image overlays, not glyphs), escape : for the ffmpeg
 * option parser, collapse whitespace, cap length. % needs no escaping —
 * drawText always sets expansion=none (with expansion enabled a bare % is an
 * expansion introducer and silently swallows the text: "Stray %").
 */
export function sanitizeDrawtext(input: string): string {
  return input
    .replace(/[^\x20-\x7e]/g, " ")
    .replace(/\\/g, " ")
    .replace(/'/g, "")
    .replace(/"/g, "")
    .replace(/:/g, "\\:")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

const fmt = (n: number): string => String(Math.round(n * 100) / 100);

// ── Filter builders ──────────────────────────────────────────────────────────

interface TextOpts {
  text: string;
  y: number | string;
  size: number;
  x?: string;
  color?: string;
  alphaExpr?: string;
  enable?: string;
  borderColor?: string;
  borderW?: number;
  font?: "default" | "comic";
  /** Ease-out pop-in (slide up + fade) starting at this second. */
  popAt?: number;
}

function drawText(o: TextOpts): string {
  let y = typeof o.y === "number" ? String(o.y) : o.y;
  let alphaExpr = o.alphaExpr;
  if (o.popAt !== undefined && typeof o.y === "number") {
    // Ease-out entrance per animation standards: ~250ms settle, subtle
    // 20px rise, fade slightly faster than the motion.
    y = `${o.y}+20*exp(-12*max(0\\,t-${fmt(o.popAt)}))`;
    alphaExpr = alphaExpr ?? `min(1\\,(t-${fmt(o.popAt)})*6)`;
  }
  const parts: string[] = [
    `drawtext=${fontOption(o.font ?? "default")}expansion=none:text='${sanitizeDrawtext(o.text)}'`,
    `fontsize=${o.size}`,
    `fontcolor=${o.color ?? "white"}`,
    `x='${o.x ?? "(w-text_w)/2"}'`,
    `y='${y}'`,
  ];
  if (alphaExpr) parts.push(`alpha='${alphaExpr}'`);
  if (o.borderW) {
    parts.push(`borderw=${o.borderW}`, `bordercolor=${o.borderColor ?? "black@0.7"}`);
  }
  if (o.enable) parts.push(`enable='${o.enable}'`);
  return parts.join(":");
}

interface BoxOpts {
  x: number | string;
  y: number | string;
  w: number | string;
  h: number | string;
  color: string;
  alpha?: number;
  thickness?: number | "fill";
  enable?: string;
}

function drawBox(o: BoxOpts): string {
  const quote = (v: number | string): string => (typeof v === "number" ? String(v) : `'${v}'`);
  const parts: string[] = [
    `drawbox=x=${quote(o.x)}`,
    `y=${quote(o.y)}`,
    `w=${quote(o.w)}`,
    `h=${quote(o.h)}`,
    `color=${o.color}@${o.alpha ?? 1}`,
    `t=${o.thickness ?? "fill"}`,
  ];
  if (o.enable) parts.push(`enable='${o.enable}'`);
  return parts.join(":");
}

function between(start: number, end: number): string {
  return `between(t,${fmt(start)},${fmt(end)})`;
}

function wrapLines(text: string, maxChars: number, maxLines = 4): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (current && (current + " " + word).length > maxChars) {
      lines.push(current);
      current = word;
      if (lines.length === maxLines) break;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  if (lines.length === maxLines && words.join(" ").length > maxLines * maxChars) {
    lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, "") + "...";
  }
  return lines.length ? lines : [text.slice(0, maxChars)];
}

function centeredLines(
  text: string,
  size: number,
  startY: number,
  opts: { enable?: string; color?: string; alphaExpr?: string; maxChars?: number; maxLines?: number } = {},
): string[] {
  const lines = wrapLines(text, opts.maxChars ?? 24, opts.maxLines ?? 4);
  const lineHeight = Math.round(size * 1.3);
  return lines.map((line, i) =>
    drawText({
      text: line,
      size,
      y: startY + i * lineHeight,
      color: opts.color,
      alphaExpr: opts.alphaExpr,
      enable: opts.enable,
      borderW: 3,
    }),
  );
}

function baseGradient(): string[] {
  return [
    drawBox({ x: 0, y: 0, w: W, h: 720, color: VIOLET_DEEP, alpha: 0.22 }),
    drawBox({ x: 0, y: 640, w: W, h: 640, color: NAVY, alpha: 0.18 }),
    drawBox({ x: 0, y: H - 720, w: W, h: 720, color: INDIGO, alpha: 0.25 }),
  ];
}

function progressBar(totalSec: number): string {
  return drawBox({
    x: 0,
    y: H - 18,
    w: `iw*t/${fmt(totalSec)}`,
    h: 18,
    color: PURPLE,
    alpha: 0.9,
  });
}

// ── ffmpeg process runner ────────────────────────────────────────────────────

/**
 * Container CPU affinity for ffmpeg.
 *
 * A container commonly reports the HOST's core count (48 on Railway) while its
 * cgroup caps total threads (pids.max = 1000). FFmpeg sizes its thread pools
 * from the visible core count, so a WYR render — ~35 simultaneous inputs —
 * asks for far more threads than the cgroup allows and dies at startup with
 * "pthread_create failed: Resource temporarily unavailable", which surfaces
 * downstream as decoder/filter-configuration errors.
 *
 * Pinning ffmpeg to a handful of cores makes av_cpu_count() report that many,
 * which right-sizes every pool at once. Verified in production: the identical
 * 35-input graph fails bare and succeeds under `taskset -c 0-3`.
 */
function ffmpegLauncher(args: string[]): { cmd: string; argv: string[] } {
  if (process.platform === "linux") {
    const taskset = ["/usr/bin/taskset", "/bin/taskset"].find((p) => existsSync(p));
    if (taskset) {
      return { cmd: taskset, argv: ["-c", "0-3", env.ffmpegPath, ...args] };
    }
  }
  return { cmd: env.ffmpegPath, argv: args };
}

function runFfmpeg(args: string[], label: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const preview = args.join(" ");
    log.info(`${label}: ${env.ffmpegPath} ${preview.length > 260 ? `${preview.slice(0, 260)}…` : preview}`);
    const { cmd, argv } = ffmpegLauncher(args);
    const child = spawn(cmd, argv, { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    let timedOut = false;
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
      if (stderr.length > 8000) stderr = stderr.slice(-8000);
    });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, RENDER_TIMEOUT_MS);
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(new Error(`${label} failed to spawn ffmpeg: ${err.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) {
        reject(new Error(`${label} timed out after ${RENDER_TIMEOUT_MS / 1000}s`));
      } else if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${label} exited with code ${code}: ${stderr.slice(-600).trim()}`));
      }
    });
  });
}

export interface VoiceTrackRef {
  path: string;
  atSec: number;
}

export interface ImageOverlayRef {
  path: string;
  width: number;
  x: number;
  y: number;
  start: number;
  end: number;
  /** Drop-in entrance: slides down with ease-out from `start` (~250ms). */
  dropIn?: boolean;
  /** Pendulum tick-tock wobble (for the clock). */
  spin?: boolean;
  /** Overrides the between(start,end) enable window (e.g. multiple windows). */
  enableExpr?: string;
}

/** Animated solid-color bar overlaid via x-expression — the reliable way to
 *  animate width in ffmpeg (drawbox geometry doesn't re-evaluate per frame). */
export interface StripRef {
  w: number;
  h: number;
  color: string;
  xExpr: string;
  y: number;
  enable?: string;
}

export interface RenderAvOpts {
  voice?: VoiceTrackRef[];
  images?: ImageOverlayRef[];
  strips?: StripRef[];
  /** Windows (seconds) during which a ticking-clock urgency SFX plays. */
  tickWindows?: { start: number; end: number }[];
  /** Times (seconds) at which a whoosh SFX fires (percentage reveals). */
  whooshTimes?: number[];
  /** Real music file for the bed; falls back to a synthesized peaceful pad. */
  musicPath?: string;
}

/**
 * Render a full-canvas 9:16 video. `pre` filters draw beneath image overlays
 * (backgrounds, panels), `post` filters draw on top (text, bars). Voice tracks
 * are delay-placed and mixed over a pulsing synth bed. The filter graph is
 * written to a script file to dodge the Windows 32K command-line cap.
 */
async function renderFiltersToVideo(
  layers: { pre: string[]; post: string[] },
  durationSec: number,
  outPath: string,
  label: string,
  bgColor: string,
  av: RenderAvOpts = {},
): Promise<void> {
  mkdirSync(dirname(outPath), { recursive: true });
  const d = fmt(clamp(durationSec, 5, 90));
  const images = av.images ?? [];
  const strips = av.strips ?? [];
  const voice = av.voice ?? [];
  const ticks = av.tickWindows ?? [];
  const whooshes = av.whooshTimes ?? [];

  // A WYR render opens ~35 simultaneous inputs (canvas, music, ~16 emoji
  // stills, voice lines, tick/whoosh generators, animated strips). FFmpeg's
  // default per-input packet queue (8) overflows well before that, which
  // surfaces as "Failed to inject frame into filter network: Resource
  // temporarily unavailable" and a cascading "Error reinitializing filters!".
  // Every input therefore gets a generous queue.
  const QUEUE = ["-thread_queue_size", "1024"];

  const args: string[] = [
    "-y",
    ...QUEUE,
    "-f", "lavfi", "-i", `color=c=${bgColor}:s=${W}x${H}:r=${FPS}:d=${d}`,
  ];
  // Input 1 — music bed: real file (looped) or a synthesized peaceful pad
  // (soft A-major triad with a slow breathing LFO).
  if (av.musicPath) {
    args.push(...QUEUE, "-stream_loop", "-1", "-i", av.musicPath);
  } else {
    args.push(
      ...QUEUE,
      "-f", "lavfi",
      "-i",
      `aevalsrc='0.055*(sin(2*PI*220*t)+0.8*sin(2*PI*277.2*t)+0.65*sin(2*PI*329.6*t))*(0.75+0.25*sin(2*PI*0.11*t))':s=44100:d=${d}`,
    );
  }

  let nextInput = 2;
  const imageBase = nextInput;
  for (const img of images) {
    // Stills at 1fps — overlay holds the frame, and this avoids re-decoding
    // each PNG 30×/second for the whole render.
    args.push(...QUEUE, "-loop", "1", "-framerate", "1", "-i", img.path);
    nextInput++;
  }
  const voiceBase = nextInput;
  for (const track of voice) {
    // NO +discardcorrupt here. Dropping damaged packets silently produces
    // stuttering, glitchy narration — a worse outcome than failing, because
    // the broken video still gets published. Tracks are decode-verified
    // upstream, so anything reaching ffmpeg should be clean; if it isn't, the
    // render must fail loudly.
    args.push(...QUEUE, "-i", track.path);
    nextInput++;
  }
  let tickIdx = -1;
  if (ticks.length > 0) {
    // One decaying 1.05kHz blip per second, gated to the question windows.
    const gate = ticks.map((w) => `between(t\\,${fmt(w.start)}\\,${fmt(w.end)})`).join("+");
    args.push(
      ...QUEUE,
      "-f", "lavfi",
      "-i", `aevalsrc='0.45*sin(2*PI*1050*t)*exp(-30*mod(t\\,1))*(${gate})':s=44100:d=${d}`,
    );
    tickIdx = nextInput++;
  }
  let whooshIdx = -1;
  if (whooshes.length > 0) {
    args.push(...QUEUE, "-f", "lavfi", "-i", `anoisesrc=c=white:r=44100:a=0.8:d=${d}`);
    whooshIdx = nextInput++;
  }
  const stripBase = nextInput;
  for (const s of strips) {
    args.push(...QUEUE, "-f", "lavfi", "-i", `color=c=${s.color}:s=${s.w}x${s.h}:r=2:d=${d}`);
    nextInput++;
  }

  // ── video graph: pre → artwork → text → animated bars ──
  const graph: string[] = [];
  const pre = layers.pre.length ? layers.pre : ["null"];
  graph.push(`[0:v]${pre.join(",\n")}[base0]`);
  let cursor = "base0";
  images.forEach((img, i) => {
    const next = `base${i + 1}`;
    // -2 (not -1) keeps the derived height EVEN and setsar=1 pins a square
    // pixel aspect — odd/─mismatched geometry makes scale fail to configure
    // its output pad when the graph is reinitialized.
    if (img.spin) {
      // Pendulum wobble: pad for corner room, rotate ±15° at ~2.5Hz.
      graph.push(
        `[${imageBase + i}:v]scale=${img.width}:-2,setsar=1,fps=${FPS},format=rgba,pad=iw+60:ih+60:30:30:color=0x00000000,rotate=a='0.26*sin(5*PI*t)':fillcolor=none[img${i}]`,
      );
    } else {
      graph.push(`[${imageBase + i}:v]scale=${img.width}:-2,setsar=1,format=rgba[img${i}]`);
    }
    const yExpr = img.dropIn ? `${img.y}-48*exp(-10*max(0\\,t-${fmt(img.start)}))` : String(img.y);
    const enable = img.enableExpr ?? `between(t,${fmt(img.start)},${fmt(img.end)})`;
    graph.push(
      `[${cursor}][img${i}]overlay=x=${img.x}:y='${yExpr}':enable='${enable}'[${next}]`,
    );
    cursor = next;
  });
  const post = layers.post.length ? layers.post : ["null"];
  graph.push(`[${cursor}]${post.join(",\n")}[vtext]`);
  cursor = "vtext";
  strips.forEach((s, i) => {
    const next = i === strips.length - 1 ? "vout" : `vbar${i}`;
    const enable = s.enable ? `:enable='${s.enable}'` : "";
    graph.push(`[${cursor}][${stripBase + i}:v]overlay=x='${s.xExpr}':y=${s.y}${enable}[${next}]`);
    cursor = next;
  });
  if (strips.length === 0) graph.push(`[vtext]null[vout]`);

  // ── audio graph: bed + ticks + whooshes + delay-placed voice lines ──
  const bedVolume = av.musicPath ? (voice.length ? 0.12 : 0.2) : 1.0;
  graph.push(`[1:a]aresample=44100,volume=${bedVolume},afade=t=in:d=1[bed]`);
  const mixInputs = ["[bed]"];
  if (tickIdx >= 0) {
    graph.push(`[${tickIdx}:a]anull[ticks]`);
    mixInputs.push(`[ticks]`);
  }
  if (whooshIdx >= 0) {
    // Band-limited noise shaped by a gaussian envelope at each reveal.
    const envelope = whooshes.map((r) => `exp(-50*pow(t-${fmt(r + 0.16)},2))`).join("+");
    graph.push(
      `[${whooshIdx}:a]highpass=f=500,lowpass=f=4500,volume=volume='0.9*(${envelope})':eval=frame[whoosh]`,
    );
    mixInputs.push(`[whoosh]`);
  }
  voice.forEach((track, i) => {
    const ms = Math.max(0, Math.round(track.atSec * 1000));
    graph.push(`[${voiceBase + i}:a]aresample=44100,adelay=${ms}|${ms},volume=1.5[vo${i}]`);
    mixInputs.push(`[vo${i}]`);
  });
  if (mixInputs.length > 1) {
    graph.push(
      `${mixInputs.join("")}amix=inputs=${mixInputs.length}:duration=first:normalize=0,alimiter=limit=0.891[aout]`,
    );
  } else {
    graph.push(`[bed]anull[aout]`);
  }

  const scriptPath = `${outPath}.filtergraph.txt`;
  writeFileSync(scriptPath, graph.join(";\n"), "utf8");
  const cmdPath = `${outPath}.cmd.txt`;

  args.push(
    "-filter_complex_script", scriptPath,
    "-map", "[vout]",
    "-map", "[aout]",
    "-c:v", "libx264",
    "-preset", "ultrafast",
    "-crf", "28",
    "-pix_fmt", "yuv420p",
    "-r", String(FPS),
    "-c:a", "aac",
    "-b:a", "128k",
    "-movflags", "+faststart",
    "-t", d,
    outPath,
  );
  // On failure the filtergraph AND the exact argv stay next to the output —
  // together they reproduce the run verbatim. Both are removed on success.
  writeFileSync(cmdPath, args.map((a) => (/[\s'"]/.test(a) ? `'${a}'` : a)).join(" "), "utf8");
  await runFfmpeg(args, label);
  for (const p of [scriptPath, cmdPath]) {
    try {
      unlinkSync(p);
    } catch {
      /* best effort */
    }
  }
}

// ── OR badge (filled black circle PNG, generated once and cached) ────────────

let badgePromise: Promise<string | null> | null = null;

function ensureOrBadge(): Promise<string | null> {
  if (!badgePromise) {
    badgePromise = (async () => {
      const path = `${env.storageDir}/emoji/or-badge.png`;
      if (existsSync(path)) return path;
      mkdirSync(dirname(path), { recursive: true });
      try {
        await runFfmpeg(
          [
            "-y",
            "-f", "lavfi", "-i", "color=c=black:s=260x260,format=rgba",
            "-vf", "geq=a='if(lte(hypot(X-130,Y-130),126),255,0)':r=14:g=14:b=18",
            "-frames:v", "1",
            "-update", "1",
            path,
          ],
          "or-badge",
        );
        return path;
      } catch (err) {
        log.warn(`OR badge generation failed: ${err instanceof Error ? err.message : String(err)}`);
        return null;
      }
    })();
  }
  return badgePromise;
}

// ── Public renderers ─────────────────────────────────────────────────────────

export interface RenderProjectRef {
  id: string;
  title: string;
}

export interface WyrRenderOpts {
  voice?: VoiceTrackRef[];
  watermark?: string;
  theme?: string;
  musicPath?: string;
}

/** Uppercase comic label block centered around a vertical anchor. */
function splitLabel(text: string, anchorY: number, enable: string, popAt?: number): string[] {
  const lines = wrapLines(text.toUpperCase(), 22, 4);
  // Long options shrink so even a 4-line label never reaches the percentage
  // zone — AI-generated options with dramatic modifiers run long.
  const size = lines.length === 4 ? 42 : lines.length === 3 ? 48 : lines.length === 2 ? 56 : 62;
  const lineHeight = Math.round(size * 1.22);
  const startY = anchorY - Math.round(((lines.length - 1) * lineHeight) / 2);
  return lines.map((line, i) =>
    drawText({
      text: line,
      size,
      y: startY + i * lineHeight,
      color: "white",
      enable,
      borderW: 8,
      borderColor: "black",
      font: "comic",
      popAt,
    }),
  );
}

/**
 * Would-you-rather Short in the VoteVerse split style: solid blue top half vs
 * red bottom half, emoji artwork per option, comic caps labels, black OR badge
 * at the seam, green winner-percentage reveals, countdown + progress bars.
 */
export async function renderWyrVideo(
  project: RenderProjectRef,
  script: ScriptPlan,
  outPath: string,
  opts: WyrRenderOpts = {},
): Promise<void> {
  const total = clamp(script.totalDurationSec || 30, 5, 90);
  const theme = opts.theme ?? "general";
  const seamY = 950;

  // Beneath the artwork: red bottom half over the blue canvas, split by a
  // crisp black seam line through the middle (the OR badge sits on top of it).
  const pre: string[] = [
    drawBox({ x: 0, y: seamY, w: W, h: H - seamY, color: SPLIT_RED }),
    drawBox({ x: 0, y: seamY - 7, w: W, h: 14, color: "black", alpha: 0.92 }),
  ];
  const post: string[] = [];
  const images: ImageOverlayRef[] = [];

  // Badge, OR and watermark appear with the first question — the hook owns
  // the opening frame alone.
  const firstQ = script.scenes.find((s) => s.kind === "question")?.startSec ?? 0;
  const afterHook = between(firstQ, total);
  const badge = await ensureOrBadge();
  if (badge) {
    images.push({ path: badge, width: 240, x: (W - 240) / 2, y: seamY - 120, start: firstQ, end: total });
  }
  post.push(
    drawText({ text: "OR", size: 76, y: `${seamY}-th/2-14`, color: "white", font: "comic", borderW: 0, enable: afterHook }),
  );
  if (opts.watermark) {
    post.push(
      drawText({ text: opts.watermark, size: 24, y: seamY + 44, color: "white@0.85", enable: afterHook }),
    );
  }

  const scenes = script.scenes;
  const qTotal = scenes.filter((sc) => sc.kind === "question").length || 1;
  const tickWindows: { start: number; end: number }[] = [];
  const strips: StripRef[] = [];
  const whooshTimes: number[] = [];
  let qIndex = 0;

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const qs = scene.startSec;
    const qe = scene.startSec + scene.durationSec;

    if (scene.kind === "question") {
      qIndex++;
      const q = scene.question;
      const optionA = q?.optionA ?? scene.text ?? "Option A";
      const optionB = q?.optionB ?? "Option B";
      // The paired reveal scene (if adjacent) extends this question's window.
      const reveal = scenes[i + 1]?.kind === "reveal" ? scenes[i + 1] : undefined;
      const windowEnd = reveal ? reveal.startSec + reveal.durationSec : qe;
      const en = between(qs, windowEnd);

      // Emoji artwork: top-half art above the A label, bottom-half art below B.
      const [artA, artB] = await Promise.all([
        optionArt(optionA, theme, 0),
        optionArt(optionB, theme, 1),
      ]);
      // Staggered entrance (50-80ms steps): A art → A label → B art → B label.
      if (artA) images.push({ path: artA, width: 430, x: 325, y: 100, start: qs, end: windowEnd, dropIn: true });
      if (artB)
        images.push({ path: artB, width: 430, x: 325, y: 1390, start: qs + 0.08, end: windowEnd, dropIn: true });

      post.push(...splitLabel(optionA, 615, en, qs + 0.05));
      post.push(...splitLabel(optionB, 1250, en, qs + 0.13));

      // Question counter + shrinking countdown bar (question phase only).
      post.push(
        drawText({
          text: `${qIndex}/${qTotal}`,
          size: 42,
          y: 56,
          x: "w-text_w-52",
          color: "white@0.9",
          enable: en,
          borderW: 3,
          font: "comic",
        }),
      );
      // Countdown: static white track + a background-blue cover strip that
      // slides in from the right (drawbox can't animate width per frame).
      post.push(drawBox({ x: 170, y: 30, w: 820, h: 10, color: "white", alpha: 0.55, enable: between(qs, qe) }));
      strips.push({
        w: 820,
        h: 10,
        color: SPLIT_BLUE,
        xExpr: `990-820*(t-${fmt(qs)})/${fmt(Math.max(0.5, scene.durationSec))}`,
        y: 30,
        enable: between(qs, qe),
      });
      tickWindows.push({ start: qs, end: qe });

      // Reveal: percentages pop in with a whoosh, winner in green.
      if (reveal) {
        whooshTimes.push(reveal.startSec);
        const rEn = between(reveal.startSec, windowEnd);
        const pctA = clamp(Math.round(q?.percentA ?? 50), 0, 100);
        const pctB = 100 - pctA;
        post.push(
          drawText({
            text: `${pctA}%`,
            size: 84,
            y: 742,
            color: pctA >= pctB ? WIN_GREEN : "white",
            enable: rEn,
            borderW: 7,
            borderColor: "black",
            font: "comic",
            popAt: reveal.startSec,
          }),
        );
        post.push(
          drawText({
            text: `${pctB}%`,
            size: 84,
            y: 1096,
            color: pctB > pctA ? WIN_GREEN : "white",
            enable: rEn,
            borderW: 7,
            borderColor: "black",
            font: "comic",
            popAt: reveal.startSec,
          }),
        );
      }
      if (reveal) i++; // the reveal scene is folded into this window
    } else if (scene.kind === "hook") {
      // Opening: giant stacked wordmark straddling the split, staggered
      // pop-ins (per animation standards: ease-out, 50-80ms steps), emoji
      // bookends, and the hook stat in a black chip — no grey panel.
      const en = between(qs, qe);
      const words: [string, string][] = [["WOULD", "white"], ["YOU", "white"], ["RATHER", AMBER]];
      words.forEach(([word, color], wi) =>
        post.push(
          drawText({
            text: word,
            size: 150,
            y: 500 + wi * 180,
            color,
            enable: en,
            borderW: 12,
            borderColor: "black",
            font: "comic",
            popAt: qs + wi * 0.07,
          }),
        ),
      );
      const [hookA, hookB] = await Promise.all([emojiPng("🤔"), emojiPng("🤯")]);
      if (hookA) images.push({ path: hookA, width: 290, x: 395, y: 120, start: qs, end: qe, dropIn: true });
      if (hookB)
        images.push({ path: hookB, width: 290, x: 395, y: 1500, start: qs + 0.1, end: qe, dropIn: true });
      const stat = (scene.text ?? "Can you beat the internet?").toUpperCase();
      post.push(drawBox({ x: 130, y: 1158, w: W - 260, h: 112, color: "black", alpha: 0.85, enable: between(qs + 0.24, qe) }));
      post.push(
        drawText({
          text: stat,
          size: 50,
          y: 1188,
          color: "white",
          enable: between(qs + 0.24, qe),
          borderW: 4,
          font: "comic",
          popAt: qs + 0.27,
        }),
      );
    } else {
      // cta / transition — full-width band with popped caps text.
      const en = between(qs, qe);
      const text = scene.text ?? "Comment your score - subscribe for round 2";
      post.push(drawBox({ x: 0, y: 700, w: W, h: 450, color: "black", alpha: 0.72, enable: en }));
      const lines = wrapLines(text.toUpperCase(), 18, 3);
      lines.forEach((line, li) =>
        post.push(
          drawText({
            text: line,
            size: 64,
            y: 810 + li * 84,
            color: "white",
            enable: en,
            borderW: 7,
            borderColor: "black",
            font: "comic",
            popAt: qs + li * 0.06,
          }),
        ),
      );
    }
  }

  // Wobbling alarm-clock companion for the countdown, shown while it ticks.
  if (tickWindows.length > 0) {
    const clock = await emojiPng("⏰");
    if (clock) {
      images.push({
        path: clock,
        width: 116,
        x: 22,
        y: 4,
        start: tickWindows[0].start,
        end: tickWindows[tickWindows.length - 1].end,
        spin: true,
        enableExpr: tickWindows.map((w) => `between(t,${fmt(w.start)},${fmt(w.end)})`).join("+"),
      });
    }
  }

  // Bottom progress: linear violet strip sliding in from the left edge.
  strips.push({
    w: W,
    h: 12,
    color: PURPLE,
    xExpr: `-${W}+${W}*t/${fmt(total)}`,
    y: H - 12,
  });

  await renderFiltersToVideo({ pre, post }, total, outPath, `wyr:${project.id}`, SPLIT_BLUE, {
    voice: opts.voice,
    images,
    strips,
    tickWindows,
    whooshTimes,
    musicPath: opts.musicPath,
  });
}

/** Top-5 countdown: numbered cards with transcript text per moment. */
export async function renderTop5Video(
  project: RenderProjectRef,
  script: ScriptPlan,
  outPath: string,
  opts: { voice?: VoiceTrackRef[] } = {},
): Promise<void> {
  const total = clamp(script.totalDurationSec || 45, 5, 90);
  const filters: string[] = [...baseGradient()];
  const numberScenes = script.scenes.filter((sc) => sc.kind === "number").length || 5;
  let counter = numberScenes;

  for (const scene of script.scenes) {
    const s = scene.startSec;
    const e = scene.startSec + scene.durationSec;
    const en = between(s, e);
    switch (scene.kind) {
      case "hook":
        centeredLines(scene.text ?? "Top 5 funniest moments", 72, 740, {
          enable: en,
          maxChars: 20,
          maxLines: 4,
        }).forEach((t) => filters.push(t));
        break;
      case "number": {
        const label = scene.text ?? `#${counter}`;
        filters.push(drawText({ text: `#${counter}`, size: 220, y: 620, color: PURPLE, enable: en, borderW: 6 }));
        centeredLines(label.replace(/^#?\d+\s*[-—:]?\s*/, "") || label, 54, 960, {
          enable: en,
          maxChars: 22,
          maxLines: 2,
        }).forEach((t) => filters.push(t));
        counter = Math.max(1, counter - 1);
        break;
      }
      case "clip": {
        if (scene.clipRef?.label) {
          centeredLines(scene.clipRef.label, 50, 240, { enable: en, color: AMBER, maxChars: 26, maxLines: 2 }).forEach(
            (t) => filters.push(t),
          );
        }
        centeredLines(scene.text ?? "", 48, 800, { enable: en, maxChars: 28, maxLines: 5 }).forEach((t) =>
          filters.push(t),
        );
        break;
      }
      case "cta":
        centeredLines(scene.text ?? "Which one made you laugh? Subscribe!", 58, 820, {
          enable: en,
          color: AMBER,
          maxChars: 22,
          maxLines: 3,
        }).forEach((t) => filters.push(t));
        break;
      default:
        if (scene.text) {
          centeredLines(scene.text, 52, 840, { enable: en, maxChars: 26, maxLines: 4 }).forEach((t) =>
            filters.push(t),
          );
        }
    }
  }
  filters.push(progressBar(total));
  await renderFiltersToVideo({ pre: [], post: filters }, total, outPath, `top5:${project.id}`, BG_TOP5, {
    voice: opts.voice,
  });
}

export interface RenderClipInfo {
  id: string;
  title: string;
  hook: string;
  startSec: number;
  endSec: number;
  transcript: string;
}

/** Clip Short: hook, rolling caption sequence, overlays, CTA. */
export async function renderClipVideo(
  project: RenderProjectRef,
  clip: RenderClipInfo,
  plan: EditPlan,
  outPath: string,
  opts: { voice?: VoiceTrackRef[] } = {},
): Promise<void> {
  const duration = clamp(clip.endSec - clip.startSec, 5, 60);
  const filters: string[] = [...baseGradient()];

  // Title ribbon for the whole clip
  filters.push(drawText({ text: clip.title, size: 40, y: 96, color: "white@0.85", borderW: 3 }));

  // Hook — first quarter of the clip, max 3s
  const hookEnd = Math.min(3, duration * 0.3);
  const hookText = plan.hookText || clip.hook || clip.title;
  centeredLines(hookText, 64, 560, { enable: between(0, hookEnd), color: AMBER, maxChars: 20, maxLines: 3 }).forEach(
    (t) => filters.push(t),
  );

  // Caption sequence across the body of the clip
  const ctaSec = Math.min(2.2, duration * 0.2);
  const captionsEnd = duration - ctaSec;
  const words = (clip.transcript || clip.title).split(/\s+/).filter(Boolean);
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += 7) chunks.push(words.slice(i, i + 7).join(" "));
  const usableChunks = chunks.slice(0, 24);
  const windowSec = usableChunks.length ? (captionsEnd - hookEnd) / usableChunks.length : 0;
  usableChunks.forEach((chunk, i) => {
    const cs = hookEnd + i * windowSec;
    const ce = cs + windowSec;
    centeredLines(chunk, 58, 880, { enable: between(cs, ce), maxChars: 22, maxLines: 3 }).forEach((t) =>
      filters.push(t),
    );
  });

  // Overlay callouts from the edit plan
  for (const overlay of plan.overlays.slice(0, 6)) {
    filters.push(
      drawText({
        text: overlay.label,
        size: 44,
        y: 1480,
        color: AMBER,
        enable: between(overlay.atSec, overlay.atSec + 1.6),
        borderW: 3,
      }),
    );
  }

  // CTA
  centeredLines(plan.ctaText || "Follow for more", 56, 840, {
    enable: between(captionsEnd, duration),
    color: AMBER,
    maxChars: 22,
    maxLines: 2,
  }).forEach((t) => filters.push(t));

  filters.push(progressBar(duration));
  await renderFiltersToVideo({ pre: [], post: filters }, duration, outPath, `clip:${project.id}:${clip.id}`, BG_CLIP, {
    voice: opts.voice,
  });
}

/** Single-frame 1280x720 PNG thumbnail. Emoji are skipped (not in Arial). */
export async function renderThumbnail(variant: ThumbnailVariant, outPath: string): Promise<void> {
  mkdirSync(dirname(outPath), { recursive: true });
  const hex = (c: string): string => `0x${c.replace(/^#/, "")}`;
  const filters: string[] = [
    drawBox({ x: 0, y: 280, w: 1280, h: 440, color: hex(variant.bgTo), alpha: 0.35 }),
    drawBox({ x: 0, y: 430, w: 1280, h: 290, color: hex(variant.bgTo), alpha: 0.6 }),
    drawBox({ x: 0, y: 660, w: 1280, h: 22, color: hex(variant.accentColor), alpha: 0.95 }),
  ];

  if (variant.style === "split") {
    filters.push(drawBox({ x: 640, y: 0, w: 640, h: 720, color: hex(variant.bgTo), alpha: 0.5 }));
  }
  if (variant.style === "glow") {
    filters.push(drawBox({ x: 80, y: 150, w: 1120, h: 320, color: hex(variant.accentColor), alpha: 0.14 }));
  }
  if (variant.style === "face") {
    filters.push(drawBox({ x: 880, y: 110, w: 280, h: 280, color: hex(variant.accentColor), alpha: 0.35 }));
    filters.push(drawText({ text: "POV", size: 84, y: 200, x: "940", color: "white", borderW: 4 }));
  }

  const headlineLines = wrapLines(variant.headline, 16, 2);
  const headlineY = headlineLines.length === 1 ? 260 : 180;
  headlineLines.forEach((line, i) =>
    filters.push(drawText({ text: line, size: 108, y: headlineY + i * 132, color: "white", borderW: 6 })),
  );
  if (variant.subtext) {
    filters.push(drawText({ text: variant.subtext, size: 46, y: 548, color: "white@0.92", borderW: 3 }));
  }
  if (variant.style === "arrow") {
    filters.push(drawText({ text: ">>>", size: 110, y: 300, x: "1040", color: hex(variant.accentColor), borderW: 4 }));
  }
  // Predicted CTR badge
  filters.push(drawBox({ x: 32, y: 32, w: 260, h: 70, color: "black", alpha: 0.45 }));
  filters.push(
    drawText({ text: `CTR ${variant.predictedCtr}%`, size: 36, y: 48, x: "56", color: "white" }),
  );

  const args = [
    "-y",
    "-f", "lavfi", "-i", `color=c=${hex(variant.bgFrom)}:s=1280x720`,
    "-vf", filters.join(","),
    "-frames:v", "1",
    "-update", "1",
    outPath,
  ];
  await runFfmpeg(args, `thumb:${variant.id}`);
}

// ── Real-footage renderers (clips + top5 with actual source video) ───────────

export interface CaptionChunk {
  /** Absolute source-time seconds. */
  startSec: number;
  endSec: number;
  text: string;
}

export interface SourceClipRender {
  sourcePath: string;
  startSec: number;
  endSec: number;
  hook: string;
  captions: CaptionChunk[];
  watermark?: string;
  /** Corner chip for top5 parts, e.g. "#3". */
  rankBadge?: string;
  /** Cap the rendered duration (top5 keeps parts tight). */
  maxDurationSec?: number;
  /** Beast-style word-by-word karaoke captions (clips default); false = bottom
   *  segment captions (top5 parts). */
  wordKaraoke?: boolean;
}

const CLIP_ENCODE: string[] = [
  "-r", String(FPS),
  "-c:v", "libx264",
  "-preset", "veryfast",
  "-crf", "26",
  "-pix_fmt", "yuv420p",
  "-c:a", "aac",
  "-b:a", "128k",
  "-ar", "44100",
  "-ac", "2",
  "-movflags", "+faststart",
];

/** Split caption text into short bottom-screen lines. */
function captionLines(text: string): string[] {
  return wrapLines(text, 26, 2);
}

/** Beast-style word events: distribute each caption chunk's window across its
 *  words, one word (or two tiny ones) on screen at a time. */
function wordEvents(
  captions: CaptionChunk[],
  clipStart: number,
  duration: number,
): { start: number; end: number; word: string }[] {
  const events: { start: number; end: number; word: string }[] = [];
  for (const c of captions) {
    const start = Math.max(0, c.startSec - clipStart);
    const end = Math.min(duration, c.endSec - clipStart);
    if (end <= start + 0.05) continue;
    const words = c.text.split(/\s+/).filter(Boolean);
    if (words.length === 0) continue;
    const per = clamp((end - start) / words.length, 0.14, 0.9);
    // Merge very short words with the next one so "a", "to" don't flash alone.
    const merged: string[] = [];
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      if (w.length <= 2 && i + 1 < words.length) {
        merged.push(`${w} ${words[i + 1]}`);
        i++;
      } else {
        merged.push(w);
      }
    }
    const perM = clamp((end - start) / merged.length, 0.16, 1.1);
    merged.forEach((word, i) => {
      const ws = start + i * perM;
      if (ws >= duration - 0.05) return;
      events.push({ start: ws, end: Math.min(duration, ws + perM), word });
    });
  }
  return events.slice(0, 160);
}

/**
 * Cut a real segment from the source, fullscreen 9:16 center-crop (reference:
 * Beast-style clip Shorts) with word-karaoke or bottom captions, watermark,
 * progress bar and original audio.
 */
export async function renderClipFromSource(spec: SourceClipRender, outPath: string): Promise<void> {
  mkdirSync(dirname(outPath), { recursive: true });
  const duration = clamp(
    Math.min(spec.endSec - spec.startSec, spec.maxDurationSec ?? 60),
    2,
    60,
  );
  const d = fmt(duration);
  const karaoke = spec.wordKaraoke ?? true;

  const filters: string[] = [];
  // Rank badge chip (top5).
  if (spec.rankBadge) {
    filters.push(drawBox({ x: 40, y: 60, w: 200, h: 96, color: "black", alpha: 0.72 }));
    filters.push(
      drawText({ text: spec.rankBadge, size: 62, y: 76, x: "70", color: AMBER, borderW: 4, font: "comic" }),
    );
  }
  if (spec.watermark) {
    filters.push(
      drawText({ text: spec.watermark, size: 26, y: 64, x: "w-text_w-48", color: "white@0.75" }),
    );
  }

  if (karaoke) {
    // One giant word at a time, mid-frame; style rotates between white with
    // heavy outline, black on yellow box, and yellow with outline (reference).
    const YELLOW = "0xFFD400";
    for (const [i, ev] of wordEvents(spec.captions, spec.startSec, duration).entries()) {
      const variant = fnv1a(`${ev.word}:${i}`) % 10;
      const en = between(ev.start, ev.end);
      const word = ev.word.toUpperCase();
      if (variant < 5) {
        filters.push(
          drawText({ text: word, size: 108, y: 960, color: "white", enable: en, borderW: 11, borderColor: "black", font: "comic" }),
        );
      } else if (variant < 8) {
        filters.push(
          `drawtext=${fontOption("comic")}expansion=none:text='${sanitizeDrawtext(word)}':fontsize=108:fontcolor=black:box=1:boxcolor=${YELLOW}:boxborderw=22:x='(w-text_w)/2':y='960':enable='${en}'`,
        );
      } else {
        filters.push(
          drawText({ text: word, size: 108, y: 960, color: YELLOW, enable: en, borderW: 11, borderColor: "black", font: "comic" }),
        );
      }
    }
  } else {
    // Bottom segment captions (top5 parts).
    const chunks = spec.captions
      .map((c) => ({
        start: Math.max(0, c.startSec - spec.startSec),
        end: Math.min(duration, c.endSec - spec.startSec),
        text: c.text,
      }))
      .filter((c) => c.end > 0.15 && c.start < duration - 0.1)
      .slice(0, 48);
    for (const chunk of chunks) {
      captionLines(chunk.text.toUpperCase()).forEach((line, i) =>
        filters.push(
          drawText({
            text: line,
            size: 54,
            y: 1440 + i * 70,
            color: "white",
            enable: between(chunk.start, Math.max(chunk.start + 0.4, chunk.end)),
            borderW: 7,
            borderColor: "black",
            font: "comic",
            popAt: chunk.start,
          }),
        ),
      );
    }
  }

  const graph = [
    `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}[comp]`,
    `[comp]${filters.join(",\n")}[withtext]`,
    // Linear progress bar strip along the bottom.
    `[withtext][1:v]overlay=x='-${W}+${W}*t/${d}':y=${H - 12}[vout]`,
    `[0:a]aresample=44100,aformat=channel_layouts=stereo,alimiter=limit=0.891[aout]`,
  ].join(";\n");

  const scriptPath = `${outPath}.filtergraph.txt`;
  writeFileSync(scriptPath, graph, "utf8");
  const args = [
    "-y",
    "-ss", fmt(spec.startSec),
    "-i", spec.sourcePath,
    "-f", "lavfi", "-i", `color=c=${PURPLE}:s=${W}x12:r=2:d=${d}`,
    "-filter_complex_script", scriptPath,
    "-map", "[vout]",
    "-map", "[aout]",
    ...CLIP_ENCODE,
    "-t", d,
    outPath,
  ];
  // Filtergraph is kept on failure as the debugging artifact.
  await runFfmpeg(args, `clip-src:${outPath.slice(-24)}`);
  try {
    unlinkSync(scriptPath);
  } catch {
    /* best effort */
  }
}

/** 1s countdown stinger card: giant number, label, impact SFX. */
async function renderStingerCard(rank: number, label: string, outPath: string): Promise<void> {
  const filters: string[] = [
    drawBox({ x: 0, y: 950, w: W, h: H - 950, color: "0x1c0f38" }),
    drawText({ text: `#${rank}`, size: 300, y: 620, color: AMBER, borderW: 14, borderColor: "black", font: "comic", popAt: 0.02 }),
  ];
  wrapLines(label.toUpperCase(), 22, 2).forEach((line, i) =>
    filters.push(
      drawText({ text: line, size: 58, y: 1080 + i * 76, color: "white", borderW: 7, borderColor: "black", font: "comic", popAt: 0.12 }),
    ),
  );
  const graph = [`[0:v]${filters.join(",\n")}[vout]`, `[1:a]anull[aout]`].join(";\n");
  const scriptPath = `${outPath}.filtergraph.txt`;
  writeFileSync(scriptPath, graph, "utf8");
  const args = [
    "-y",
    "-f", "lavfi", "-i", `color=c=0x2a1458:s=${W}x${H}:r=${FPS}:d=1.0`,
    "-f", "lavfi", "-i", `aevalsrc='0.7*sin(2*PI*(160-90*t)*t)*exp(-3.5*t)':s=44100:d=1.0`,
    "-filter_complex_script", scriptPath,
    "-map", "[vout]",
    "-map", "[aout]",
    ...CLIP_ENCODE,
    "-t", "1.0",
    outPath,
  ];
  // Filtergraph is kept on failure as the debugging artifact.
  await runFfmpeg(args, `stinger:${rank}`);
  try {
    unlinkSync(scriptPath);
  } catch {
    /* best effort */
  }
}

/** Closing CTA card with a soft pad. */
async function renderCtaCard(text: string, outPath: string): Promise<void> {
  const filters: string[] = [];
  wrapLines(text.toUpperCase(), 18, 3).forEach((line, i) =>
    filters.push(
      drawText({ text: line, size: 66, y: 820 + i * 88, color: "white", borderW: 8, borderColor: "black", font: "comic", popAt: 0.05 + i * 0.06 }),
    ),
  );
  const graph = [`[0:v]${filters.join(",\n")}[vout]`, `[1:a]anull[aout]`].join(";\n");
  const scriptPath = `${outPath}.filtergraph.txt`;
  writeFileSync(scriptPath, graph, "utf8");
  const args = [
    "-y",
    "-f", "lavfi", "-i", `color=c=0x2a1458:s=${W}x${H}:r=${FPS}:d=2.2`,
    "-f", "lavfi", "-i", `aevalsrc='0.05*(sin(2*PI*220*t)+0.8*sin(2*PI*330*t))':s=44100:d=2.2`,
    "-filter_complex_script", scriptPath,
    "-map", "[vout]",
    "-map", "[aout]",
    ...CLIP_ENCODE,
    "-t", "2.2",
    outPath,
  ];
  // Filtergraph is kept on failure as the debugging artifact.
  await runFfmpeg(args, "cta-card");
  try {
    unlinkSync(scriptPath);
  } catch {
    /* best effort */
  }
}

export interface Top5SourcePart {
  rank: number;
  title: string;
  startSec: number;
  endSec: number;
  captions: CaptionChunk[];
  /** Per-part section file for long VODs (falls back to the shared source). */
  sourcePath?: string;
  fileStartSec?: number;
}

/**
 * Top-5 countdown from real footage: [#5 stinger → clip] … [#1 stinger → clip]
 * → CTA, stitched with the concat demuxer (uniform encodes → stream copy,
 * re-encode fallback).
 */
export async function renderTop5FromSource(
  sourcePath: string | null,
  parts: Top5SourcePart[],
  ctaText: string,
  watermark: string | undefined,
  outPath: string,
): Promise<void> {
  mkdirSync(dirname(outPath), { recursive: true });
  const workDir = `${outPath}.parts`;
  mkdirSync(workDir, { recursive: true });
  const partFiles: string[] = [];

  try {
    const ordered = [...parts].sort((a, b) => b.rank - a.rank); // 5 → 1
    for (const part of ordered) {
      const stingerPath = join(workDir, `s${part.rank}.mp4`);
      await renderStingerCard(part.rank, part.title, stingerPath);
      partFiles.push(stingerPath);

      const src = part.sourcePath ?? sourcePath;
      if (!src) continue;
      const shift = part.fileStartSec ?? 0;
      const clipPath = join(workDir, `c${part.rank}.mp4`);
      await renderClipFromSource(
        {
          sourcePath: src,
          startSec: part.startSec - shift,
          endSec: part.endSec - shift,
          hook: "",
          captions: part.captions.map((c) => ({ ...c, startSec: c.startSec - shift, endSec: c.endSec - shift })),
          watermark,
          rankBadge: `#${part.rank}`,
          maxDurationSec: 8,
        },
        clipPath,
      );
      partFiles.push(clipPath);
    }
    const ctaPath = join(workDir, "cta.mp4");
    await renderCtaCard(ctaText, ctaPath);
    partFiles.push(ctaPath);

    const listPath = join(workDir, "list.txt");
    writeFileSync(
      listPath,
      partFiles.map((p) => `file '${p.replace(/\\/g, "/")}'`).join("\n"),
      "utf8",
    );
    try {
      await runFfmpeg(
        ["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", "-movflags", "+faststart", outPath],
        "top5-concat",
      );
    } catch {
      // Stream copy can be picky — re-encode as the safe fallback.
      await runFfmpeg(
        ["-y", "-f", "concat", "-safe", "0", "-i", listPath, ...CLIP_ENCODE, outPath],
        "top5-concat-reencode",
      );
    }
  } finally {
    for (const f of partFiles) {
      try {
        unlinkSync(f);
      } catch {
        /* best effort */
      }
    }
    try {
      unlinkSync(join(workDir, "list.txt"));
      rmdirSync(workDir);
    } catch {
      /* best effort */
    }
  }
}
