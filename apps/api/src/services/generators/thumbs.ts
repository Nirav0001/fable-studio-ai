// ── Thumbnail variant generator ──────────────────────────────────────────────
// Four variants per request: punchy shortened headline (<=5 words, CAPS), an
// emoji, a vivid gradient pair, rotated styles and a seeded predicted CTR in
// the 6-14% band. Deterministic per (title, channelType); AI only rewrites the
// headline/subtext copy when a key is present.

import type { ThumbnailVariant } from "@fable/shared";
import { clamp, fnv1a, pick, seededRandom } from "@fable/shared";
import { createLogger } from "../../lib/logger";
import { aiCompleteJson, isMockAi } from "../ai";

const log = createLogger("gen:thumbs");

const GRADIENTS: { from: string; to: string; accent: string }[] = [
  { from: "#7c3aed", to: "#db2777", accent: "#fbbf24" }, // violet → pink, amber pop
  { from: "#4c1d95", to: "#8b5cf6", accent: "#34d399" }, // deep violet, mint pop
  { from: "#0ea5e9", to: "#6366f1", accent: "#f97316" }, // sky → indigo, orange pop
  { from: "#dc2626", to: "#f59e0b", accent: "#ffffff" }, // red → amber, white pop
  { from: "#059669", to: "#0d9488", accent: "#fde047" }, // emerald → teal, yellow pop
  { from: "#9333ea", to: "#e11d48", accent: "#22d3ee" }, // purple → rose, cyan pop
  { from: "#1e1b4b", to: "#7c3aed", accent: "#f472b6" }, // midnight → violet, pink pop
  { from: "#ea580c", to: "#dc2626", accent: "#a3e635" }, // orange → red, lime pop
];

const STYLES: ThumbnailVariant["style"][] = ["bold", "glow", "arrow", "face", "split"];

const EMOJIS: Record<string, string[]> = {
  wyr: ["🤯", "😱", "🧠", "⚖️", "❓", "😳"],
  clips: ["💀", "😂", "🔥", "🎮", "😱", "👀"],
  top5: ["🏆", "😂", "💀", "🥇", "🤣", "🔥"],
};
const DEFAULT_EMOJIS = ["🔥", "🤯", "😱", "💀", "👀", "⚡"];

const SUBTEXTS = [
  "Wait for it…",
  "Sound ON",
  "Part 2 inside",
  "You won't last",
  "Watch to the end",
  "No way this is real",
  "Don't blink",
  "Chat went wild",
];

const FILLER_WORDS = new Set([
  "the", "a", "an", "of", "to", "and", "or", "in", "on", "for", "with", "that",
  "this", "your", "you", "is", "are", "it", "at", "by", "be", "would", "rather",
]);

/** Compress a title into a <=5-word ALL-CAPS punch headline. */
export function shortenHeadline(title: string): string {
  const words = title
    .replace(/[\p{Extended_Pictographic}]/gu, "")
    .split(/[^a-zA-Z0-9%£?!']+/)
    .filter((w) => w.length > 0);
  const strong = words.filter((w) => !FILLER_WORDS.has(w.toLowerCase()));
  const chosen = (strong.length >= 2 ? strong : words).slice(0, 5);
  const headline = chosen.join(" ").toUpperCase();
  return headline || "WATCH THIS";
}

/** Pure, deterministic variants — exported for unit tests. */
export function buildThumbnailVariants(opts: {
  title: string;
  channelType?: string;
  count?: number;
}): ThumbnailVariant[] {
  const count = clamp(Math.floor(opts.count ?? 4) || 4, 1, 8);
  const seed = fnv1a(`thumbs:${opts.title}:${opts.channelType ?? ""}`) || 1;
  const rand = seededRandom(seed);
  const emojis = EMOJIS[opts.channelType ?? ""] ?? DEFAULT_EMOJIS;
  const headline = shortenHeadline(opts.title);

  const gradientStart = Math.floor(rand() * GRADIENTS.length);
  const styleStart = Math.floor(rand() * STYLES.length);

  const variants: ThumbnailVariant[] = [];
  for (let i = 0; i < count; i++) {
    const gradient = GRADIENTS[(gradientStart + i * 3) % GRADIENTS.length];
    variants.push({
      id: `thumb-${seed.toString(36)}-${i + 1}`,
      headline,
      subtext: pick(rand, SUBTEXTS),
      emoji: emojis[(Math.floor(rand() * emojis.length) + i) % emojis.length],
      bgFrom: gradient.from,
      bgTo: gradient.to,
      accentColor: gradient.accent,
      style: STYLES[(styleStart + i) % STYLES.length],
      predictedCtr: Math.round((6 + rand() * 8) * 10) / 10,
    });
  }
  // Present strongest predicted variant first.
  variants.sort((a, b) => b.predictedCtr - a.predictedCtr);
  return variants;
}

interface AiThumbCopy {
  variants?: { headline?: unknown; subtext?: unknown; emoji?: unknown }[];
}

export async function generateThumbnailVariants(opts: {
  title: string;
  channelType?: string;
  count?: number;
}): Promise<ThumbnailVariant[]> {
  const fallback = buildThumbnailVariants(opts);
  if (isMockAi()) return fallback;

  try {
    const ai = await aiCompleteJson<AiThumbCopy>({
      system: "You write thumbnail copy for viral YouTube Shorts. Max 5 words, ALL CAPS, punchy.",
      prompt: `Write ${fallback.length} thumbnail text variants for a Short titled "${opts.title}". JSON: {"variants":[{"headline":"MAX 5 WORDS CAPS","subtext":"3-4 word teaser","emoji":"one emoji"}]}`,
      maxTokens: 400,
    });
    const list = Array.isArray(ai.variants) ? ai.variants : [];
    if (list.length === 0) return fallback;

    return fallback.map((variant, i) => {
      const copy = list[i % list.length];
      const headline =
        typeof copy?.headline === "string" && copy.headline.trim()
          ? copy.headline.trim().toUpperCase().split(/\s+/).slice(0, 5).join(" ")
          : variant.headline;
      return {
        ...variant,
        headline,
        subtext:
          typeof copy?.subtext === "string" && copy.subtext.trim()
            ? copy.subtext.trim()
            : variant.subtext,
        emoji:
          typeof copy?.emoji === "string" && copy.emoji.trim()
            ? copy.emoji.trim().slice(0, 4)
            : variant.emoji,
      };
    });
  } catch (err) {
    log.warn(
      `AI thumbnail copy failed — using deterministic variants: ${err instanceof Error ? err.message : String(err)}`,
    );
    return fallback;
  }
}
