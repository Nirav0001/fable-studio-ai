import { env } from "../config/env";
import { badRequest } from "./errors";
import { createLogger } from "./logger";

const log = createLogger("security");

/**
 * Hosts we allow the media pipeline (yt-dlp/ffmpeg) to fetch from. Anything
 * else is rejected before a subprocess ever sees it — this is the primary
 * defense against SSRF and yt-dlp argument/flag injection.
 */
const ALLOWED_HOST_SUFFIXES = [
  "youtube.com",
  "youtu.be",
  "twitch.tv",
  "tiktok.com",
  "vimeo.com",
  "streamable.com",
  "dailymotion.com",
];

function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return true;
  // Cloud metadata + loopback + RFC1918 + link-local literals.
  if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  if (h === "169.254.169.254" || h === "metadata.google.internal") return true;
  if (h === "::1" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80")) return true;
  return false;
}

/**
 * Validate a user-supplied media source URL. Returns the normalized URL string
 * or throws a 400. Guarantees: https only, no leading-dash arg-injection, a
 * real hostname on the platform allowlist, never an internal/metadata target.
 */
export function assertSafeSourceUrl(input: unknown): string {
  if (typeof input !== "string" || input.trim().length === 0) {
    throw badRequest("A source URL is required");
  }
  const raw = input.trim();
  // Reject anything a subprocess could read as a flag/option.
  if (raw.startsWith("-")) throw badRequest("Invalid source URL");

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw badRequest("Invalid source URL");
  }
  if (url.protocol !== "https:") {
    throw badRequest("Source URL must be https");
  }
  if (isPrivateHost(url.hostname)) {
    log.warn(`Blocked SSRF attempt to ${url.hostname}`);
    throw badRequest("That URL host is not allowed");
  }
  const host = url.hostname.toLowerCase();
  const allowed = ALLOWED_HOST_SUFFIXES.some((s) => host === s || host.endsWith(`.${s}`));
  if (!allowed) {
    throw badRequest(
      "Source must be a YouTube, Twitch, TikTok, Vimeo, Streamable, Dailymotion or Vimeo link",
    );
  }
  return url.toString();
}

/** Fail-closed production configuration check — call before the server listens. */
export function assertProductionConfig(): void {
  if (!env.isProd) return;
  const problems: string[] = [];

  if (!env.jwtSecret || env.jwtSecret === "dev-secret-fable-studio" || env.jwtSecret.length < 32) {
    problems.push("JWT_SECRET must be set to a random string of at least 32 characters");
  }
  if (env.authDevBypass) {
    problems.push("AUTH_DEV_BYPASS must be false in production");
  }
  if (!env.databaseUrl.startsWith("postgres")) {
    problems.push("DATABASE_URL must point at PostgreSQL in production");
  }

  if (problems.length > 0) {
    log.error("Refusing to start — insecure production configuration:");
    for (const p of problems) log.error(`  • ${p}`);
    throw new Error(`Insecure production configuration: ${problems.join("; ")}`);
  }
  log.info("Production configuration check passed");
}
