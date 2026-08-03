import rateLimit from "express-rate-limit";

/** Global API limiter — generous for a dashboard, strict enough for abuse. */
export const apiLimiter = rateLimit({
  windowMs: 60_000,
  limit: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: { code: "RATE_LIMITED", message: "Too many requests" } },
});

import type { Request } from "express";

/** Key expensive limiters on the authenticated user (fall back to IP). */
function userKey(req: Request): string {
  return req.user?.id ?? req.ip ?? "anon";
}

/** Tighter limiter for expensive AI generation endpoints (per user). */
export const aiLimiter = rateLimit({
  windowMs: 60_000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userKey,
  message: { ok: false, error: { code: "RATE_LIMITED", message: "AI rate limit reached" } },
});

/**
 * Heavy-job limiter for project create / generate / render — each can spawn
 * yt-dlp downloads, FFmpeg renders and paid AI/TTS calls. Per user, so one
 * account cannot exhaust CPU/disk/bandwidth or run up unbounded API spend.
 */
export const heavyJobLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userKey,
  message: {
    ok: false,
    error: { code: "RATE_LIMITED", message: "Too many jobs — slow down a moment" },
  },
});

/** Auth endpoints — brute-force protection. */
export const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: { code: "RATE_LIMITED", message: "Too many attempts, try later" } },
});
