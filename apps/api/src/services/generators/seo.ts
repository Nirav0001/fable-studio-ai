// ── SEO pack, title ideas and hooks ──────────────────────────────────────────
// Deterministic-first: pools of keyword-rich copy keyed to channel type, seeded
// by fnv1a(input) so identical inputs always produce identical packs. When an
// AI provider is configured we ask it first and fall back on any failure.

import type { SeoPack, TitleIdea } from "@fable/shared";
import { clamp, fnv1a, pick, seededRandom } from "@fable/shared";
import { createLogger } from "../../lib/logger";
import { aiCompleteJson, isMockAi } from "../ai";

const log = createLogger("gen:seo");

// ── Shared word tables ───────────────────────────────────────────────────────

const POWER_WORDS = [
  "insane", "secret", "banned", "impossible", "shocking", "ultimate",
  "instantly", "genius", "wild", "unbelievable", "brutal", "legendary",
  "wrong", "fail", "epic", "viral", "crazy", "hidden",
];

const CURIOSITY_WORDS = [
  "nobody", "secret", "wrong", "banned", "won't believe", "wait for",
  "you missed", "the truth", "exposed", "never told", "hidden", "why",
];

const STOP_WORDS = new Set([
  "the", "a", "an", "of", "to", "and", "or", "in", "on", "for", "with",
  "this", "that", "your", "you", "is", "are", "it", "at", "by", "be",
]);

function keywordsFrom(text: string, max: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.toLowerCase().split(/[^a-z0-9']+/)) {
    const word = raw.trim();
    if (word.length < 3 || STOP_WORDS.has(word) || seen.has(word)) continue;
    seen.add(word);
    out.push(word);
    if (out.length >= max) break;
  }
  return out;
}

interface ChannelCopy {
  audience: string;
  tags: string[];
  hashtags: string[];
  hookLines: string[];
  pinned: string[];
  community: string[];
}

const CHANNEL_COPY: Record<string, ChannelCopy> = {
  wyr: {
    audience: "quiz fans",
    tags: ["would you rather", "quiz", "brain teaser", "hard choices", "trivia", "challenge", "interactive", "poll"],
    hashtags: ["#wouldyourather", "#quiz", "#challenge", "#braingames"],
    hookLines: [
      "99% of people get at least one of these WRONG.",
      "These choices look easy — until the timer starts.",
      "Your friends WILL argue about question 3.",
      "Only a genius scores 5/5 on this one.",
    ],
    pinned: [
      "Drop your score below — anyone brave enough to admit 0/5? 👇",
      "Which question broke you? Be honest 👇",
      "Team A or Team B on the last one? Defend your answer 👇",
    ],
    community: [
      "New impossible-choice quiz just dropped — the last question is causing chaos in the comments. Think you'd survive it?",
      "We made the hardest would-you-rather yet. Early voters are split EXACTLY 50/50. Come break the tie.",
    ],
  },
  clips: {
    audience: "stream clip fans",
    tags: ["stream highlights", "funny moments", "gaming clips", "twitch moments", "fails", "rage", "clutch", "reaction"],
    hashtags: ["#gaming", "#streamer", "#funnymoments", "#clips"],
    hookLines: [
      "The ending of this clip is genuinely unhinged.",
      "Chat did NOT recover from this moment.",
      "He had one HP. What happens next shouldn't be possible.",
      "This is why you never mute your mic mid-game.",
    ],
    pinned: [
      "Timestamp your favourite moment below 👇 Best comment gets pinned next video",
      "Should we clip more of this streamer? Vote in the comments 👇",
      "Be honest — did you see that ending coming? 👇",
    ],
    community: [
      "Just clipped the single funniest stream moment of the week. The last 3 seconds are unreal. New Short is live.",
      "You voted for more rage moments — we delivered. This one escalates FAST.",
    ],
  },
  top5: {
    audience: "countdown fans",
    tags: ["top 5", "funniest moments", "countdown", "compilation", "best of", "ranked", "try not to laugh", "highlights"],
    hashtags: ["#top5", "#trynottolaugh", "#funny", "#countdown"],
    hookLines: [
      "Number 1 broke the entire chat — no exaggeration.",
      "We ranked the 5 funniest moments. You are NOT ready for #1.",
      "If you make it past #3 without laughing, you're a robot.",
      "Five moments. One of them ended a friendship (allegedly).",
    ],
    pinned: [
      "Did we rank them right, or does #2 deserve the crown? 👇",
      "What moment should be #1 next week? Drop clips below 👇",
      "Which number got you? Confess 👇",
    ],
    community: [
      "This week's Top 5 is our chaotic best yet — #1 had the whole edit bay crying. Live now.",
      "Ranking day! The community submissions this week were ELITE. See if yours made the cut.",
    ],
  },
};

const DEFAULT_COPY = CHANNEL_COPY.clips;

const GENERIC_TAGS = ["shorts", "viral", "trending", "fyp", "entertainment", "funny shorts", "must watch", "best shorts"];

// ── SeoPack ──────────────────────────────────────────────────────────────────

function buildDescription(
  title: string,
  context: string,
  copy: ChannelCopy,
  keywords: string[],
  rand: () => number,
): string {
  const hook = pick(rand, copy.hookLines);
  const kwPhrase = keywords.slice(0, 4).join(", ");
  const para1 = `${hook} ${title} is the latest drop for ${copy.audience} — packed with ${kwPhrase || "the moments everyone is talking about"}${context ? `. ${context.slice(0, 140)}` : ""}.`;
  const para2 = `Subscribe so you never miss an upload — new Shorts land every single day. Like the video if it got you, comment your take below, and share it with the one friend who NEEDS to see this. Watch to the very end — the best part is always last.`;
  return `${para1}\n\n${para2}`;
}

/** Pure, deterministic SeoPack — exported for unit tests. */
export function buildSeoPack(opts: {
  title: string;
  context?: string;
  channelType?: string;
}): SeoPack {
  const { title, context = "", channelType = "clips" } = opts;
  const copy = CHANNEL_COPY[channelType] ?? DEFAULT_COPY;
  const rand = seededRandom(fnv1a(`seo:${title}:${channelType}`) || 1);

  const titleKeywords = keywordsFrom(`${title} ${context}`, 8);
  const keywords = [...new Set([...titleKeywords, ...copy.tags.slice(0, 4)])].slice(0, 10);

  // 12-16 tags: title-derived + channel pool + generic, deduped.
  const tagCount = 12 + Math.floor(rand() * 5);
  const tags: string[] = [];
  const seen = new Set<string>();
  for (const tag of [...titleKeywords, ...copy.tags, ...GENERIC_TAGS]) {
    const t = tag.toLowerCase();
    if (seen.has(t)) continue;
    seen.add(t);
    tags.push(t);
    if (tags.length >= tagCount) break;
  }

  const topicTag = titleKeywords[0] ? `#${titleKeywords[0].replace(/[^a-z0-9]/g, "")}` : "#viral";
  const hashtags = [...new Set(["#shorts", ...copy.hashtags, topicTag])].slice(0, 5);

  return {
    title,
    description: buildDescription(title, context, copy, titleKeywords, rand),
    hashtags,
    tags,
    keywords,
    pinnedComment: pick(rand, copy.pinned),
    communityPost: pick(rand, copy.community),
  };
}

interface AiSeoShape {
  title?: unknown;
  description?: unknown;
  hashtags?: unknown;
  tags?: unknown;
  keywords?: unknown;
  pinnedComment?: unknown;
  communityPost?: unknown;
}

function stringArray(v: unknown, max: number): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).slice(0, max);
}

export async function generateSeoPack(opts: {
  title: string;
  context?: string;
  channelType?: string;
}): Promise<SeoPack> {
  const fallback = buildSeoPack(opts);
  if (isMockAi()) return fallback;

  try {
    const ai = await aiCompleteJson<AiSeoShape>({
      system:
        "You are a YouTube Shorts SEO expert. You write keyword-rich, high-CTR metadata. British English.",
      prompt: `Create an SEO pack for a YouTube Short titled "${opts.title}" (${opts.channelType ?? "clips"} channel).${opts.context ? ` Context: ${opts.context.slice(0, 300)}` : ""} Respond as JSON: {"description":"2 paragraphs, hook sentence first, keyword-rich","tags":["12-16 search tags"],"hashtags":["5 hashtags including #shorts"],"keywords":["8-10 keywords"],"pinnedComment":"one engagement question","communityPost":"one teaser post"}`,
      maxTokens: 900,
    });

    const description = typeof ai.description === "string" && ai.description.trim().length > 40
      ? ai.description.trim()
      : fallback.description;
    const tags = stringArray(ai.tags, 16);
    const hashtags = stringArray(ai.hashtags, 5).map((h) => (h.startsWith("#") ? h : `#${h}`));
    if (!hashtags.some((h) => h.toLowerCase() === "#shorts")) hashtags.unshift("#shorts");

    return {
      title: opts.title,
      description,
      hashtags: hashtags.slice(0, 5).length >= 3 ? hashtags.slice(0, 5) : fallback.hashtags,
      tags: tags.length >= 12 ? tags : fallback.tags,
      keywords: stringArray(ai.keywords, 10).length >= 5 ? stringArray(ai.keywords, 10) : fallback.keywords,
      pinnedComment:
        typeof ai.pinnedComment === "string" && ai.pinnedComment.trim()
          ? ai.pinnedComment.trim()
          : fallback.pinnedComment,
      communityPost:
        typeof ai.communityPost === "string" && ai.communityPost.trim()
          ? ai.communityPost.trim()
          : fallback.communityPost,
    };
  } catch (err) {
    log.warn(`AI SEO failed — using deterministic pack: ${err instanceof Error ? err.message : String(err)}`);
    return fallback;
  }
}

// ── Title ideas ──────────────────────────────────────────────────────────────

/** CTR heuristic scorer — exported for tests. Returns score 1-99 + reasons. */
export function scoreTitleCtr(title: string): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 40;
  const lower = title.toLowerCase();

  if (/\d/.test(title)) {
    score += 12;
    reasons.push("Contains a number — numbers lift CTR");
  }
  const curiosity = CURIOSITY_WORDS.filter((w) => lower.includes(w));
  if (curiosity.length > 0) {
    score += 10;
    reasons.push(`Curiosity gap ("${curiosity[0]}")`);
  }
  const power = POWER_WORDS.filter((w) => lower.includes(w));
  if (power.length > 0) {
    score += Math.min(12, power.length * 4);
    reasons.push(`Power word${power.length > 1 ? "s" : ""}: ${power.slice(0, 3).join(", ")}`);
  }
  if (title.length >= 35 && title.length <= 55) {
    score += 15;
    reasons.push("Ideal length (35-55 chars)");
  } else {
    score -= Math.min(15, Math.ceil(Math.abs(title.length - 45) / 4));
    reasons.push(title.length < 35 ? "A little short — add specificity" : "Long — risks truncation");
  }
  if (/\p{Extended_Pictographic}/u.test(title)) {
    score += 6;
    reasons.push("Emoji stands out in the feed");
  }
  if (title.includes("?")) {
    score += 5;
    reasons.push("Question mark invites a response");
  }
  if (/\b[A-Z]{3,}\b/.test(title)) {
    score += 4;
    reasons.push("CAPS word adds urgency");
  }
  return { score: clamp(Math.round(score), 1, 99), reasons };
}

const TITLE_TEMPLATES: Record<string, string[]> = {
  wyr: [
    "Would You Rather: {topic}? 🤯",
    "99% Pick WRONG on This {topic} Question",
    "The {topic} Choice That Splits Everyone 50/50",
    "You Have 5 Seconds: {topic} Edition",
    "Impossible {topic} Choices (Don't Overthink!)",
    "Nobody Survives Question 5 — {topic} Quiz",
    "{topic}: Pick One... Forever 😳",
    "The Hardest {topic} Quiz on YouTube",
    "5 {topic} Questions That End Friendships",
    "Can You Score 5/5? {topic} Challenge",
    "Your Last Answer Reveals Everything — {topic}",
    "This {topic} Question Broke the Comments",
  ],
  clips: [
    "He Did NOT Just Do That... 💀",
    "The {topic} Moment That Broke Chat",
    "1 HP Clutch Nobody Saw Coming 😱",
    "Wait For The Ending... {topic} Gone Wrong",
    "This {topic} Rage Quit Is Legendary",
    "Streamer's {topic} Fail Goes Viral Instantly",
    "The Funniest {topic} Clip You'll See Today",
    "Chat Made Him Do It — {topic} Chaos",
    "You Won't Believe This {topic} Play 🔥",
    "3 Seconds That Ruined His Whole Stream",
    "{topic}: The Clip He Wants DELETED",
    "POV: Your {topic} Game Goes Horribly Wrong",
  ],
  top5: [
    "Top 5 Funniest {topic} Moments This Week 😂",
    "5 {topic} Moments Ranked — #1 Is Unreal",
    "Try Not To Laugh: {topic} Edition (IMPOSSIBLE)",
    "The 5 Wildest {topic} Clips Ever Ranked",
    "#1 Broke Everyone — Top 5 {topic} Fails",
    "Top 5 {topic} Moments (Number 2 Is Criminal)",
    "We Ranked 5 {topic} Disasters — You're Not Ready",
    "5 {topic} Clips That Should Be Illegal 💀",
    "Countdown: The {topic} Hall of Fame",
    "Top 5 {topic} Rage Moments — Sound ON",
    "Only Legends Survive #1 — {topic} Top 5",
    "The Definitive Top 5 {topic} Moments 🏆",
  ],
};

function titleCase(s: string): string {
  return s
    .split(/\s+/)
    .map((w) => (w.length > 2 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/** Pure, deterministic title ideas — exported for tests. Sorted score desc. */
export function buildTitleIdeas(topic: string, count: number, channelType?: string): TitleIdea[] {
  const templates = TITLE_TEMPLATES[channelType ?? ""] ?? [
    ...TITLE_TEMPLATES.clips.slice(0, 6),
    ...TITLE_TEMPLATES.top5.slice(0, 6),
  ];
  const rand = seededRandom(fnv1a(`titles:${topic}:${channelType ?? ""}`) || 1);
  const prettyTopic = titleCase(topic.trim());

  const ideas: TitleIdea[] = [];
  const used = new Set<string>();
  let i = Math.floor(rand() * templates.length);
  while (ideas.length < Math.min(count, templates.length)) {
    const template = templates[i % templates.length];
    i++;
    const title = template.replace(/\{topic\}/g, prettyTopic);
    if (used.has(title)) continue;
    used.add(title);
    const { score, reasons } = scoreTitleCtr(title);
    ideas.push({ title, score, reasons });
  }
  ideas.sort((a, b) => b.score - a.score);
  return ideas;
}

interface AiTitleShape {
  titles?: { title?: unknown; reasons?: unknown }[];
}

export async function generateTitleIdeas(
  topic: string,
  count: number,
  channelType?: string,
): Promise<TitleIdea[]> {
  const wanted = clamp(Math.floor(count) || 10, 1, 25);
  const fallback = buildTitleIdeas(topic, wanted, channelType);
  if (isMockAi()) return fallback;

  try {
    const ai = await aiCompleteJson<AiTitleShape>({
      system: "You write high-CTR YouTube Shorts titles. 35-55 characters, curiosity-driven.",
      prompt: `Write ${wanted} YouTube Shorts titles about "${topic}" for a ${channelType ?? "clips"} channel. JSON: {"titles":[{"title":"...","reasons":["why it will get clicks"]}]}`,
      maxTokens: 900,
    });
    const list = Array.isArray(ai.titles) ? ai.titles : [];
    const ideas: TitleIdea[] = [];
    for (const item of list) {
      if (typeof item.title !== "string" || !item.title.trim()) continue;
      const title = item.title.trim();
      const { score, reasons } = scoreTitleCtr(title);
      const aiReasons = stringArray(item.reasons, 3);
      ideas.push({ title, score, reasons: aiReasons.length > 0 ? aiReasons : reasons });
    }
    if (ideas.length === 0) return fallback;
    ideas.sort((a, b) => b.score - a.score);
    return ideas.slice(0, wanted);
  } catch (err) {
    log.warn(`AI titles failed — using deterministic ideas: ${err instanceof Error ? err.message : String(err)}`);
    return fallback;
  }
}

// ── Hooks ────────────────────────────────────────────────────────────────────

const HOOK_TEMPLATES = [
  "Wait — {topic} isn't what you think it is.",
  "99% of people get {topic} completely wrong.",
  "This {topic} moment took 0.3 seconds to go viral.",
  "Nobody talks about the dark side of {topic}...",
  "I tested {topic} so you don't have to. Big mistake.",
  "The {topic} secret they don't want you to know:",
  "You have 5 seconds before this {topic} twist hits.",
  "Stop scrolling — this {topic} clip is that good.",
  "POV: {topic} just changed everything.",
  "Rule #1 of {topic}: never do what he did.",
  "The last 3 seconds of this {topic} clip are unreal.",
  "Everyone missed the {topic} detail at 0:07.",
  "If {topic} is this easy, why does everyone fail?",
  "This is your sign to finally try {topic}.",
  "One {topic} decision. Two very different endings.",
  "Watch his face when the {topic} reveal lands.",
];

/** Deterministic hooks — also serves as the AI fallback. */
export function buildHooks(topic: string, count: number): string[] {
  const rand = seededRandom(fnv1a(`hooks:${topic}`) || 1);
  const pretty = topic.trim().toLowerCase();
  const start = Math.floor(rand() * HOOK_TEMPLATES.length);
  const out: string[] = [];
  for (let i = 0; i < Math.min(count, HOOK_TEMPLATES.length); i++) {
    out.push(HOOK_TEMPLATES[(start + i) % HOOK_TEMPLATES.length].replace(/\{topic\}/g, pretty));
  }
  return out;
}

export async function generateHooks(topic: string, count = 8): Promise<string[]> {
  const wanted = clamp(Math.floor(count) || 8, 1, 20);
  const fallback = buildHooks(topic, wanted);
  if (isMockAi()) return fallback;

  try {
    const ai = await aiCompleteJson<{ hooks?: unknown }>({
      system: "You write scroll-stopping first lines for YouTube Shorts. Max 12 words each.",
      prompt: `Write ${wanted} opening hooks about "${topic}". JSON: {"hooks":["..."]}`,
      maxTokens: 500,
    });
    const hooks = stringArray(ai.hooks, wanted);
    return hooks.length >= Math.min(3, wanted) ? hooks : fallback;
  } catch (err) {
    log.warn(`AI hooks failed — using deterministic hooks: ${err instanceof Error ? err.message : String(err)}`);
    return fallback;
  }
}
