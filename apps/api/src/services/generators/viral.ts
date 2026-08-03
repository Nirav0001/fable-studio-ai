// ── Virality scorer ──────────────────────────────────────────────────────────
// Nine weighted components, each 0-100, computed from real heuristics (hook
// word strength, scene pacing vs the 2-4s sweet spot, SEO keyword coverage,
// duration sweet spot 25-45s, topic trendiness, psychology triggers). Fully
// deterministic. When an AI key is present we only ask it to sharpen the
// SUGGESTIONS — the numbers always come from the heuristics so they stay
// bounded and reproducible.

import type { ViralScore } from "@fable/shared";
import { clamp, fnv1a, seededRandom } from "@fable/shared";
import { createLogger } from "../../lib/logger";
import { aiCompleteJson, isMockAi } from "../ai";
import { scoreTitleCtr } from "./seo";

const log = createLogger("gen:viral");

export interface ViralInput {
  title: string;
  description?: string;
  channelType?: string;
  durationSec?: number;
  sceneCount?: number;
  avgSceneSec?: number;
  hasThumbnail?: boolean;
}

// ── Heuristic tables ─────────────────────────────────────────────────────────

const HOOK_OPENERS = [
  "wait", "stop", "pov", "nobody", "watch", "the", "this", "you", "only", "99%",
];

const PSYCHOLOGY_TRIGGERS: { name: string; words: string[] }[] = [
  { name: "curiosity", words: ["secret", "hidden", "nobody knows", "you won't believe", "wait for", "the truth", "revealed"] },
  { name: "challenge", words: ["can you", "try not to", "impossible", "challenge", "survive", "only 1%", "bet you"] },
  { name: "social proof", words: ["everyone", "viral", "millions", "broke the internet", "trending", "99%"] },
  { name: "urgency", words: ["now", "before", "last chance", "today", "instantly", "right now"] },
  { name: "fomo", words: ["missed", "don't miss", "you need", "everyone is", "left out"] },
  { name: "stakes", words: ["forever", "never again", "or else", "last time", "permanent", "wrong"] },
];

const TOPIC_TRENDINESS: { words: string[]; score: number }[] = [
  { words: ["would you rather", "quiz", "trivia", "brain"], score: 82 },
  { words: ["gaming", "streamer", "stream", "clutch", "rage", "speedrun"], score: 88 },
  { words: ["funny", "fail", "laugh", "meme", "comedy"], score: 85 },
  { words: ["money", "rich", "million", "salary"], score: 78 },
  { words: ["food", "eat", "cooking", "recipe"], score: 74 },
  { words: ["top 5", "top5", "ranked", "countdown", "best"], score: 80 },
  { words: ["ai", "robot", "future", "tech"], score: 76 },
  { words: ["animal", "dog", "cat", "pet"], score: 72 },
  { words: ["sport", "football", "goal", "basketball"], score: 70 },
  { words: ["school", "teacher", "exam", "student"], score: 68 },
];

const CHANNEL_FORMAT_TRENDING: Record<string, number> = {
  wyr: 78, // interactive polls perform consistently well
  clips: 86, // stream clips are the dominant Shorts format
  top5: 74, // countdowns are evergreen but saturated
};

// ── Component scorers ────────────────────────────────────────────────────────

function scoreHook(title: string): number {
  const { score } = scoreTitleCtr(title);
  const lower = title.toLowerCase();
  let bonus = 0;
  if (HOOK_OPENERS.some((w) => lower.startsWith(w))) bonus += 8;
  if (lower.includes("wrong") || lower.includes("wait")) bonus += 6;
  return clamp(score + bonus, 0, 100);
}

function scorePacing(durationSec: number, sceneCount?: number, avgSceneSec?: number): number {
  const avg =
    avgSceneSec ??
    (sceneCount && sceneCount > 0 ? durationSec / sceneCount : undefined);
  if (avg === undefined) return 62; // unknown pacing — assume competent default edit
  // Ideal scene length for Shorts is 2-4 seconds.
  if (avg >= 2 && avg <= 4) return 95;
  if (avg < 2) return clamp(95 - (2 - avg) * 30, 20, 95); // hyper-cut, disorienting
  return clamp(95 - (avg - 4) * 12, 10, 95); // slow scenes bleed retention
}

function scoreEditing(sceneCount?: number, durationSec?: number): number {
  if (!sceneCount || !durationSec) return 60;
  const density = sceneCount / Math.max(1, durationSec / 10); // scenes per 10s
  return clamp(Math.round(30 + density * 18), 20, 96);
}

function scoreSeo(title: string, description: string): number {
  let score = 20;
  const titleWords = new Set(
    title.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3),
  );
  if (description.length > 120) score += 20;
  if (description.length > 300) score += 10;
  const descLower = description.toLowerCase();
  let coverage = 0;
  for (const word of titleWords) if (descLower.includes(word)) coverage++;
  score += Math.min(25, coverage * 6); // title keywords echoed in description
  if (descLower.includes("#shorts") || descLower.includes("subscribe")) score += 10;
  if (description.includes("\n\n")) score += 8; // structured paragraphs
  return clamp(score, 0, 100);
}

function scoreDuration(durationSec: number): number {
  // Sweet spot for Shorts retention: 25-45s.
  if (durationSec >= 25 && durationSec <= 45) return 94;
  if (durationSec < 25) return clamp(94 - (25 - durationSec) * 3, 30, 94);
  return clamp(94 - (durationSec - 45) * 2.5, 15, 94);
}

function scoreTopic(text: string): number {
  const lower = text.toLowerCase();
  let best = 55;
  for (const entry of TOPIC_TRENDINESS) {
    if (entry.words.some((w) => lower.includes(w))) best = Math.max(best, entry.score);
  }
  return best;
}

function scorePsychology(text: string): { score: number; hits: string[] } {
  const lower = text.toLowerCase();
  const hits: string[] = [];
  for (const trigger of PSYCHOLOGY_TRIGGERS) {
    if (trigger.words.some((w) => lower.includes(w))) hits.push(trigger.name);
  }
  return { score: clamp(28 + hits.length * 16, 0, 100), hits };
}

// ── Weights (sum = 1.0) ──────────────────────────────────────────────────────

const WEIGHTS: Record<keyof ViralScore["breakdown"], number> = {
  hook: 0.18,
  editing: 0.1,
  pacing: 0.12,
  seo: 0.1,
  thumbnail: 0.08,
  retention: 0.14,
  topic: 0.1,
  trending: 0.08,
  psychology: 0.1,
};

const SUGGESTION_FIXES: Record<keyof ViralScore["breakdown"], (input: ViralInput) => string> = {
  hook: (i) =>
    `Sharpen the first line — open with a number or a challenge ("99% get this wrong") instead of "${i.title.slice(0, 30)}…".`,
  editing: () =>
    "Add more cuts and effects — aim for a visual change (zoom, pop, emoji burst) at least every 3 seconds.",
  pacing: (i) =>
    i.avgSceneSec !== undefined && i.avgSceneSec < 2
      ? "Scenes are hyper-cut — let key beats breathe for 2-4s so viewers can register them."
      : "Tighten scene lengths into the 2-4s sweet spot — long static scenes are where viewers swipe away.",
  seo: () =>
    "Echo your title keywords in the first two description lines and add #shorts plus 3-4 niche hashtags.",
  thumbnail: () =>
    "Generate a thumbnail variant — a bold 3-5 word headline with a face or arrow lifts browse CTR noticeably.",
  retention: (i) =>
    (i.durationSec ?? 30) > 45
      ? `Trim from ${Math.round(i.durationSec ?? 0)}s toward 25-45s — completion rate is the #1 Shorts ranking signal.`
      : "Tease the payoff in the first 2 seconds and hold it until the end to pull viewers through.",
  topic: () =>
    "Angle the concept toward a hotter topic — gaming chaos, impossible choices and money hypotheticals are surging.",
  trending: () =>
    "Ride a current format: add a trending sound reference or a 'part 2' hook to tap the recommendation wave.",
  psychology: () =>
    "Layer a psychology trigger — a dare ('you won't last 10 seconds'), FOMO, or social proof ('this broke the comments').",
};

// ── Public API ───────────────────────────────────────────────────────────────

/** Pure, deterministic scorer — exported for unit tests. */
export function computeViralScore(input: ViralInput): ViralScore {
  const title = input.title.trim();
  const description = input.description?.trim() ?? "";
  const durationSec = input.durationSec ?? 30;
  const fullText = `${title} ${description}`;

  const psychology = scorePsychology(fullText);
  // Small seeded wobble (±3) so distinct titles with identical heuristics
  // don't all display the same number — still fully deterministic.
  const wobble = (component: string): number => {
    const rand = seededRandom(fnv1a(`${component}:${title}`) || 1);
    return Math.floor(rand() * 7) - 3;
  };

  const breakdown: ViralScore["breakdown"] = {
    hook: clamp(scoreHook(title) + wobble("hook"), 0, 100),
    editing: clamp(scoreEditing(input.sceneCount, durationSec) + wobble("editing"), 0, 100),
    pacing: clamp(
      scorePacing(durationSec, input.sceneCount, input.avgSceneSec) + wobble("pacing"),
      0,
      100,
    ),
    seo: clamp(scoreSeo(title, description) + wobble("seo"), 0, 100),
    thumbnail: clamp((input.hasThumbnail === false ? 34 : 72) + wobble("thumbnail"), 0, 100),
    retention: clamp(
      Math.round(scoreDuration(durationSec) * 0.65 + scoreHook(title) * 0.35) + wobble("retention"),
      0,
      100,
    ),
    topic: clamp(scoreTopic(fullText) + wobble("topic"), 0, 100),
    trending: clamp(
      (CHANNEL_FORMAT_TRENDING[input.channelType ?? ""] ?? 70) + wobble("trending"),
      0,
      100,
    ),
    psychology: clamp(psychology.score + wobble("psychology"), 0, 100),
  };
  for (const key of Object.keys(breakdown) as (keyof ViralScore["breakdown"])[]) {
    breakdown[key] = Math.round(breakdown[key]);
  }

  const total = clamp(
    Math.round(
      (Object.keys(WEIGHTS) as (keyof ViralScore["breakdown"])[]).reduce(
        (sum, key) => sum + breakdown[key] * WEIGHTS[key],
        0,
      ),
    ),
    0,
    100,
  );

  // 3-5 concrete suggestions targeting the weakest components.
  const weakest = (Object.keys(breakdown) as (keyof ViralScore["breakdown"])[])
    .map((key) => ({ key, value: breakdown[key] }))
    .sort((a, b) => a.value - b.value);
  const suggestionCount = total >= 80 ? 3 : total >= 60 ? 4 : 5;
  const suggestions = weakest
    .slice(0, suggestionCount)
    .map(({ key }) => SUGGESTION_FIXES[key](input));

  return { total, breakdown, suggestions };
}

export async function scoreVirality(input: ViralInput): Promise<ViralScore> {
  const result = computeViralScore(input);
  if (isMockAi()) return result;

  // AI sharpens the suggestions only — scores stay heuristic and bounded.
  try {
    const ai = await aiCompleteJson<{ suggestions?: unknown }>({
      system: "You are a YouTube Shorts growth strategist. Give specific, actionable advice.",
      prompt: `A Short titled "${input.title}" scored ${result.total}/100. Weakest areas: ${result.suggestions
        .map((s) => s.split(" — ")[0])
        .join("; ")}. Write ${result.suggestions.length} concrete improvement suggestions (one sentence each). JSON: {"suggestions":["..."]}`,
      maxTokens: 400,
    });
    const list = Array.isArray(ai.suggestions)
      ? ai.suggestions.filter((s): s is string => typeof s === "string" && s.trim().length > 10)
      : [];
    if (list.length >= 3) {
      return { ...result, suggestions: list.slice(0, 5) };
    }
    return result;
  } catch (err) {
    log.warn(
      `AI suggestions failed — keeping heuristic ones: ${err instanceof Error ? err.message : String(err)}`,
    );
    return result;
  }
}
