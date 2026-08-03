// ── Clip moment detector ─────────────────────────────────────────────────────
// Scores transcript segments with marker weights (laughter 30, shouting 20),
// exclamation density, keyword tables and energy, then merges adjacent hot
// segments into 15-45s windows with a full ScoreBreakdown each. Pure and
// deterministic — same segments in, same moments out.

import type { ScoreBreakdown, TranscriptSegment } from "@fable/shared";
import { clamp, fnv1a, pick, seededRandom } from "@fable/shared";
import { aiCompleteJson, isMockAi } from "../ai";

export { buildTop5Script, buildClipEditPlan } from "./script";
export type { MomentLike } from "./script";

export interface Moment {
  title: string;
  hook: string;
  startSec: number;
  endSec: number;
  score: number;
  breakdown: ScoreBreakdown;
  transcript: string;
}

// ── Keyword tables ───────────────────────────────────────────────────────────

const KEYWORDS = {
  funny: [
    "lmao", "lol", "laugh", "hilarious", "comedy", "joke", "clown", "crying",
    "deceased", "dead", "funniest", "bounced back", "disrespect", "lazy",
  ],
  shock: [
    "no way", "what", "insane", "unreal", "clutch", "one hp", "impossible",
    "first try", "cross-map", "world record", "he peeked", "actually did it",
    "through the smoke", "wait wait",
  ],
  drama: [
    "rage", "tilted", "sold", "shambles", "refuse", "ruin", "delete",
    "complaint", "disgust", "never again", "sit down", "losing",
  ],
  emotional: [
    "proud", "wholesome", "thank you", "crying", "subbed", "donation",
    "been here since", "best stream", "love", "miracle", "believe",
  ],
} as const;

const ENERGY_OPENERS = ["wait", "no", "he", "and", "okay okay", "chat", "the", "last"];

function countHits(lower: string, words: readonly string[]): number {
  let hits = 0;
  for (const w of words) if (lower.includes(w)) hits++;
  return hits;
}

// ── Per-segment scoring ──────────────────────────────────────────────────────

interface ScoredSegment {
  segment: TranscriptSegment;
  breakdown: ScoreBreakdown;
  segScore: number;
}

function scoreSegment(segment: TranscriptSegment): ScoredSegment {
  const text = segment.text;
  const lower = text.toLowerCase();
  const markers = segment.markers ?? [];
  const words = lower.split(/\s+/).filter(Boolean);

  const exclamations = (text.match(/!/g) ?? []).length;
  const capsWords = (text.match(/\b[A-Z]{3,}\b/g) ?? []).length;
  const hasLaughter = markers.includes("laughter");
  const hasShouting = markers.includes("shouting");

  const humor = clamp(
    (hasLaughter ? 30 : 0) + countHits(lower, KEYWORDS.funny) * 11 + exclamations * 3 + capsWords * 2,
    0,
    100,
  );
  const shock = clamp(
    (hasShouting ? 14 : 0) + countHits(lower, KEYWORDS.shock) * 13 + exclamations * 4,
    0,
    100,
  );
  const drama = clamp(
    (hasShouting ? 10 : 0) + countHits(lower, KEYWORDS.drama) * 13 + capsWords * 4,
    0,
    100,
  );
  const emotion = clamp(countHits(lower, KEYWORDS.emotional) * 16, 0, 100);
  const informativeness = clamp(
    Math.round(words.length * 1.4) - exclamations * 4 - (hasShouting ? 10 : 0),
    5,
    60,
  );
  const energy = clamp(
    (hasShouting ? 20 : 0) +
      (hasLaughter ? 12 : 0) +
      exclamations * 6 +
      capsWords * 5 +
      (markers.includes("music") ? 4 : 0) -
      (markers.includes("silence") ? 10 : 0),
    0,
    100,
  );
  const hookStrength = clamp(
    (ENERGY_OPENERS.some((w) => lower.startsWith(w)) ? 22 : 6) +
      (text.includes("?") ? 10 : 0) +
      (words.length <= 18 ? 12 : 0) +
      exclamations * 4,
    0,
    100,
  );

  const breakdown: ScoreBreakdown = {
    humor,
    shock,
    emotion,
    drama,
    informativeness,
    energy,
    hookStrength,
  };
  return { segment, breakdown, segScore: momentScore(breakdown) };
}

/** Weighted total for a breakdown (weights sum to 1.0). */
export function momentScore(b: ScoreBreakdown): number {
  return clamp(
    Math.round(
      b.humor * 0.28 +
        b.shock * 0.18 +
        b.emotion * 0.12 +
        b.drama * 0.12 +
        b.informativeness * 0.05 +
        b.energy * 0.15 +
        b.hookStrength * 0.1,
    ),
    0,
    100,
  );
}

// ── Window merging ───────────────────────────────────────────────────────────

const MIN_WINDOW = 15;
const MAX_WINDOW = 45;
const HOT_THRESHOLD = 40;

interface Window {
  members: ScoredSegment[];
  startSec: number;
  endSec: number;
}

function averageBreakdown(members: ScoredSegment[]): ScoreBreakdown {
  const keys: (keyof ScoreBreakdown)[] = [
    "humor", "shock", "emotion", "drama", "informativeness", "energy", "hookStrength",
  ];
  const out = {} as ScoreBreakdown;
  for (const key of keys) {
    // Blend of peak and mean — a window is as good as its best beat, tempered
    // by how consistently the rest of it holds up.
    const values = members.map((m) => m.breakdown[key]);
    const peak = Math.max(...values);
    const mean = values.reduce((a, v) => a + v, 0) / values.length;
    out[key] = clamp(Math.round(peak * 0.65 + mean * 0.35), 0, 100);
  }
  return out;
}

function buildWindows(scored: ScoredSegment[]): Window[] {
  const windows: Window[] = [];
  const used = new Set<number>();

  // Pass 1: groups of consecutive hot segments.
  let i = 0;
  while (i < scored.length) {
    if (used.has(i) || scored[i].segScore < HOT_THRESHOLD) {
      i++;
      continue;
    }
    const members: ScoredSegment[] = [];
    let j = i;
    while (
      j < scored.length &&
      !used.has(j) &&
      scored[j].segScore >= HOT_THRESHOLD &&
      scored[j].segment.endSec - scored[i].segment.startSec <= MAX_WINDOW
    ) {
      members.push(scored[j]);
      used.add(j);
      j++;
    }
    windows.push(expandWindow(scored, members, i, j - 1, used));
    i = j;
  }

  // Pass 2: top leftover single segments become their own windows so sparse
  // transcripts still yield enough candidates.
  const leftovers = scored
    .map((s, idx) => ({ s, idx }))
    .filter(({ idx }) => !used.has(idx))
    .sort((a, b) => b.s.segScore - a.s.segScore);
  for (const { s, idx } of leftovers) {
    if (windows.length >= scored.length) break;
    if (s.segScore < 12) continue;
    windows.push(expandWindow(scored, [s], idx, idx, used));
    used.add(idx);
  }
  return windows;
}

/** Pad a window with neighbouring segments until it reaches 15s, cap at 45s. */
function expandWindow(
  scored: ScoredSegment[],
  members: ScoredSegment[],
  firstIdx: number,
  lastIdx: number,
  used: Set<number>,
): Window {
  let start = members[0].segment.startSec;
  let end = members[members.length - 1].segment.endSec;
  let lo = firstIdx;
  let hi = lastIdx;

  while (end - start < MIN_WINDOW && (lo > 0 || hi < scored.length - 1)) {
    const prev = lo > 0 ? scored[lo - 1] : null;
    const next = hi < scored.length - 1 ? scored[hi + 1] : null;
    // Prefer whichever neighbour scores higher — it keeps the window hot.
    if (prev && (!next || prev.segScore >= next.segScore) && !used.has(lo - 1)) {
      lo--;
      used.add(lo);
      members.unshift(prev);
      start = prev.segment.startSec;
    } else if (next && !used.has(hi + 1)) {
      hi++;
      used.add(hi);
      members.push(next);
      end = next.segment.endSec;
    } else {
      break;
    }
  }

  if (end - start < MIN_WINDOW) end = start + MIN_WINDOW; // edge-of-VOD padding
  if (end - start > MAX_WINDOW) end = start + MAX_WINDOW;
  return { members, startSec: start, endSec: end };
}

// ── Titles & hooks ───────────────────────────────────────────────────────────

const TITLES: Record<string, readonly string[]> = {
  humor: [
    "This Broke The Whole Chat 😂",
    "Try Not To Laugh At This One",
    "He Can't Be Serious LMAO",
    "The Funniest Thing He's Ever Done",
  ],
  shock: [
    "NO WAY This Just Happened",
    "The Clutch Nobody Saw Coming",
    "1 HP And He Does THIS",
    "The Shot That Shouldn't Exist",
  ],
  drama: [
    "Full Tilt In 10 Seconds Flat",
    "He Rage Quit On The Spot",
    "The Teammate Betrayal Of The Year",
    "Economy In SHAMBLES",
  ],
  emotion: [
    "The Donation That Broke Him",
    "Wholesome Moment Of The Year 🥹",
    "Three Months Of Grinding — Worth It",
    "Chat Made Him Cry (Real)",
  ],
  energy: [
    "Chaos Mode: ACTIVATED",
    "Full Volume Warning ⚠️",
    "The Loudest 30 Seconds On Twitch",
    "Peak Stream Energy Right Here",
  ],
  fallback: [
    "You Need To See This Moment",
    "The Clip Everyone's Sharing",
    "Wait For It...",
    "This Moment Went Viral Instantly",
  ],
};

const HOOKS: Record<string, readonly string[]> = {
  humor: ["Wait for the laugh 😂", "He didn't mean to be this funny", "Chat could NOT recover"],
  shock: ["Watch his face 😱", "The ending is unreal", "Nobody predicted this"],
  drama: ["It escalates FAST", "The rage is real", "He was NOT ready"],
  emotion: ["Wholesome alert 🥹", "This one hits different", "Grab a tissue"],
  energy: ["Sound ON for this", "Volume warning ⚠️", "Pure chaos incoming"],
  fallback: ["Wait for it…", "Watch to the end", "You're not ready"],
};

function dominantKey(b: ScoreBreakdown): string {
  const ranked: [string, number][] = [
    ["humor", b.humor],
    ["shock", b.shock],
    ["drama", b.drama],
    ["emotion", b.emotion],
    ["energy", b.energy],
  ];
  ranked.sort((x, y) => y[1] - x[1]);
  return ranked[0][1] >= 25 ? ranked[0][0] : "fallback";
}

function makeMoment(window: Window): Moment {
  const breakdown = averageBreakdown(window.members);
  const transcript = window.members.map((m) => m.segment.text).join(" ");
  const key = dominantKey(breakdown);
  const rand = seededRandom(fnv1a(`${transcript.slice(0, 80)}:${window.startSec}`) || 1);
  const groupBonus = Math.min(8, (window.members.length - 1) * 3);

  return {
    title: pick(rand, TITLES[key] ?? TITLES.fallback),
    hook: pick(rand, HOOKS[key] ?? HOOKS.fallback),
    startSec: Math.round(window.startSec * 10) / 10,
    endSec: Math.round(window.endSec * 10) / 10,
    score: clamp(momentScore(breakdown) + groupBonus, 0, 100),
    breakdown,
    transcript,
  };
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Detect the `count` best clip-worthy windows in a transcript, sorted score
 * desc. `minScore` is the caller's keep-threshold — moments below it are still
 * returned (as candidates for manual review) so the caller decides.
 */
// ── AI moment selection (heuristics remain the offline fallback) ─────────────

interface AiMoment {
  startSec?: number;
  endSec?: number;
  title?: string;
  hook?: string;
  score?: number;
  angle?: string;
}

function compactTranscript(segments: TranscriptSegment[], maxChars = 13_000): string {
  const lines: string[] = [];
  let used = 0;
  for (const s of segments) {
    const line = `[${Math.round(s.startSec)}-${Math.round(s.endSec)}] ${s.text}${s.markers?.length ? ` {${s.markers.join(",")}}` : ""}`;
    if (used + line.length > maxChars) break;
    lines.push(line);
    used += line.length + 1;
  }
  return lines.join("\n");
}

function segmentsText(segments: TranscriptSegment[], startSec: number, endSec: number): string {
  return segments
    .filter((s) => s.endSec > startSec && s.startSec < endSec)
    .map((s) => s.text)
    .join(" ")
    .slice(0, 600);
}

/** GPT reads the transcript and picks clip-worthy windows with real titles. */
async function aiDetect(
  segments: TranscriptSegment[],
  count: number,
  emphasis: string,
): Promise<Moment[] | null> {
  if (isMockAi()) return null;
  const total = Math.round(segments[segments.length - 1]?.endSec ?? 0);
  try {
    const parsed = await aiCompleteJson<{ moments?: AiMoment[] } | AiMoment[]>({
      system:
        "You are a viral Shorts editor. You find the most clip-worthy moments in transcripts and write titles that make people stop scrolling. Respond with JSON only.",
      prompt: `Transcript of a ${total}s video (lines are [start-end] text):\n\n${compactTranscript(segments)}\n\nPick EXACTLY ${count} clip-worthy moments${emphasis} — always return ${count} even if some are weaker (score them honestly). Rules: each moment 12-40 seconds long, aligned to the bracketed timestamps, no overlaps, spread across the video where quality allows. Respond as JSON: {"moments":[{"startSec":<n>,"endSec":<n>,"title":"<content-specific, curiosity-driven, max 60 chars>","hook":"<on-screen overlay for second one, max 45 chars>","score":<40-95 how strong this clip is>}]}`,
      maxTokens: 2400,
    });
    const raw = Array.isArray(parsed) ? parsed : (parsed?.moments ?? []);
    const moments: Moment[] = [];
    for (const m of raw) {
      const startSec = Math.max(0, Number(m.startSec) || 0);
      const endSec = Math.min(total || Number(m.endSec) || 0, Number(m.endSec) || 0);
      if (!(endSec > startSec + 5)) continue;
      const score = clamp(Math.round(Number(m.score) || 60), 30, 98);
      moments.push({
        title: (m.title ?? "").trim().slice(0, 80) || segmentsText(segments, startSec, endSec).slice(0, 60),
        hook: (m.hook ?? "").trim().slice(0, 60),
        startSec,
        endSec: Math.min(endSec, startSec + 60),
        score,
        breakdown: {
          humor: score,
          shock: score,
          emotion: score,
          drama: score,
          informativeness: score,
          energy: score,
          hookStrength: score,
        },
        transcript: segmentsText(segments, startSec, endSec),
      });
    }
    return moments.length > 0 ? moments : null;
  } catch {
    return null;
  }
}

/** Heuristic windows that don't overlap the already-chosen AI moments. */
function heuristicTopUp(
  segments: TranscriptSegment[],
  chosen: Moment[],
  needed: number,
): Moment[] {
  if (needed <= 0) return [];
  const scored = segments.map(scoreSegment);
  const windows = buildWindows(scored);
  const extras = windows
    .map(makeMoment)
    .filter((m) => !chosen.some((c) => m.startSec < c.endSec && m.endSec > c.startSec));
  extras.sort((a, b) => b.score - a.score || a.startSec - b.startSec);
  return extras.slice(0, needed);
}

export async function detectMoments(
  segments: TranscriptSegment[],
  opts: { count: number; minScore: number },
): Promise<Moment[]> {
  if (segments.length === 0) return [];
  const wanted = clamp(Math.floor(opts.count) || 5, 1, 50);

  const ai = await aiDetect(segments, wanted, "");
  if (ai) {
    ai.sort((a, b) => b.score - a.score || a.startSec - b.startSec);
    const picked = ai.slice(0, wanted);
    picked.push(...heuristicTopUp(segments, picked, wanted - picked.length));
    return picked;
  }

  const scored = segments.map(scoreSegment);
  const windows = buildWindows(scored);
  const moments = windows.map(makeMoment);

  moments.sort(
    (a, b) => b.score - a.score || a.startSec - b.startSec,
  );
  return moments.slice(0, wanted);
}

/**
 * The five funniest windows, ranked funniest first. AI-selected when a
 * provider is live; heuristic humor ranking otherwise. buildTop5Script
 * re-orders them into countdown order itself.
 */
export async function pickTop5Funniest(segments: TranscriptSegment[]): Promise<Moment[]> {
  if (segments.length === 0) return [];

  const ai = await aiDetect(segments, 5, " — specifically the FUNNIEST/most entertaining moments");
  if (ai) {
    ai.sort((a, b) => b.score - a.score || a.startSec - b.startSec);
    const picked = ai.slice(0, 5);
    picked.push(...heuristicTopUp(segments, picked, 5 - picked.length));
    return picked;
  }

  const scored = segments.map(scoreSegment);
  const windows = buildWindows(scored);
  const moments = windows.map(makeMoment);

  moments.sort(
    (a, b) =>
      b.breakdown.humor - a.breakdown.humor ||
      b.score - a.score ||
      a.startSec - b.startSec,
  );
  return moments.slice(0, 5);
}
