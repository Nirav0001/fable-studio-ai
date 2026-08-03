// ── Generator unit tests ─────────────────────────────────────────────────────
// Exercises the PURE deterministic branches only — no prisma queries, no AI
// calls, no network. Run with: npm test (vitest).

import { describe, expect, it } from "vitest";
import { COST_RATES, WYR_THEMES, wyrHash } from "@fable/shared";
import type { WyrConfig } from "@fable/shared";
import { detectMoments, pickTop5Funniest } from "../src/services/generators/clipDetect";
import { estimateCost } from "../src/services/generators/cost";
import {
  buildHooks,
  buildSeoPack,
  buildTitleIdeas,
  scoreTitleCtr,
} from "../src/services/generators/seo";
import {
  buildClipEditPlan,
  buildTop5Script,
  buildWyrScript,
} from "../src/services/generators/script";
import {
  buildThumbnailVariants,
  shortenHeadline,
} from "../src/services/generators/thumbs";
import { mockTranscript } from "../src/services/generators/transcript";
import { computeViralScore } from "../src/services/generators/viral";
import { bankSize, expandBank } from "../src/services/generators/wyr";

// ── WYR bank ─────────────────────────────────────────────────────────────────

describe("wyr bank", () => {
  it("expands combinatorially to 1000+ possibilities", () => {
    expect(bankSize()).toBeGreaterThanOrEqual(1000);
  });

  it("produces 500+ unique hashes across all themes", () => {
    const hashes = new Set<string>();
    for (const theme of WYR_THEMES) {
      for (const q of expandBank(theme, "medium", 42, 1)) {
        hashes.add(wyrHash(q.optionA, q.optionB));
      }
    }
    expect(hashes.size).toBeGreaterThanOrEqual(500);
  });

  it("is deterministic for the same seed and varies with the seed", () => {
    const a = expandBank("food", "hard", 7, 1);
    const b = expandBank("food", "hard", 7, 1);
    const c = expandBank("food", "hard", 8, 1);
    expect(a.map((q) => q.optionA)).toEqual(b.map((q) => q.optionA));
    expect(a.map((q) => q.optionA)).not.toEqual(c.map((q) => q.optionA));
  });

  it("keeps percentA within 2-98 and options non-empty", () => {
    for (const q of expandBank("money", "impossible", 3, 2).slice(0, 300)) {
      expect(q.percentA).toBeGreaterThanOrEqual(2);
      expect(q.percentA).toBeLessThanOrEqual(98);
      expect(q.optionA.length).toBeGreaterThan(0);
      expect(q.optionB.length).toBeGreaterThan(0);
      expect(q.optionA).not.toEqual(q.optionB);
    }
  });
});

// ── Viral score ──────────────────────────────────────────────────────────────

describe("viral score", () => {
  const inputs = [
    { title: "99% Get This WRONG — Impossible Quiz 🤯", description: "Impossible quiz with the hardest choices.\n\nSubscribe! #shorts", channelType: "wyr", durationSec: 32 },
    { title: "a", description: "", channelType: "clips", durationSec: 120 },
    { title: "Top 5 Funniest Rage Quits Ranked", channelType: "top5", durationSec: 44, sceneCount: 14, avgSceneSec: 3.1, hasThumbnail: true },
  ];

  it("keeps total and every component in 0-100", () => {
    for (const input of inputs) {
      const score = computeViralScore(input);
      expect(score.total).toBeGreaterThanOrEqual(0);
      expect(score.total).toBeLessThanOrEqual(100);
      for (const value of Object.values(score.breakdown)) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(100);
      }
    }
  });

  it("always returns 3-5 non-empty suggestions", () => {
    for (const input of inputs) {
      const { suggestions } = computeViralScore(input);
      expect(suggestions.length).toBeGreaterThanOrEqual(3);
      expect(suggestions.length).toBeLessThanOrEqual(5);
      for (const s of suggestions) expect(s.length).toBeGreaterThan(10);
    }
  });

  it("is deterministic and rewards the sweet-spot duration", () => {
    expect(computeViralScore(inputs[0])).toEqual(computeViralScore(inputs[0]));
    const sweet = computeViralScore({ title: "Same Title Here", durationSec: 30 });
    const bloated = computeViralScore({ title: "Same Title Here", durationSec: 120 });
    expect(sweet.breakdown.retention).toBeGreaterThan(bloated.breakdown.retention);
  });
});

// ── SEO pack ─────────────────────────────────────────────────────────────────

describe("seo pack", () => {
  const pack = buildSeoPack({
    title: "Impossible Food Choices That End Friendships",
    context: "would you rather quiz about pizza and chocolate",
    channelType: "wyr",
  });

  it("has 12-16 tags and exactly 5 hashtags including #shorts", () => {
    expect(pack.tags.length).toBeGreaterThanOrEqual(12);
    expect(pack.tags.length).toBeLessThanOrEqual(16);
    expect(pack.hashtags.length).toBe(5);
    expect(pack.hashtags.map((h) => h.toLowerCase())).toContain("#shorts");
  });

  it("writes a two-paragraph description with a hook first line", () => {
    const paragraphs = pack.description.split("\n\n");
    expect(paragraphs.length).toBe(2);
    expect(paragraphs[0].length).toBeGreaterThan(40);
    expect(pack.pinnedComment.length).toBeGreaterThan(10);
    expect(pack.communityPost.length).toBeGreaterThan(10);
    expect(pack.keywords.length).toBeGreaterThanOrEqual(5);
  });

  it("is deterministic per input", () => {
    const again = buildSeoPack({
      title: "Impossible Food Choices That End Friendships",
      context: "would you rather quiz about pizza and chocolate",
      channelType: "wyr",
    });
    expect(again).toEqual(pack);
  });
});

// ── Title ideas & hooks ──────────────────────────────────────────────────────

describe("title ideas", () => {
  it("returns ideas sorted by score descending with reasons", () => {
    const ideas = buildTitleIdeas("gaming fails", 10, "clips");
    expect(ideas.length).toBe(10);
    for (let i = 1; i < ideas.length; i++) {
      expect(ideas[i - 1].score).toBeGreaterThanOrEqual(ideas[i].score);
    }
    for (const idea of ideas) {
      expect(idea.score).toBeGreaterThanOrEqual(1);
      expect(idea.score).toBeLessThanOrEqual(99);
      expect(idea.reasons.length).toBeGreaterThan(0);
    }
  });

  it("scores CTR heuristics sensibly", () => {
    const strong = scoreTitleCtr("99% Get This WRONG — Impossible Quiz 🤯");
    const weak = scoreTitleCtr("my video");
    expect(strong.score).toBeGreaterThan(weak.score);
    expect(strong.reasons.length).toBeGreaterThan(1);
  });

  it("generates topical hooks", () => {
    const hooks = buildHooks("speedrunning", 8);
    expect(hooks.length).toBe(8);
    for (const hook of hooks) expect(hook.toLowerCase()).toContain("speedrunning");
    expect(new Set(hooks).size).toBe(8);
  });
});

// ── Thumbnails ───────────────────────────────────────────────────────────────

describe("thumbnails", () => {
  it("builds 4 variants with rotated styles and 6-14% CTR", () => {
    const variants = buildThumbnailVariants({
      title: "The Clutch Nobody Saw Coming",
      channelType: "clips",
      count: 4,
    });
    expect(variants.length).toBe(4);
    expect(new Set(variants.map((v) => v.style)).size).toBe(4);
    for (const v of variants) {
      expect(v.predictedCtr).toBeGreaterThanOrEqual(6);
      expect(v.predictedCtr).toBeLessThanOrEqual(14);
      expect(v.headline.split(" ").length).toBeLessThanOrEqual(5);
      expect(v.headline).toBe(v.headline.toUpperCase());
      expect(v.bgFrom).toMatch(/^#[0-9a-f]{6}$/i);
      expect(v.bgTo).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("shortens headlines to punchy caps", () => {
    expect(shortenHeadline("Would You Rather Eat Pizza Forever Or Never Again").split(" ").length).toBeLessThanOrEqual(5);
    expect(shortenHeadline("")).toBe("WATCH THIS");
  });
});

// ── Transcript mock ──────────────────────────────────────────────────────────

describe("mock transcript", () => {
  it("produces 45+ ordered segments spread over ~20 minutes", () => {
    const segments = mockTranscript("https://www.youtube.com/watch?v=demo123");
    expect(segments.length).toBeGreaterThanOrEqual(45);
    for (let i = 0; i < segments.length; i++) {
      expect(segments[i].endSec).toBeGreaterThan(segments[i].startSec);
      if (i > 0) expect(segments[i].startSec).toBeGreaterThanOrEqual(segments[i - 1].endSec);
    }
    const last = segments[segments.length - 1];
    expect(last.endSec).toBeGreaterThan(600); // at least 10 minutes of tape
    expect(segments.some((s) => (s.markers ?? []).includes("laughter"))).toBe(true);
    expect(segments.some((s) => (s.markers ?? []).includes("shouting"))).toBe(true);
  });

  it("is deterministic per URL", () => {
    const a = mockTranscript("https://twitch.tv/vod/1");
    const b = mockTranscript("https://twitch.tv/vod/1");
    expect(a).toEqual(b);
  });
});

// ── Clip detection ───────────────────────────────────────────────────────────

describe("clip detection", () => {
  const segments = mockTranscript("https://www.youtube.com/watch?v=stream-vod");

  it("finds at least 5 scored moments in the mock transcript", async () => {
    const moments = await detectMoments(segments, { count: 10, minScore: 60 });
    expect(moments.length).toBeGreaterThanOrEqual(5);
    for (let i = 1; i < moments.length; i++) {
      expect(moments[i - 1].score).toBeGreaterThanOrEqual(moments[i].score);
    }
    for (const m of moments) {
      expect(m.score).toBeGreaterThanOrEqual(0);
      expect(m.score).toBeLessThanOrEqual(100);
      expect(m.endSec - m.startSec).toBeGreaterThanOrEqual(14);
      expect(m.endSec - m.startSec).toBeLessThanOrEqual(46);
      expect(m.title.length).toBeGreaterThan(0);
      expect(m.hook.length).toBeGreaterThan(0);
      expect(m.transcript.length).toBeGreaterThan(0);
      for (const value of Object.values(m.breakdown)) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(100);
      }
    }
  });

  it("picks exactly 5 funniest moments ranked by humor", async () => {
    const top5 = await pickTop5Funniest(segments);
    expect(top5.length).toBe(5);
    for (let i = 1; i < top5.length; i++) {
      expect(top5[i - 1].breakdown.humor).toBeGreaterThanOrEqual(top5[i].breakdown.humor);
    }
  });
});

// ── Script builders ──────────────────────────────────────────────────────────

describe("script builders", () => {
  const questions = expandBank("gaming", "medium", 11, 1).slice(0, 5);
  const config: WyrConfig = { difficulty: "medium", theme: "gaming", lengthSec: 45, questionCount: 5 };

  it("builds a wyr script: hook first, cta last, timers >= 3.5s", () => {
    const script = buildWyrScript(questions, config);
    expect(script.scenes[0].kind).toBe("hook");
    expect(script.scenes[script.scenes.length - 1].kind).toBe("cta");
    const questionScenes = script.scenes.filter((s) => s.kind === "question");
    const revealScenes = script.scenes.filter((s) => s.kind === "reveal");
    // +1: the engagement beat — every WYR script ends its questions with the
    // always-on LIKE vs SUBSCRIBE question.
    expect(questionScenes.length).toBe(6);
    expect(revealScenes.length).toBe(6);
    const last = questionScenes[questionScenes.length - 1];
    expect(last.question?.optionB).toBe("SUBSCRIBE");
    for (const s of questionScenes.slice(0, -1)) expect(s.durationSec).toBeGreaterThanOrEqual(3.5);
    expect(script.totalDurationSec).toBeGreaterThan(20);
    expect(script.totalDurationSec).toBeLessThanOrEqual(config.lengthSec + 12);
    expect(script.voiceoverLines.length).toBeGreaterThanOrEqual(7);
    // Scenes tile the timeline contiguously.
    for (let i = 1; i < script.scenes.length; i++) {
      expect(script.scenes[i].startSec).toBeCloseTo(
        script.scenes[i - 1].startSec + script.scenes[i - 1].durationSec,
        1,
      );
    }
  });

  it("builds a top5 countdown ending on #1 with the best clip", async () => {
    const moments = await pickTop5Funniest(mockTranscript("https://youtu.be/top5-src"));
    const script = buildTop5Script(moments, {
      sourceUrl: "https://youtu.be/top5-src",
      countdownFrom: 5,
      captionStyle: "beast",
    });
    const numbers = script.scenes
      .filter((s) => s.kind === "number")
      .map((s) => s.text);
    expect(numbers).toEqual(["#5", "#4", "#3", "#2", "#1"]);
    const clips = script.scenes.filter((s) => s.kind === "clip");
    expect(clips.length).toBe(5);
    // Countdown order: scores ascend so the best clip plays last.
    const clipScores = [...moments].sort((a, b) => a.score - b.score).map((m) => m.score);
    expect(clipScores[clipScores.length - 1]).toBe(Math.max(...clipScores));
    expect(script.totalDurationSec).toBeLessThanOrEqual(60);
  });

  it("builds clip edit plans with 2-4 zooms and karaoke captions", async () => {
    const [moment] = await detectMoments(mockTranscript("https://youtu.be/edit-src"), {
      count: 1,
      minScore: 50,
    });
    const plan = buildClipEditPlan(moment, {
      sourceUrl: "https://youtu.be/edit-src",
      clipCount: 5,
      minScore: 50,
      captionStyle: "karaoke",
      addMemes: true,
    });
    expect(plan.zooms.length).toBeGreaterThanOrEqual(2);
    expect(plan.zooms.length).toBeLessThanOrEqual(4);
    for (const z of plan.zooms) {
      expect(z.scale).toBeGreaterThan(1);
      expect(z.atSec).toBeLessThanOrEqual(moment.endSec - moment.startSec);
    }
    expect(plan.captions).toEqual({ style: "karaoke", animated: true });
    expect(plan.overlays.length).toBeGreaterThanOrEqual(1);
    expect(plan.sfx.length).toBeGreaterThanOrEqual(1);
    expect(plan.hookText.length).toBeGreaterThan(0);
  });
});

// ── Cost estimator ───────────────────────────────────────────────────────────

describe("cost estimate", () => {
  it("prices against COST_RATES exactly", () => {
    const cost = estimateCost({ llmTokens: 4000, ttsChars: 2500, renderMinutes: 1.5 });
    expect(cost.llmCostGbp).toBeCloseTo((4000 / 1000) * COST_RATES.llmPer1kTokensGbp, 6);
    expect(cost.ttsCostGbp).toBeCloseTo((2500 / 1000) * COST_RATES.ttsPer1kCharsGbp, 6);
    expect(cost.renderCostGbp).toBeCloseTo(1.5 * COST_RATES.renderPerMinuteGbp, 6);
    expect(cost.totalGbp).toBeCloseTo(cost.llmCostGbp + cost.ttsCostGbp + cost.renderCostGbp, 6);
  });

  it("never goes negative on garbage input", () => {
    const cost = estimateCost({ llmTokens: -50, ttsChars: NaN, renderMinutes: -2 });
    expect(cost.llmTokens).toBe(0);
    expect(cost.ttsChars).toBe(0);
    expect(cost.renderMinutes).toBe(0);
    expect(cost.totalGbp).toBe(0);
  });
});
