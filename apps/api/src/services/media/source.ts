import { execFile } from "node:child_process";
import { existsSync, statSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fnv1a } from "@fable/shared";
import { env } from "../../config/env";
import { hasYtdlp } from "../../lib/capabilities";
import { createLogger } from "../../lib/logger";

const log = createLogger("source");

const DOWNLOAD_TIMEOUT_MS = 420_000;

/**
 * Whole-source downloads get longer: they are the reliable path (yt-dlp fetches
 * DASH itself, where a per-clip section hands the URL to ffmpeg and YouTube
 * answers 403), and a two-hour 720p source is ~1.7GB. At 7 minutes a slow link
 * timed out mid-download and the caller silently rendered a picture-less clip.
 */
const FULL_DOWNLOAD_TIMEOUT_MS = 900_000;

/**
 * Download (and cache) the source video for a clips/top5 project.
 * 720p mp4 cap keeps downloads fast and files manageable; clips are cut from
 * this local copy with ffmpeg. Returns null when yt-dlp is unavailable or the
 * download fails — callers fall back to the text-style render.
 */
/** Source duration in seconds via yt-dlp metadata (0 when unknown). */
export async function getSourceDurationSec(sourceUrl: string): Promise<number> {
  if (!(await hasYtdlp())) return 0;
  return new Promise((resolve) => {
    execFile(
      env.ytdlpPath,
      ["--js-runtimes", "node", "--no-playlist", "--skip-download", "--print", "duration", "--", sourceUrl],
      { timeout: 60_000 },
      (err, stdout) => resolve(err ? 0 : Math.round(Number(String(stdout).trim())) || 0),
    );
  });
}

export interface SourceSection {
  path: string;
  /** Absolute source time where this section file begins. */
  fileStartSec: number;
}

/**
 * Download just one clip's window (±2s pad, exact cuts) — the sane way to cut
 * Shorts out of multi-hour VODs without pulling gigabytes.
 */
export async function ensureSourceSection(
  sourceUrl: string,
  startSec: number,
  endSec: number,
): Promise<SourceSection | null> {
  if (!sourceUrl || !(await hasYtdlp())) return null;
  const pad = 2;
  const from = Math.max(0, Math.floor(startSec - pad));
  const to = Math.ceil(endSec + pad);

  const dir = join(env.storageDir, "sources");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `sec-${(fnv1a(sourceUrl) >>> 0).toString(36)}-${from}-${to}.mp4`);
  if (existsSync(path) && statSync(path).size > 50_000) return { path, fileStartSec: from };

  log.info(`Downloading section ${from}-${to}s of ${sourceUrl}`);
  try {
    await new Promise<void>((resolve, reject) => {
      execFile(
        env.ytdlpPath,
        [
          "--js-runtimes", "node",
          "-f", "bv*[height<=720]+ba/b[height<=720]/b",
          "--merge-output-format", "mp4",
          "--download-sections", `*${from}-${to}`,
          "--force-keyframes-at-cuts",
          "--no-playlist",
          "--force-overwrites",
          "-o", path,
          "--", sourceUrl,
        ],
        { timeout: DOWNLOAD_TIMEOUT_MS },
        (err) => (err ? reject(err) : resolve()),
      );
    });
    if (!existsSync(path) || statSync(path).size < 50_000) {
      throw new Error("section download produced no usable file");
    }
    return { path, fileStartSec: from };
  } catch (err) {
    log.warn(`Section download failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

export async function ensureSourceVideo(sourceUrl: string): Promise<string | null> {
  if (!sourceUrl || !(await hasYtdlp())) return null;

  const dir = join(env.storageDir, "sources");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `src-${(fnv1a(sourceUrl) >>> 0).toString(36)}.mp4`);

  if (existsSync(path) && statSync(path).size > 100_000) return path;

  log.info(`Downloading source: ${sourceUrl}`);
  try {
    await new Promise<void>((resolve, reject) => {
      execFile(
        env.ytdlpPath,
        [
          "--js-runtimes", "node",
          "-f", "bv*[height<=720][ext=mp4]+ba[ext=m4a]/b[height<=720][ext=mp4]/b[height<=720]",
          "--merge-output-format", "mp4",
          "--no-playlist",
          "--force-overwrites",
          "-o", path,
          "--", sourceUrl,
        ],
        { timeout: FULL_DOWNLOAD_TIMEOUT_MS },
        (err) => (err ? reject(err) : resolve()),
      );
    });
    if (!existsSync(path) || statSync(path).size < 100_000) {
      throw new Error("download produced no usable file");
    }
    log.info(`Source cached: ${path} (${Math.round(statSync(path).size / 1_048_576)}MB)`);
    return path;
  } catch (err) {
    log.warn(`Source download failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}
