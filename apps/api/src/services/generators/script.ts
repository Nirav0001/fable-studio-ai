// ── ScriptPlan builders ──────────────────────────────────────────────────────
// Pure, deterministic scene-plan construction for all three formats:
//   buildWyrScript     — hook → (question + reveal) × N → CTA, fits lengthSec
//   buildTop5Script    — countdown N→1 with number stingers between clips
//   buildClipEditPlan  — zooms / captions / overlays / sfx for a single clip
// No DB, no AI, no Math.random — everything flows from seeded randomness so a
// given input always produces the same plan.

import type {
  Branding,
  ClipsConfig,
  EditPlan,
  SceneT,
  ScoreBreakdown,
  ScriptPlan,
  Top5Config,
  WyrConfig,
  WyrQuestionT,
} from "@fable/shared";
import { clamp, fnv1a, seededRandom, pick } from "@fable/shared";

/** Structural shape of a scored clip moment (produced by clipDetect). */
export interface MomentLike {
  title: string;
  hook: string;
  startSec: number;
  endSec: number;
  score: number;
  breakdown?: ScoreBreakdown;
  transcript?: string;
}

const HOOK_DURATION = 1.5;
const REVEAL_DURATION = 1.2;
const CTA_DURATION = 2.0;
const MIN_TIMER = 3.5;

const QUESTION_EFFECTS: readonly string[][] = [
  ["zoom-pop", "particles"],
  ["zoom-pop", "whoosh"],
  ["particles", "whoosh"],
  ["zoom-pop", "emoji-rain"],
];

const REVEAL_EFFECTS: readonly string[][] = [
  ["emoji-rain", "whoosh"],
  ["particles", "zoom-pop"],
  ["emoji-rain", "zoom-pop"],
  ["whoosh", "particles"],
];

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// ── Would-You-Rather ─────────────────────────────────────────────────────────

/**
 * Build the full WYR scene plan. Timer per question is derived from the target
 * length: hook + N × (timer + reveal) + CTA ≈ lengthSec, timer never below 3.5s
 * (a countdown shorter than that is unreadable on a phone).
 */
export function buildWyrScript(
  questions: WyrQuestionT[],
  config: WyrConfig,
  branding?: Partial<Branding>,
): ScriptPlan {
  const count = Math.max(1, questions.length);
  const budget = config.lengthSec - HOOK_DURATION - CTA_DURATION - count * REVEAL_DURATION;
  const timerSec = round1(Math.max(MIN_TIMER, budget / count));

  const seed = fnv1a(
    `wyr:${config.theme}:${config.difficulty}:${questions.map((q) => q.optionA).join("|")}`,
  );
  const rand = seededRandom(seed || 1);

  const first = questions[0] ?? { percentA: 50 };
  const majority = Math.max(first.percentA, 100 - first.percentA);
  const wrongPct = clamp(majority + Math.floor(rand() * 9), 61, 97);

  const scenes: SceneT[] = [];
  const voiceoverLines: ScriptPlan["voiceoverLines"] = [];
  let t = 0;
  let index = 0;

  const hookText = `${wrongPct}% get this WRONG`;
  scenes.push({
    index: index++,
    kind: "hook",
    startSec: t,
    durationSec: HOOK_DURATION,
    text: hookText,
    effects: ["zoom-pop", "particles"],
    sfx: "impact-boom",
  });
  voiceoverLines.push({ atSec: t, text: `${wrongPct} percent get this wrong!` });
  t = round1(t + HOOK_DURATION);

  questions.forEach((q, qi) => {
    scenes.push({
      index: index++,
      kind: "question",
      startSec: t,
      durationSec: timerSec,
      text: `Would you rather ${q.optionA} or ${q.optionB}?`,
      question: q,
      effects: [...QUESTION_EFFECTS[qi % QUESTION_EFFECTS.length]],
      sfx: "timer-tick",
    });
    // Full narration every time — the render pipeline retimes scenes to the
    // measured audio, so lines can never talk over each other.
    voiceoverLines.push({
      atSec: t,
      text: `Would you rather ${q.optionA}... or ${q.optionB}?`,
    });
    t = round1(t + timerSec);

    const revealText = q.factoid
      ? `${q.percentA}% picked A — ${q.factoid}`
      : `${q.percentA}% picked A!`;
    scenes.push({
      index: index++,
      kind: "reveal",
      startSec: t,
      durationSec: REVEAL_DURATION,
      text: revealText,
      question: q,
      effects: [...REVEAL_EFFECTS[qi % REVEAL_EFFECTS.length]],
      sfx: "reveal-pop",
    });
    t = round1(t + REVEAL_DURATION);
  });

  // Engagement beat: the final "question" is always LIKE vs SUBSCRIBE — the
  // classic interaction bait that reliably lifts both metrics.
  const subQ: WyrQuestionT = {
    theme: config.theme,
    difficulty: "easy",
    optionA: "SMASH LIKE",
    optionB: "SUBSCRIBE",
    percentA: 50,
    factoid: "Legends do both",
  };
  const SUB_TIMER = 2.8;
  scenes.push({
    index: index++,
    kind: "question",
    startSec: t,
    durationSec: SUB_TIMER,
    text: "Would you rather smash like or subscribe?",
    question: subQ,
    effects: ["zoom-pop", "emoji-rain"],
    sfx: "reveal-pop",
  });
  voiceoverLines.push({
    atSec: t,
    text: "Last one. Would you rather smash that like button... or subscribe?",
  });
  t = round1(t + SUB_TIMER);
  scenes.push({
    index: index++,
    kind: "reveal",
    startSec: t,
    durationSec: REVEAL_DURATION,
    text: "100% picked both",
    question: subQ,
    effects: ["confetti"],
    sfx: "reveal-pop",
  });
  t = round1(t + REVEAL_DURATION);

  const ctaText = branding?.cta?.trim() || "Comment your score! Subscribe for round 2";
  scenes.push({
    index: index++,
    kind: "cta",
    startSec: t,
    durationSec: CTA_DURATION,
    text: ctaText,
    effects: ["emoji-rain", "whoosh"],
    sfx: "outro-riser",
  });
  voiceoverLines.push({ atSec: t, text: ctaText });
  t = round1(t + CTA_DURATION);

  return {
    scenes,
    totalDurationSec: t,
    voiceoverLines,
    musicStyle: branding?.musicStyle?.trim() || "energetic edm",
    pacingNotes: `${count} questions at ${timerSec}s timers — target ${config.lengthSec}s, actual ${t}s. Reveal beats land on the music grid every ${round1(timerSec + REVEAL_DURATION)}s.`,
  };
}

// ── Top-5 countdown ──────────────────────────────────────────────────────────

const TOP5_HOOKS = [
  "The FUNNIEST stream moments this week 😂",
  "Number 1 broke the entire chat 💀",
  "You will NOT survive number 2",
  "Ranked: the moments chat can't stop clipping",
] as const;

const CLIP_SCREEN_TIME_MAX = 8;

/**
 * Countdown script: hook → (#N stinger → clip) repeated → CTA. Input moments
 * are re-ordered ascending by score so the funniest plays LAST as #1. Each clip
 * gets a trimmed screen window (max 8s) so five clips still fit a Short.
 */
export function buildTop5Script(
  moments: MomentLike[],
  config: Top5Config,
): ScriptPlan {
  const ordered = [...moments].sort((a, b) => a.score - b.score);
  const total = ordered.length;
  const from = Math.max(total, Math.min(config.countdownFrom || total, 10));

  const seed = fnv1a(`top5:${config.sourceUrl}:${ordered.map((m) => m.startSec).join(",")}`);
  const rand = seededRandom(seed || 1);

  const scenes: SceneT[] = [];
  const voiceoverLines: ScriptPlan["voiceoverLines"] = [];
  let t = 0;
  let index = 0;

  const hookText = pick(rand, TOP5_HOOKS);
  scenes.push({
    index: index++,
    kind: "hook",
    startSec: t,
    durationSec: 1.6,
    text: hookText,
    effects: ["zoom-pop", "particles"],
    sfx: "impact-boom",
  });
  voiceoverLines.push({ atSec: t, text: hookText });
  t = round1(t + 1.6);

  ordered.forEach((moment, i) => {
    const number = from - i;
    scenes.push({
      index: index++,
      kind: "number",
      startSec: t,
      durationSec: 0.9,
      text: `#${number}`,
      effects: ["whoosh", "zoom-pop"],
      sfx: "number-stinger",
    });
    voiceoverLines.push({ atSec: t, text: `Number ${number}!` });
    t = round1(t + 0.9);

    const clipLen = clamp(moment.endSec - moment.startSec, 3, CLIP_SCREEN_TIME_MAX);
    scenes.push({
      index: index++,
      kind: "clip",
      startSec: t,
      durationSec: round1(clipLen),
      text: moment.hook || moment.title,
      clipRef: {
        startSec: moment.startSec,
        endSec: round1(moment.startSec + clipLen),
        label: moment.title,
      },
      effects: number === 1 ? ["zoom-pop", "emoji-rain"] : ["zoom-pop"],
      sfx: number === 1 ? "airhorn" : undefined,
    });
    t = round1(t + clipLen);
  });

  const ctaText = "Which one got you? 👇 Subscribe for round 2";
  scenes.push({
    index: index++,
    kind: "cta",
    startSec: t,
    durationSec: 2.2,
    text: ctaText,
    effects: ["emoji-rain", "whoosh"],
    sfx: "outro-riser",
  });
  voiceoverLines.push({ atSec: t, text: ctaText });
  t = round1(t + 2.2);

  return {
    scenes,
    totalDurationSec: t,
    voiceoverLines,
    musicStyle: "upbeat comedic",
    pacingNotes: `${total} clips counting down from #${from}. Funniest moment plays last as #1 — retention bait by construction.`,
  };
}

// ── Single-clip edit plan ────────────────────────────────────────────────────

const GIF_OVERLAYS = [
  "laughing-crying",
  "skull-emoji-rain",
  "omg-monkey",
  "spongebob-panic",
  "vibing-cat",
  "shocked-pikachu",
] as const;

const PUNCHLINE_SFX = [
  "vine-boom",
  "bruh",
  "record-scratch",
  "airhorn",
  "windows-error",
  "metal-pipe",
] as const;

/**
 * Deterministic edit plan for one detected moment: 2-4 punch zooms at energy
 * peaks, karaoke captions, GIF overlays when memes are enabled, and boom sfx
 * on the punchlines.
 */
export function buildClipEditPlan(
  moment: MomentLike,
  config?: Partial<ClipsConfig>,
): EditPlan {
  const duration = Math.max(5, moment.endSec - moment.startSec);
  const seed = fnv1a(`edit:${moment.title}:${moment.startSec}:${moment.endSec}`);
  const rand = seededRandom(seed || 1);

  const energy = moment.breakdown?.energy ?? 50;
  const emotion = moment.breakdown?.emotion ?? 30;

  // 2 base zooms, +1 for high energy, +1 for longer clips — capped at 4.
  let zoomCount = 2;
  if (energy >= 60) zoomCount++;
  if (duration >= 25) zoomCount++;
  zoomCount = Math.min(4, zoomCount);

  const peakFractions = [0.15, 0.45, 0.7, 0.9];
  const zooms = peakFractions.slice(0, zoomCount).map((f) => ({
    atSec: round1(duration * f),
    scale: round1(1.15 + rand() * 0.2),
    durationSec: round1(0.8 + rand() * 0.6),
  }));

  const addMemes = config?.addMemes !== false;
  const overlayCount = addMemes ? (duration >= 20 ? 2 : 1) : 0;
  const overlays: EditPlan["overlays"] = [];
  for (let i = 0; i < overlayCount; i++) {
    overlays.push({
      atSec: round1(duration * (0.3 + i * 0.45)),
      kind: "gif",
      label: pick(rand, GIF_OVERLAYS),
    });
  }

  const sfxCount = 1 + (energy >= 55 ? 1 : 0) + (duration >= 30 ? 1 : 0);
  const sfx: EditPlan["sfx"] = [];
  for (let i = 0; i < Math.min(3, sfxCount); i++) {
    sfx.push({
      atSec: round1(duration * (0.25 + i * 0.3)),
      name: pick(rand, PUNCHLINE_SFX),
    });
  }

  return {
    reframe: { mode: emotion >= 60 ? "face-track" : "speaker-track" },
    zooms,
    captions: { style: config?.captionStyle || "karaoke", animated: true },
    overlays,
    sfx,
    hookText: moment.hook || moment.title,
    ctaText: "Follow for daily stream gold",
  };
}
