// ── Fable Studio AI — demo seed literals ─────────────────────────────────────
// Bulky data used exclusively by prisma/seed.ts. Deterministic: every derived
// value flows from seededRandom(fnv1a(...)) so reseeding produces identical data.

import { fnv1a, seededRandom, wyrHash } from "@fable/shared";
import type {
  Branding,
  ChannelType,
  ClipsConfig,
  EditPlan,
  ScoreBreakdown,
  SeoPack,
  ThumbnailVariant,
  Top5Config,
  TranscriptSegment,
  UploadDefaults,
  ViralScore,
  WeeklySchedule,
  WyrConfig,
  WyrDifficulty,
  WyrQuestionT,
} from "@fable/shared";

// ── Channels ─────────────────────────────────────────────────────────────────

export interface ChannelSeed {
  key: ChannelType;
  name: string;
  handle: string;
  type: ChannelType;
  description: string;
  avatarColor: string;
  subscriberCount: number;
  connected: boolean;
  branding: Branding;
  uploadDefaults: UploadDefaults;
  schedule: WeeklySchedule;
  prompts: Record<string, string>;
  /** analytics tuning */
  baseViews: number;
  growth: number;
  statFactor: number;
}

export const CHANNEL_SEEDS: ChannelSeed[] = [
  {
    key: "wyr",
    name: "Brain Battles",
    handle: "brainbattles",
    type: "wyr",
    description:
      "Daily Would-You-Rather Shorts that break brains. New dilemmas at 9am, 1pm and 6pm — comment your pick 👇",
    avatarColor: "#8b5cf6",
    subscriberCount: 258_300,
    connected: true,
    branding: {
      primaryColor: "#8b5cf6",
      secondaryColor: "#22d3ee",
      font: "Poppins",
      watermarkText: "@brainbattles",
      introText: "Would you rather…",
      outroText: "Comment your pick! 👇",
      cta: "Follow for daily dilemmas 🧠",
      voice: {
        provider: "openai",
        voiceId: "onyx-uk",
        gender: "male",
        accent: "british",
        energy: "high",
        emotion: "excited",
      },
      musicStyle: "upbeat-edm",
    },
    uploadDefaults: {
      visibility: "public",
      category: "Entertainment",
      madeForKids: false,
      notifySubscribers: true,
      language: "en-GB",
    },
    schedule: {
      "1": ["09:00", "13:00", "18:00"],
      "2": ["09:00", "13:00", "18:00"],
      "3": ["09:00", "13:00", "18:00"],
      "4": ["09:00", "13:00", "18:00"],
      "5": ["09:00", "13:00", "18:00"],
      "6": ["10:00", "15:00", "19:00"],
      "0": ["10:00", "15:00", "19:00"],
    },
    prompts: {
      tone: "Cheeky, fast-paced, UK-flavoured. Short punchy sentences.",
      hookStyle: "Open with the hardest question of the batch, never a greeting.",
      bannedWords: "basically, obviously, guys",
    },
    baseViews: 42_000,
    growth: 0.65,
    statFactor: 1.7,
  },
  {
    key: "clips",
    name: "StreamGoldClips",
    handle: "streamgold",
    type: "clips",
    description:
      "The best stream moments on the internet, clipped and captioned daily. Wait for it… ⭐",
    avatarColor: "#a855f7",
    subscriberCount: 84_120,
    connected: false,
    branding: {
      primaryColor: "#a855f7",
      secondaryColor: "#f59e0b",
      font: "Montserrat",
      watermarkText: "@streamgold",
      introText: "Wait for it…",
      outroText: "Full stream on the main channel",
      cta: "Subscribe for daily stream gold ⭐",
      voice: {
        provider: "elevenlabs",
        voiceId: "blitz-au",
        gender: "male",
        accent: "australian",
        energy: "hyper",
        emotion: "funny",
      },
      musicStyle: "phonk",
    },
    uploadDefaults: {
      visibility: "public",
      category: "Gaming",
      madeForKids: false,
      notifySubscribers: true,
      language: "en-GB",
    },
    schedule: {
      "1": ["11:00", "16:30", "20:30"],
      "2": ["11:00", "20:30"],
      "3": ["11:00", "16:30", "20:30"],
      "4": ["11:00", "20:30"],
      "5": ["11:00", "16:30", "20:30"],
      "6": ["12:00", "17:00", "21:00"],
      "0": ["12:00", "17:00", "21:00"],
    },
    prompts: {
      tone: "Hype, meme-literate, zero filler. Captions do the talking.",
      hookStyle: "Freeze-frame the payoff moment for the first 0.8 seconds.",
      bannedWords: "insane (max once per video), literally",
    },
    baseViews: 16_500,
    growth: 0.5,
    statFactor: 1.0,
  },
  {
    key: "top5",
    name: "Top5Chaos",
    handle: "top5chaos",
    type: "top5",
    description:
      "One Top 5 countdown every day. Number 1 will always surprise you 🏆",
    avatarColor: "#d946ef",
    subscriberCount: 12_840,
    connected: false,
    branding: {
      primaryColor: "#d946ef",
      secondaryColor: "#facc15",
      font: "Bebas Neue",
      watermarkText: "@top5chaos",
      introText: "Number 5 will surprise you…",
      outroText: "Which was your favourite?",
      cta: "Sub for a Top 5 every day 🏆",
      voice: {
        provider: "openai",
        voiceId: "nova-us",
        gender: "female",
        accent: "american",
        energy: "high",
        emotion: "dramatic",
      },
      musicStyle: "hype-trap",
    },
    uploadDefaults: {
      visibility: "public",
      category: "Comedy",
      madeForKids: false,
      notifySubscribers: true,
      language: "en-GB",
    },
    schedule: {
      "1": ["17:00"],
      "2": ["17:00"],
      "3": ["17:00"],
      "4": ["17:00"],
      "5": ["17:00", "20:00"],
      "6": ["11:00", "17:00"],
      "0": ["11:00", "17:00"],
    },
    prompts: {
      tone: "Dramatic countdown narrator with a wink. Build tension every rank.",
      hookStyle: "Tease #1 in the first line without spoiling it.",
      bannedWords: "epic",
    },
    baseViews: 3_600,
    growth: 1.1,
    statFactor: 0.4,
  },
];

// ── Published + ready videos ─────────────────────────────────────────────────

export interface PublishedVideoSeed {
  title: string;
  daysAgo: number;
  durationSec: number;
  viralScore: number;
}

export const PUBLISHED_VIDEOS: Record<ChannelType, PublishedVideoSeed[]> = {
  wyr: [
    { title: "Would You Rather LOSE £10,000 or EAT This? 🤯", daysAgo: 1, durationSec: 58, viralScore: 92 },
    { title: "99% Pick WRONG on Question 7… 😱", daysAgo: 4, durationSec: 42, viralScore: 78 },
    { title: "Would You Rather Have UNLIMITED Money or TRUE Love? 💸", daysAgo: 8, durationSec: 59, viralScore: 85 },
    { title: "Only GENIUSES Get All 8 Right 🧠", daysAgo: 12, durationSec: 45, viralScore: 71 },
    { title: "Would You Rather Fight 100 Duck-Sized Horses? 🐴", daysAgo: 17, durationSec: 38, viralScore: 66 },
    { title: "This Question BROKE My Comments Section 💀", daysAgo: 22, durationSec: 57, viralScore: 88 },
    { title: "Would You Rather NEVER Sleep or NEVER Eat Again? 😴", daysAgo: 27, durationSec: 44, viralScore: 74 },
  ],
  clips: [
    { title: "Streamer RAGE QUITS After This 😡", daysAgo: 2, durationSec: 26, viralScore: 94 },
    { title: "The Timing on This is INSANE 😭", daysAgo: 5, durationSec: 31, viralScore: 83 },
    { title: "Chat Made Him Do It… BIG Mistake 💀", daysAgo: 9, durationSec: 22, viralScore: 76 },
    { title: "He Bought the WHOLE Stock… Live 🛒", daysAgo: 14, durationSec: 35, viralScore: 69 },
    { title: "This Clip Got Him BANNED (Almost) 😳", daysAgo: 19, durationSec: 28, viralScore: 87 },
    { title: "The Worst Luck in Twitch History 🎲", daysAgo: 25, durationSec: 41, viralScore: 62 },
  ],
  top5: [
    { title: "Top 5 Streamers Caught Off Guard 💀", daysAgo: 3, durationSec: 57, viralScore: 81 },
    { title: "Top 5 WORST Backseat Gamers Ever 🎮", daysAgo: 7, durationSec: 54, viralScore: 73 },
    { title: "Top 5 Most Expensive Fails Caught Live 💸", daysAgo: 11, durationSec: 59, viralScore: 68 },
    { title: "Top 5 Times Chat Predicted the Future 🔮", daysAgo: 16, durationSec: 52, viralScore: 90 },
    { title: "Top 5 NPC Moments That Felt Scripted 🤖", daysAgo: 21, durationSec: 49, viralScore: 58 },
  ],
};

export interface ReadyVideoSeed {
  title: string;
  durationSec: number;
  viralScore: number;
  /** true → attach to an upcoming schedule slot (status "scheduled") */
  scheduled: boolean;
}

/** Ready pool for wyr + top5. The clips channel's ready pool is derived from PROJECT2 kept clips. */
export const READY_VIDEOS: Record<"wyr" | "top5", ReadyVideoSeed[]> = {
  wyr: [
    { title: "8 Questions That Get HARDER Every Time 📈", durationSec: 59, viralScore: 84, scheduled: true },
    { title: "Would You Rather Teleport or Read Minds? ✨", durationSec: 44, viralScore: 77, scheduled: true },
    { title: "Would You Rather Be RICH and Hated or POOR and Loved? 💰", durationSec: 58, viralScore: 88, scheduled: false },
    { title: "Nobody Picks B on Question 5… 🤔", durationSec: 41, viralScore: 69, scheduled: false },
  ],
  top5: [
    { title: "Top 5 Clutchest Moments in Ranked 🏆", durationSec: 56, viralScore: 86, scheduled: true },
    { title: "Top 5 Times the NPC Won 🤖", durationSec: 53, viralScore: 79, scheduled: true },
    { title: "Top 5 Soundboard Trolls Gone Right 🔊", durationSec: 58, viralScore: 72, scheduled: false },
  ],
};

/** scheduled flags for the 5 videos derived from PROJECT2 kept clips (in clip order). */
export const CLIPS_READY_SCHEDULED_FLAGS: boolean[] = [true, true, false, false, false];

export const TAGS: Record<ChannelType, string[]> = {
  wyr: [
    "would you rather",
    "quiz",
    "impossible questions",
    "brain battles",
    "interactive quiz",
    "hard choices",
    "shorts quiz",
    "this or that",
    "trivia shorts",
    "challenge",
    "pick one",
    "dilemma",
  ],
  clips: [
    "stream highlights",
    "twitch clips",
    "funny moments",
    "streamer",
    "gaming clips",
    "rage",
    "fails",
    "best of twitch",
    "live reaction",
    "clipped",
    "gaming shorts",
    "stream fails",
  ],
  top5: [
    "top 5",
    "countdown",
    "funniest moments",
    "compilation",
    "best of",
    "gaming fails",
    "ranked worst to best",
    "top five",
    "viral moments",
    "reaction",
    "rage quits",
    "stream compilation",
  ],
};

export const HASHTAGS: Record<ChannelType, string[]> = {
  wyr: ["#shorts", "#wouldyourather", "#quiz", "#challenge", "#viral"],
  clips: ["#shorts", "#twitch", "#streamer", "#gaming", "#funny"],
  top5: ["#shorts", "#top5", "#funny", "#gaming", "#compilation"],
};

// ── Project 1 — WYR "review" ─────────────────────────────────────────────────

export const PROJECT1_TITLE = "Money Madness — 8 Impossible Money Questions";

export const PROJECT1_CONFIG: WyrConfig = {
  difficulty: "hard",
  theme: "money",
  lengthSec: 60,
  questionCount: 8,
};

export const PROJECT1_QUESTIONS: WyrQuestionT[] = [
  {
    theme: "money",
    difficulty: "hard",
    optionA: "LOSE £10,000 instantly",
    optionB: "EAT a stranger's mystery leftovers for a month",
    percentA: 34,
    factoid: "Disgust beats greed — until it's real money on the line.",
  },
  {
    theme: "money",
    difficulty: "hard",
    optionA: "Take a guaranteed £250,000",
    optionB: "Flip a coin for £1,000,000",
    percentA: 71,
    factoid: "Economists call the safe pick 'risk aversion'. Chat calls it cowardice.",
  },
  {
    theme: "money",
    difficulty: "hard",
    optionA: "Earn £500 a day but work every single day",
    optionB: "Earn £100 a day with weekends off",
    percentA: 44,
    factoid: "That's £182,500 a year versus £26,000 — but zero days off. Ever.",
  },
  {
    theme: "money",
    difficulty: "hard",
    optionA: "Be given £1,000,000 you can never spend on yourself",
    optionB: "Get £50,000 with no strings attached",
    percentA: 38,
    factoid: "Generosity polls well until the fine print kicks in.",
  },
  {
    theme: "money",
    difficulty: "hard",
    optionA: "Double your salary while your rent triples",
    optionB: "Keep both exactly as they are",
    percentA: 29,
    factoid: "Run the numbers — for most people option A is a pay cut.",
  },
  {
    theme: "money",
    difficulty: "hard",
    optionA: "Find £20 on the floor every day forever",
    optionB: "Get £100,000 right now",
    percentA: 55,
    factoid: "£20 a day passes £100k in under 14 years. Patience pays.",
  },
  {
    theme: "money",
    difficulty: "hard",
    optionA: "Retire at 30 with £800,000",
    optionB: "Retire at 60 with £8,000,000",
    percentA: 62,
    factoid: "Time or money — you only get to max one.",
  },
  {
    theme: "money",
    difficulty: "hard",
    optionA: "Have your bank balance public forever",
    optionB: "Have your search history public forever",
    percentA: 41,
    factoid: "The question that broke our comments section last time.",
  },
];

export const PROJECT1_SEO: SeoPack = {
  title: "Would You Rather LOSE £10,000? 💸 8 IMPOSSIBLE Money Questions",
  description:
    "8 money questions that split the internet 50/50. Question 7 breaks everyone.\n\nCan you make it through all 8 without pausing? Comment your picks 👇\nNew impossible dilemmas every day on Brain Battles.\n\n#shorts #wouldyourather #quiz #money #challenge",
  hashtags: ["#shorts", "#wouldyourather", "#quiz", "#money", "#challenge"],
  tags: [
    "would you rather",
    "money questions",
    "impossible quiz",
    "brain battles",
    "interactive quiz",
    "hard choices",
    "money challenge",
    "would you rather money edition",
  ],
  keywords: ["would you rather money", "impossible money questions", "hardest would you rather", "money quiz shorts"],
  pinnedComment: "Question 7 splits everyone 50/50 — which side are you on? 👇",
  communityPost:
    "New IMPOSSIBLE money edition just dropped 💸 8 questions, zero easy answers. Can you get through without pausing? Vote in the comments!",
};

export const PROJECT1_VIRAL: ViralScore = {
  total: 87,
  breakdown: {
    hook: 91,
    editing: 84,
    pacing: 88,
    seo: 86,
    thumbnail: 82,
    retention: 85,
    topic: 90,
    trending: 89,
    psychology: 93,
  },
  suggestions: [
    "Move the £10,000 question to slot 1 — your strongest hook currently sits at question 3.",
    "Add a 0.4s freeze + zoom punch before each reveal to spike replay rate.",
    "Test thumbnail variant B ('99% PICK WRONG') — loss-framing lifts CTR ~1.2% on this channel.",
    "End on a cliffhanger question and answer it in tomorrow's Short to chain views.",
  ],
};

export const PROJECT1_THUMBS: ThumbnailVariant[] = [
  {
    id: "p1-t1",
    headline: "LOSE £10,000?",
    subtext: "or eat THIS",
    emoji: "🤯",
    bgFrom: "#8b5cf6",
    bgTo: "#312e81",
    accentColor: "#fde047",
    style: "split",
    predictedCtr: 9.1,
  },
  {
    id: "p1-t2",
    headline: "99% PICK WRONG",
    subtext: "money edition",
    emoji: "💸",
    bgFrom: "#7c3aed",
    bgTo: "#0f0a1e",
    accentColor: "#22d3ee",
    style: "bold",
    predictedCtr: 8.4,
  },
  {
    id: "p1-t3",
    headline: "IMPOSSIBLE",
    subtext: "8 money questions",
    emoji: "😱",
    bgFrom: "#a855f7",
    bgTo: "#1e1b4b",
    accentColor: "#f472b6",
    style: "glow",
    predictedCtr: 7.8,
  },
  {
    id: "p1-t4",
    headline: "£250K or FLIP?",
    subtext: "question 2",
    emoji: "🪙",
    bgFrom: "#6d28d9",
    bgTo: "#111827",
    accentColor: "#34d399",
    style: "arrow",
    predictedCtr: 7.2,
  },
];

// ── Edit-plan builder (deterministic per clip title) ─────────────────────────

const SFX_POOL = ["vine-boom", "whoosh", "record-scratch", "bruh", "airhorn", "glass-shatter", "boing"] as const;
const OVERLAY_KINDS = ["meme", "gif", "sticker", "graphic"] as const;

export function makeEditPlan(
  seedKey: string,
  lenSec: number,
  hookText: string,
  ctaText: string,
  memeLabel: string
): EditPlan {
  const rand = seededRandom(fnv1a(`edit:${seedKey}`));
  const zoomCount = 2 + Math.floor(rand() * 2);
  const zooms = Array.from({ length: zoomCount }, (_, i) => ({
    atSec: Math.round(((i + 0.3 + rand() * 0.45) / zoomCount) * lenSec * 10) / 10,
    scale: Math.round((1.25 + rand() * 0.4) * 100) / 100,
    durationSec: Math.round((0.3 + rand() * 0.5) * 10) / 10,
  }));
  const sfxCount = 2 + Math.floor(rand() * 2);
  const sfx = Array.from({ length: sfxCount }, (_, i) => ({
    atSec: Math.round(((i + 0.5 + rand() * 0.4) / sfxCount) * lenSec * 10) / 10,
    name: SFX_POOL[Math.floor(rand() * SFX_POOL.length)],
  }));
  return {
    reframe: { mode: rand() > 0.5 ? "face-track" : "speaker-track" },
    zooms,
    captions: { style: "beast", animated: true },
    overlays: [
      {
        atSec: Math.round(lenSec * (0.55 + rand() * 0.3) * 10) / 10,
        kind: OVERLAY_KINDS[Math.floor(rand() * OVERLAY_KINDS.length)],
        label: memeLabel,
      },
    ],
    sfx,
    hookText,
    ctaText,
  };
}

// ── Project 2 — Clips "ready" ────────────────────────────────────────────────

export const PROJECT2_TITLE = "Bounty Stream — Best Moments";
export const PROJECT2_SOURCE_URL = "https://www.youtube.com/watch?v=x7K9mPqW3vY";

export const PROJECT2_CONFIG: ClipsConfig = {
  sourceUrl: PROJECT2_SOURCE_URL,
  clipCount: 10,
  minScore: 65,
  captionStyle: "beast",
  addMemes: true,
};

export const PROJECT2_TRANSCRIPT: TranscriptSegment[] = [
  {
    startSec: 0,
    endSec: 14,
    text: "Alright chat, today we're doing the £10,000 bounty challenge. If I lose, I donate it. No pressure.",
    speaker: "Kai",
  },
  {
    startSec: 95,
    endSec: 112,
    text: "Wait. Wait wait wait. Do NOT open that door. Chat I swear if this is a jumpscare—",
    speaker: "Kai",
    markers: ["shouting"],
  },
  {
    startSec: 113,
    endSec: 121,
    text: "(screams) NOPE. Nope nope nope. We're done. Stream over.",
    speaker: "Kai",
    markers: ["shouting", "laughter"],
  },
  {
    startSec: 340,
    endSec: 355,
    text: "Okay so this guy has been following me for ten minutes and chat is just letting it happen.",
    speaker: "Kai",
    markers: ["laughter"],
  },
  {
    startSec: 612,
    endSec: 640,
    text: "Chat said pick the left chest. The left chest had ONE gold coin. One. I trusted you.",
    speaker: "Kai",
    markers: ["laughter"],
  },
  {
    startSec: 801,
    endSec: 828,
    text: "If I hit this shot, all of you have to change your names to KaiWasRight. Deal? Deal.",
    speaker: "Kai",
  },
  {
    startSec: 829,
    endSec: 836,
    text: "…HE HIT IT. I HIT IT! ARE YOU KIDDING ME!",
    speaker: "Kai",
    markers: ["shouting"],
  },
  {
    startSec: 1204,
    endSec: 1230,
    text: "Bro just went completely silent. Fifty thousand dollars. He can't even speak.",
    speaker: "Kai",
  },
  {
    startSec: 1420,
    endSec: 1444,
    text: "This is the most unlucky roll I've seen in three years of streaming. Clip it. Clip it now.",
    speaker: "Kai",
  },
  {
    startSec: 1801,
    endSec: 1825,
    text: "Don't laugh. DON'T laugh. If I laugh we restart the whole run— (wheeze)",
    speaker: "Kai",
    markers: ["laughter"],
  },
  {
    startSec: 2103,
    endSec: 2130,
    text: "Okay that timing was actually insane. The music synced PERFECTLY with the fall.",
    speaker: "Kai",
    markers: ["music", "laughter"],
  },
  {
    startSec: 2395,
    endSec: 2400,
    text: "Chat we got the win. WE GOT THE WIN. Best stream of the year, I'm calling it.",
    speaker: "Kai",
    markers: ["shouting"],
  },
];

export interface ClipSeed {
  index: number;
  title: string;
  hook: string;
  startSec: number;
  endSec: number;
  score: number;
  status: "kept" | "discarded" | "candidate";
  transcript: string;
  breakdown: ScoreBreakdown;
  editPlan: EditPlan;
  /** best sub-window, used by top5 script clipRefs */
  highlight?: { startSec: number; endSec: number };
}

const STREAMGOLD_CTA = "Subscribe for daily stream gold ⭐";

function clip(
  index: number,
  title: string,
  hook: string,
  startSec: number,
  endSec: number,
  score: number,
  status: ClipSeed["status"],
  transcript: string,
  breakdown: ScoreBreakdown,
  memeLabel: string,
  cta: string,
  highlight?: { startSec: number; endSec: number }
): ClipSeed {
  return {
    index,
    title,
    hook,
    startSec,
    endSec,
    score,
    status,
    transcript,
    breakdown,
    editPlan: makeEditPlan(title, endSec - startSec, hook, cta, memeLabel),
    highlight,
  };
}

export const PROJECT2_CLIPS: ClipSeed[] = [
  clip(
    0,
    "He Did NOT Expect That… 💀",
    "Wait for the door… 💀",
    95,
    121,
    94,
    "kept",
    "Wait. Wait wait wait. Do NOT open that door… (screams) NOPE. Nope nope nope. We're done.",
    { humor: 88, shock: 97, emotion: 74, drama: 92, informativeness: 20, energy: 95, hookStrength: 96 },
    "skull",
    STREAMGOLD_CTA
  ),
  clip(
    1,
    "He Called His Own Shot… AND HIT IT 🎯",
    "He called it. He actually called it.",
    801,
    836,
    88,
    "kept",
    "If I hit this shot, all of you have to change your names to KaiWasRight… HE HIT IT. I HIT IT!",
    { humor: 70, shock: 90, emotion: 85, drama: 94, informativeness: 30, energy: 92, hookStrength: 88 },
    "mind-blown",
    STREAMGOLD_CTA
  ),
  clip(
    2,
    "$50,000 and He Went COMPLETELY Silent 🤯",
    "$50,000… and total silence.",
    1204,
    1230,
    84,
    "kept",
    "Bro just went completely silent. Fifty thousand dollars. He can't even speak.",
    { humor: 55, shock: 92, emotion: 90, drama: 88, informativeness: 35, energy: 60, hookStrength: 85 },
    "stonks",
    STREAMGOLD_CTA
  ),
  clip(
    3,
    "The Most Unlucky Roll I've EVER Seen 🎲",
    "3 years of streaming. Worst luck ever.",
    1420,
    1444,
    78,
    "kept",
    "This is the most unlucky roll I've seen in three years of streaming. Clip it. Clip it now.",
    { humor: 82, shock: 75, emotion: 60, drama: 70, informativeness: 25, energy: 72, hookStrength: 74 },
    "clown",
    STREAMGOLD_CTA
  ),
  clip(
    4,
    "Try Not to Laugh (He Failed) 😂",
    "If he laughs, the run restarts.",
    1801,
    1825,
    71,
    "kept",
    "Don't laugh. DON'T laugh. If I laugh we restart the whole run— (wheeze)",
    { humor: 95, shock: 40, emotion: 55, drama: 45, informativeness: 15, energy: 78, hookStrength: 66 },
    "laughing-crying",
    STREAMGOLD_CTA
  ),
  clip(
    5,
    "Chat Picked the WRONG Chest 📦",
    "Never trust chat with loot.",
    612,
    640,
    58,
    "discarded",
    "Chat said pick the left chest. The left chest had ONE gold coin. One. I trusted you.",
    { humor: 76, shock: 45, emotion: 40, drama: 52, informativeness: 30, energy: 58, hookStrength: 50 },
    "sadge",
    STREAMGOLD_CTA
  ),
  clip(
    6,
    "Perfectly Timed Music Drop 🎵",
    "The sync is unreal.",
    2103,
    2130,
    52,
    "candidate",
    "Okay that timing was actually insane. The music synced PERFECTLY with the fall.",
    { humor: 68, shock: 35, emotion: 45, drama: 40, informativeness: 20, energy: 70, hookStrength: 44 },
    "chef-kiss",
    STREAMGOLD_CTA
  ),
  clip(
    7,
    "The 10-Minute Stalker NPC 🚶",
    "He's still following…",
    340,
    355,
    47,
    "discarded",
    "Okay so this guy has been following me for ten minutes and chat is just letting it happen.",
    { humor: 62, shock: 30, emotion: 25, drama: 38, informativeness: 22, energy: 45, hookStrength: 40 },
    "side-eye",
    STREAMGOLD_CTA
  ),
];

export const PROJECT2_SEO: SeoPack = {
  title: "He Did NOT Expect That… 💀 Best of the £10K Bounty Stream",
  description:
    "5 moments from the £10,000 bounty stream that had chat in shambles. The door clip is unreal.\n\nFull stream on the main channel. Clipped + captioned daily.\n\n#shorts #twitch #streamer #gaming #funny",
  hashtags: ["#shorts", "#twitch", "#streamer", "#gaming", "#funny"],
  tags: [
    "stream highlights",
    "twitch clips",
    "funny moments",
    "bounty stream",
    "gaming clips",
    "best of twitch",
    "live reaction",
    "jumpscare",
  ],
  keywords: ["stream highlights", "twitch jumpscare clip", "bounty challenge stream", "funny streamer moments"],
  pinnedComment: "Which clip goes hardest? Number 2 had me crying 😭",
  communityPost:
    "Dropped 5 new clips from the £10K bounty stream — the door one is genuinely unreal 💀 Which one's your favourite?",
};

export const PROJECT2_VIRAL: ViralScore = {
  total: 84,
  breakdown: {
    hook: 90,
    editing: 86,
    pacing: 88,
    seo: 78,
    thumbnail: 80,
    retention: 84,
    topic: 82,
    trending: 85,
    psychology: 83,
  },
  suggestions: [
    "Lead with the scream — move the door clip's final 3 seconds to a cold open.",
    "Freeze-frame the caption on 'DO NOT open that door' to create a clean loop point.",
    "Post the $50,000 silence clip Friday 18:00 — payoff-silence clips over-perform at weekends.",
  ],
};

export const PROJECT2_THUMBS: ThumbnailVariant[] = [
  {
    id: "p2-t1",
    headline: "HE SCREAMED",
    subtext: "clip of the year?",
    emoji: "💀",
    bgFrom: "#a855f7",
    bgTo: "#1e1b4b",
    accentColor: "#fde047",
    style: "face",
    predictedCtr: 8.8,
  },
  {
    id: "p2-t2",
    headline: "$50,000 SILENCE",
    subtext: "he couldn't speak",
    emoji: "😶",
    bgFrom: "#7c3aed",
    bgTo: "#0f0a1e",
    accentColor: "#f59e0b",
    style: "bold",
    predictedCtr: 8.1,
  },
  {
    id: "p2-t3",
    headline: "DON'T OPEN IT",
    subtext: "he opened it",
    emoji: "🚪",
    bgFrom: "#9333ea",
    bgTo: "#111827",
    accentColor: "#22d3ee",
    style: "arrow",
    predictedCtr: 7.6,
  },
  {
    id: "p2-t4",
    headline: "CALLED HIS SHOT",
    subtext: "and hit it",
    emoji: "🎯",
    bgFrom: "#6d28d9",
    bgTo: "#312e81",
    accentColor: "#34d399",
    style: "glow",
    predictedCtr: 6.9,
  },
];

// ── Project 3 — Top5 "review" ────────────────────────────────────────────────

export const PROJECT3_TITLE = "Rage Quit Compilation Vol. 3";
export const PROJECT3_SOURCE_URL = "https://www.youtube.com/watch?v=Zq8mR2kVtcE";

export const PROJECT3_CONFIG: Top5Config = {
  sourceUrl: PROJECT3_SOURCE_URL,
  countdownFrom: 5,
  captionStyle: "beast",
};

export const PROJECT3_TRANSCRIPT: TranscriptSegment[] = [
  {
    startSec: 0,
    endSec: 16,
    text: "Welcome back to ranked. Today we stay CALM. Today we do not touch the keyboard.",
    speaker: "Rez",
  },
  {
    startSec: 44,
    endSec: 47,
    text: "(controller clatter) I'm done. Forty-seven seconds. New record.",
    speaker: "Rez",
    markers: ["shouting", "laughter"],
  },
  {
    startSec: 210,
    endSec: 236,
    text: "He's been stuck on this boss for three hours chat. Three. Hours.",
    speaker: "Rez",
  },
  {
    startSec: 237,
    endSec: 248,
    text: "THE KEYBOARD IS IN THE POOL. HE THREW IT IN THE POOL.",
    speaker: "Rez",
    markers: ["shouting", "laughter"],
  },
  {
    startSec: 402,
    endSec: 430,
    text: "Look at his face. He's not even angry any more. That's worse.",
    speaker: "Rez",
  },
  {
    startSec: 431,
    endSec: 441,
    text: "(whisper) …I'm uninstalling. Right now. Live. Watch me.",
    speaker: "Rez",
  },
  {
    startSec: 442,
    endSec: 455,
    text: "HE'S ACTUALLY DRAGGING IT TO THE BIN. HE'S NOT BLUFFING.",
    speaker: "Rez",
    markers: ["shouting"],
  },
  {
    startSec: 700,
    endSec: 724,
    text: "The way he just… placed the controller down. Gently. And walked away.",
    speaker: "Rez",
    markers: ["silence"],
  },
  {
    startSec: 725,
    endSec: 733,
    text: "That silence is louder than any rage I've ever seen.",
    speaker: "Rez",
    markers: ["laughter"],
  },
  {
    startSec: 1012,
    endSec: 1040,
    text: "It knocked the drink over and he blamed the cat. The cat was asleep. On camera.",
    speaker: "Rez",
    markers: ["laughter"],
  },
  {
    startSec: 1041,
    endSec: 1050,
    text: "THE CAT WAS ASLEEP THE WHOLE TIME. WE HAVE FOOTAGE.",
    speaker: "Rez",
    markers: ["laughter", "shouting"],
  },
  {
    startSec: 1300,
    endSec: 1330,
    text: "Top tier meltdown compilation today chat. Clip everything. EVERYTHING.",
    speaker: "Rez",
    markers: ["laughter"],
  },
];

const TOP5CHAOS_CTA = "Sub for a Top 5 every day 🏆";

/** Ranked best-first: index 0 is #1 in the countdown. */
export const PROJECT3_CLIPS: ClipSeed[] = [
  clip(
    0,
    "The Keyboard Toss Heard Around the World ⌨️",
    "Three hours on one boss…",
    210,
    248,
    96,
    "kept",
    "He's been stuck on this boss for three hours chat… THE KEYBOARD IS IN THE POOL.",
    { humor: 92, shock: 90, emotion: 70, drama: 96, informativeness: 18, energy: 97, hookStrength: 93 },
    "explosion",
    TOP5CHAOS_CTA,
    { startSec: 236, endSec: 245 }
  ),
  clip(
    1,
    "He Uninstalled LIVE On Stream 🗑️",
    "He wasn't bluffing…",
    402,
    455,
    91,
    "kept",
    "(whisper) …I'm uninstalling. Right now. Live. Watch me. HE'S ACTUALLY DRAGGING IT TO THE BIN.",
    { humor: 85, shock: 88, emotion: 75, drama: 92, informativeness: 25, energy: 84, hookStrength: 87 },
    "trash-bin",
    TOP5CHAOS_CTA,
    { startSec: 442, endSec: 451 }
  ),
  clip(
    2,
    "Rage Quit Speedrun — 47 Seconds In ⏱️",
    "New world record 💀",
    0,
    47,
    87,
    "kept",
    "Today we stay CALM… (controller clatter) I'm done. Forty-seven seconds. New record.",
    { humor: 90, shock: 72, emotion: 55, drama: 78, informativeness: 20, energy: 88, hookStrength: 82 },
    "speedrun-timer",
    TOP5CHAOS_CTA,
    { startSec: 40, endSec: 47 }
  ),
  clip(
    3,
    "The Silent Controller Place-Down 😶",
    "The calm ones are the scariest.",
    700,
    733,
    82,
    "kept",
    "The way he just… placed the controller down. Gently. And walked away.",
    { humor: 78, shock: 60, emotion: 88, drama: 85, informativeness: 15, energy: 40, hookStrength: 75 },
    "quiet",
    TOP5CHAOS_CTA,
    { startSec: 722, endSec: 731 }
  ),
  clip(
    4,
    "Blamed the Cat. It Was Not the Cat. 🐈",
    "The cat was ASLEEP.",
    1012,
    1050,
    77,
    "kept",
    "It knocked the drink over and he blamed the cat. The cat was asleep. On camera.",
    { humor: 94, shock: 55, emotion: 50, drama: 62, informativeness: 12, energy: 70, hookStrength: 72 },
    "cat",
    TOP5CHAOS_CTA,
    { startSec: 1038, endSec: 1047 }
  ),
];

export const PROJECT3_SEO: SeoPack = {
  title: "Top 5 Funniest Rage Quits EVER 😤 #1 Threw a Keyboard",
  description:
    "Counting down the 5 funniest rage quits ever caught live. Number 1 is legendary.\n\nWhich one was your favourite? Vote in the comments 👇\n\n#shorts #top5 #funny #gaming #compilation",
  hashtags: ["#shorts", "#top5", "#ragequit", "#gaming", "#funny"],
  tags: [
    "top 5",
    "rage quits",
    "countdown",
    "funniest moments",
    "gaming fails",
    "compilation",
    "streamer rage",
    "keyboard throw",
  ],
  keywords: ["top 5 rage quits", "funniest rage quit compilation", "streamer meltdown countdown"],
  pinnedComment: "Be honest — which one have YOU done? I'm a number 4 😶",
  communityPost:
    "Rage Quit Vol. 3 is coming 😤 Number 1 threw his keyboard into a POOL. Countdown drops at 5pm — set a reminder!",
};

export const PROJECT3_VIRAL: ViralScore = {
  total: 88,
  breakdown: {
    hook: 89,
    editing: 85,
    pacing: 90,
    seo: 84,
    thumbnail: 87,
    retention: 88,
    topic: 91,
    trending: 90,
    psychology: 86,
  },
  suggestions: [
    "Tease the keyboard-pool clip in the hook with a 0.5s flash — don't show the splash.",
    "Tighten rank #4 to 7 seconds; silent clips hold better short.",
    "Add a drumroll riser into every number card to train the retention loop.",
    "Pin a 'which one have YOU done?' comment within 5 minutes of publishing.",
  ],
};

export const PROJECT3_THUMBS: ThumbnailVariant[] = [
  {
    id: "p3-t1",
    headline: "#1 BROKE IT",
    subtext: "keyboard in the pool",
    emoji: "⌨️",
    bgFrom: "#d946ef",
    bgTo: "#4a044e",
    accentColor: "#facc15",
    style: "bold",
    predictedCtr: 9.3,
  },
  {
    id: "p3-t2",
    headline: "TOP 5 RAGE",
    subtext: "quits of all time",
    emoji: "😤",
    bgFrom: "#c026d3",
    bgTo: "#111827",
    accentColor: "#22d3ee",
    style: "split",
    predictedCtr: 8.2,
  },
  {
    id: "p3-t3",
    headline: "47 SECONDS",
    subtext: "fastest rage quit ever",
    emoji: "⏱️",
    bgFrom: "#a21caf",
    bgTo: "#1e1b4b",
    accentColor: "#f472b6",
    style: "glow",
    predictedCtr: 7.7,
  },
  {
    id: "p3-t4",
    headline: "IT WASN'T THE CAT",
    subtext: "he blamed the cat",
    emoji: "🐈",
    bgFrom: "#86198f",
    bgTo: "#0f0a1e",
    accentColor: "#34d399",
    style: "face",
    predictedCtr: 7.1,
  },
];

// ── Project 4 — WYR "draft" ──────────────────────────────────────────────────

export const PROJECT4_TITLE = "Snack Attack — 5 Food Dilemmas";

export const PROJECT4_CONFIG: WyrConfig = {
  difficulty: "medium",
  theme: "food",
  lengthSec: 30,
  questionCount: 5,
};

// ── Would-You-Rather bank ────────────────────────────────────────────────────

export interface WyrPairSeed {
  theme: string;
  difficulty: WyrDifficulty;
  a: string;
  b: string;
  factoid?: string;
}

export const WYR_BASE_PAIRS: WyrPairSeed[] = [
  // food
  { theme: "food", difficulty: "easy", a: "Give up pizza forever", b: "Give up chocolate forever", factoid: "Pizza wins 61% of food polls." },
  { theme: "food", difficulty: "easy", a: "Only eat sweet food", b: "Only eat savoury food" },
  { theme: "food", difficulty: "easy", a: "Drink a smoothie of your last three meals", b: "Eat plain rice for a week" },
  { theme: "food", difficulty: "medium", a: "Never eat cheese again", b: "Never eat bread again" },
  { theme: "food", difficulty: "medium", a: "Eat a whole ghost pepper", b: "Go a full day with no water" },
  { theme: "food", difficulty: "medium", a: "Have all food taste like cardboard", b: "Have all drinks taste like seawater" },
  { theme: "food", difficulty: "hard", a: "Eat your favourite meal every day forever", b: "Never eat the same meal twice" },
  { theme: "food", difficulty: "hard", a: "Eat a live cricket", b: "Give up takeaways for five years" },
  { theme: "food", difficulty: "impossible", a: "Lose your sense of taste", b: "Only ever taste bitterness" },
  { theme: "food", difficulty: "impossible", a: "Eat one cursed mystery meal a day", b: "Pay £50 a day for normal food" },
  // animals
  { theme: "animals", difficulty: "easy", a: "Have a pet dragon", b: "Have a pet unicorn" },
  { theme: "animals", difficulty: "easy", a: "Be able to talk to dogs", b: "Be able to talk to cats" },
  { theme: "animals", difficulty: "easy", a: "Own ten puppies", b: "Own ten kittens" },
  { theme: "animals", difficulty: "medium", a: "Fight one horse-sized duck", b: "Fight one hundred duck-sized horses", factoid: "The internet's oldest dilemma." },
  { theme: "animals", difficulty: "medium", a: "Find a spider in your car", b: "Find a wasp in your bedroom" },
  { theme: "animals", difficulty: "medium", a: "Run as fast as a cheetah", b: "Swim like a dolphin" },
  { theme: "animals", difficulty: "hard", a: "Understand animals but they roast you", b: "Talk to animals but they always lie" },
  { theme: "animals", difficulty: "hard", a: "Have every dog bark at you on sight", b: "Have every cat hiss at you on sight" },
  { theme: "animals", difficulty: "impossible", a: "Live one year as a housefly", b: "Give up the internet for a year" },
  { theme: "animals", difficulty: "impossible", a: "Release a thousand spiders in your house", b: "Never see a dog again" },
  // money
  { theme: "money", difficulty: "easy", a: "Find £100 on the floor", b: "Be given £200 next month" },
  { theme: "money", difficulty: "easy", a: "Get £1,000 today", b: "Get £10 a day for a year", factoid: "£10 a day is £3,650 — maths beats instinct." },
  { theme: "money", difficulty: "easy", a: "Win a £500 shopping spree", b: "Take £400 in cash" },
  { theme: "money", difficulty: "medium", a: "Earn £100k a year doing a job you hate", b: "Earn £25k doing a job you love" },
  { theme: "money", difficulty: "medium", a: "Lose your wallet once a month", b: "Break your phone once a year" },
  { theme: "money", difficulty: "medium", a: "Take £1m but move abroad forever", b: "Earn an average salary near family" },
  { theme: "money", difficulty: "hard", a: "Be rich but always slightly itchy", b: "Be broke but perfectly comfortable" },
  { theme: "money", difficulty: "hard", a: "Earn £1,000 an hour but age twice as fast at work", b: "Earn minimum wage and age normally" },
  { theme: "money", difficulty: "impossible", a: "Wipe your savings to save a stranger's", b: "Keep yours and never find out what happened" },
  { theme: "money", difficulty: "impossible", a: "Take £10m but your best friend forgets you", b: "Stay broke with your best friend" },
  // superpowers
  { theme: "superpowers", difficulty: "easy", a: "Be able to fly", b: "Be invisible" },
  { theme: "superpowers", difficulty: "easy", a: "Have super strength", b: "Have super speed" },
  { theme: "superpowers", difficulty: "easy", a: "Read minds", b: "See ten minutes into the future" },
  { theme: "superpowers", difficulty: "medium", a: "Teleport anywhere but only once a day", b: "Fly but only at walking speed" },
  { theme: "superpowers", difficulty: "medium", a: "Be invisible only when nobody is looking", b: "Fly but only one metre high" },
  { theme: "superpowers", difficulty: "medium", a: "Control fire", b: "Control water" },
  { theme: "superpowers", difficulty: "hard", a: "Have every power but never tell anyone", b: "Have no powers while everyone thinks you do" },
  { theme: "superpowers", difficulty: "hard", a: "Stop time for ten seconds a day", b: "Rewind time ten seconds once a day" },
  { theme: "superpowers", difficulty: "impossible", a: "Save the world anonymously", b: "Be famous for almost saving it" },
  { theme: "superpowers", difficulty: "impossible", a: "Live forever alone", b: "Live one perfect lifetime" },
  // movies
  { theme: "movies", difficulty: "easy", a: "Live in a superhero movie", b: "Live in an animated movie" },
  { theme: "movies", difficulty: "easy", a: "Watch only comedies forever", b: "Watch only action films forever" },
  { theme: "movies", difficulty: "easy", a: "Be the hero's sidekick", b: "Be the villain everyone loves" },
  { theme: "movies", difficulty: "medium", a: "Know every plot twist in advance", b: "Never understand any ending" },
  { theme: "movies", difficulty: "medium", a: "Survive one horror movie night", b: "Give up films for a year" },
  { theme: "movies", difficulty: "medium", a: "Have your life narrated by a trailer voice", b: "Have a dramatic soundtrack follow you" },
  { theme: "movies", difficulty: "hard", a: "Star in a blockbuster flop", b: "Be an extra in a masterpiece" },
  { theme: "movies", difficulty: "hard", a: "Rewatch one great film forever", b: "Watch endless average new releases" },
  { theme: "movies", difficulty: "impossible", a: "Erase your favourite film from history", b: "Watch it once more, then never again" },
  { theme: "movies", difficulty: "impossible", a: "Live inside a musical", b: "Live inside a mockumentary" },
  // gaming
  { theme: "gaming", difficulty: "easy", a: "Get unlimited free games forever", b: "Get unlimited free snacks while gaming" },
  { theme: "gaming", difficulty: "easy", a: "Play on console forever", b: "Play on PC forever" },
  { theme: "gaming", difficulty: "easy", a: "Have perfect aim", b: "Have perfect map awareness" },
  { theme: "gaming", difficulty: "medium", a: "Lag in every ranked match", b: "Solo queue forever" },
  { theme: "gaming", difficulty: "medium", a: "Win every game but get no loot", b: "Lose every game but get all the loot" },
  { theme: "gaming", difficulty: "medium", a: "Play at 1,000 FPS in 240p", b: "Play in 8K at 24 FPS" },
  { theme: "gaming", difficulty: "hard", a: "Delete your main account", b: "Start every new game at level one forever" },
  { theme: "gaming", difficulty: "hard", a: "Be a pro at a dead game", b: "Be average at the biggest game" },
  { theme: "gaming", difficulty: "impossible", a: "Respawn in real life but lose your memories each time", b: "Have one life and know it" },
  { theme: "gaming", difficulty: "impossible", a: "Live inside your favourite game forever", b: "Never play it again" },
  // sports
  { theme: "sports", difficulty: "easy", a: "Score in a World Cup final", b: "Hit the winning shot in an NBA final" },
  { theme: "sports", difficulty: "easy", a: "Be teammates with your hero", b: "Beat your hero once" },
  { theme: "sports", difficulty: "easy", a: "Get front-row seats forever", b: "Play Sunday league forever" },
  { theme: "sports", difficulty: "medium", a: "Win Olympic gold in a sport nobody watches", b: "Win silver in the 100m final" },
  { theme: "sports", difficulty: "medium", a: "Be the fastest runner who can't swim", b: "Be the best swimmer who's slow on land" },
  { theme: "sports", difficulty: "medium", a: "Never lose at pool", b: "Never lose at darts" },
  { theme: "sports", difficulty: "hard", a: "Captain a losing team", b: "Warm the bench on a winning team" },
  { theme: "sports", difficulty: "hard", a: "Peak for one season then retire", b: "Stay average for fifteen seasons" },
  { theme: "sports", difficulty: "impossible", a: "Miss the penalty that loses the final", b: "Never get picked at all" },
  { theme: "sports", difficulty: "impossible", a: "Have talent without work ethic", b: "Have work ethic without talent" },
  // school
  { theme: "school", difficulty: "easy", a: "Have school start at noon", b: "Have every Friday off" },
  { theme: "school", difficulty: "easy", a: "Skip every Monday", b: "Finish early every day" },
  { theme: "school", difficulty: "easy", a: "Sit next to your best friend all year", b: "Sit at the front and get top grades" },
  { theme: "school", difficulty: "medium", a: "Know every answer but get picked last", b: "Never get picked but stay average" },
  { theme: "school", difficulty: "medium", a: "Forget everything after each exam", b: "Study twice as long but remember forever" },
  { theme: "school", difficulty: "medium", a: "Have your teacher read your search history", b: "Have your parents read your group chat" },
  { theme: "school", difficulty: "hard", a: "Repeat your best school year", b: "Skip straight to graduation" },
  { theme: "school", difficulty: "hard", a: "Get straight A's with no friends", b: "Get average grades with your best mates" },
  { theme: "school", difficulty: "impossible", a: "Have one exam decide everything", b: "Have homework every day for life" },
  { theme: "school", difficulty: "impossible", a: "Broadcast your thoughts in class for a day", b: "Give a surprise speech to the whole school weekly" },
  // travel
  { theme: "travel", difficulty: "easy", a: "Get free flights forever", b: "Get free hotels forever" },
  { theme: "travel", difficulty: "easy", a: "Live an endless summer holiday", b: "Live an endless ski trip" },
  { theme: "travel", difficulty: "easy", a: "Visit ten countries in ten days", b: "Spend ten relaxing weeks in one country" },
  { theme: "travel", difficulty: "medium", a: "Lose your luggage on every trip", b: "Sit in the middle seat forever" },
  { theme: "travel", difficulty: "medium", a: "Speak every language but never travel", b: "Travel anywhere speaking only your own" },
  { theme: "travel", difficulty: "medium", a: "Live out of one backpack", b: "Never leave your home town" },
  { theme: "travel", difficulty: "hard", a: "Explore deep space", b: "Explore the deep ocean" },
  { theme: "travel", difficulty: "hard", a: "Teleport to any city once a month", b: "Fly first class whenever you like" },
  { theme: "travel", difficulty: "impossible", a: "Move to a new country every year forever", b: "Stay in one town forever" },
  { theme: "travel", difficulty: "impossible", a: "See the whole world but never come home", b: "Keep everyone you love but never travel" },
  // luxury
  { theme: "luxury", difficulty: "easy", a: "Own a private jet", b: "Own a superyacht" },
  { theme: "luxury", difficulty: "easy", a: "Have a designer wardrobe", b: "Have your dream car" },
  { theme: "luxury", difficulty: "easy", a: "Live in a city penthouse", b: "Live in a beach villa" },
  { theme: "luxury", difficulty: "medium", a: "Wear a Rolex but drive a rusty car", b: "Drive a supercar with a plastic watch" },
  { theme: "luxury", difficulty: "medium", a: "Have a personal chef", b: "Have a personal driver" },
  { theme: "luxury", difficulty: "medium", a: "Stay in 5-star hotels alone", b: "Stay in hostels with your best friends" },
  { theme: "luxury", difficulty: "hard", a: "Look rich but be broke", b: "Look broke but be rich" },
  { theme: "luxury", difficulty: "hard", a: "Own a mansion you can never leave", b: "Travel forever but never own a home" },
  { theme: "luxury", difficulty: "impossible", a: "Have fame without fortune", b: "Have fortune without fame" },
  { theme: "luxury", difficulty: "impossible", a: "Get everything you want, nothing you earn", b: "Keep everything you earn, nothing extra" },
  // general
  { theme: "general", difficulty: "easy", a: "Always be ten minutes early", b: "Always be ten minutes late" },
  { theme: "general", difficulty: "easy", a: "Never wait in a queue again", b: "Never hit a red light again" },
  { theme: "general", difficulty: "easy", a: "Get free wifi everywhere", b: "Get free coffee everywhere" },
  { theme: "general", difficulty: "medium", a: "Know when anyone lies to you", b: "Get away with every lie you tell" },
  { theme: "general", difficulty: "medium", a: "Restart life with your memories", b: "Skip ten years ahead with none" },
  { theme: "general", difficulty: "medium", a: "Lose all your photos", b: "Lose all your messages" },
  { theme: "general", difficulty: "hard", a: "Know how you die", b: "Know when you die" },
  { theme: "general", difficulty: "hard", a: "Speak every language", b: "Play every instrument" },
  { theme: "general", difficulty: "impossible", a: "Relive your best day forever", b: "Never remember it again" },
  { theme: "general", difficulty: "impossible", a: "Have a perfect memory of everything", b: "Be able to forget anything" },
  // funny
  { theme: "funny", difficulty: "easy", a: "Honk instead of laugh", b: "Moo instead of sneeze" },
  { theme: "funny", difficulty: "easy", a: "Wear clown shoes every day", b: "Wear a cape every day" },
  { theme: "funny", difficulty: "easy", a: "Hiccup through every conversation", b: "Sneeze every time you say your name" },
  { theme: "funny", difficulty: "medium", a: "Only ever whisper", b: "Only ever shout" },
  { theme: "funny", difficulty: "medium", a: "Have your phone read your texts aloud", b: "Have your alarm be your own snoring" },
  { theme: "funny", difficulty: "medium", a: "Dance whenever you hear music", b: "Sing everything you want to say" },
  { theme: "funny", difficulty: "hard", a: "Cry every time you win", b: "Laugh every time you lose" },
  { theme: "funny", difficulty: "hard", a: "Everyone remembers your most embarrassing moment", b: "You remember everyone else's" },
  { theme: "funny", difficulty: "impossible", a: "Be the funniest person nobody laughs at", b: "Be unfunny but everyone laughs" },
  { theme: "funny", difficulty: "impossible", a: "Narrate your own life out loud", b: "Hear a stranger narrate it" },
  // random
  { theme: "random", difficulty: "easy", a: "Have fingers for toes", b: "Have toes for fingers", factoid: "The classic. Nobody escapes it." },
  { theme: "random", difficulty: "easy", a: "Have a personal theme song", b: "Have a personal laugh track" },
  { theme: "random", difficulty: "easy", a: "Smell faintly of onions", b: "Have everything smell faintly of onions" },
  { theme: "random", difficulty: "medium", a: "Sleep four hours and feel fine", b: "Sleep twelve hours and feel amazing" },
  { theme: "random", difficulty: "medium", a: "Always have slightly wet socks", b: "Always have a slightly itchy back" },
  { theme: "random", difficulty: "medium", a: "Be ten percent happier", b: "Be ten percent smarter" },
  { theme: "random", difficulty: "hard", a: "Know every secret about everyone", b: "Have nobody know any of yours" },
  { theme: "random", difficulty: "hard", a: "Live without music", b: "Live without films" },
  { theme: "random", difficulty: "impossible", a: "Pause life for everyone but you", b: "Fast-forward anything but lose that time" },
  { theme: "random", difficulty: "impossible", a: "See ten minutes into the future", b: "See 150 years into the future" },
];

export interface BankQuestion {
  theme: string;
  difficulty: WyrDifficulty;
  optionA: string;
  optionB: string;
  percentA: number;
  factoid: string;
  hash: string;
}

const DIFFICULTY_BUMP: Record<WyrDifficulty, WyrDifficulty> = {
  easy: "medium",
  medium: "hard",
  hard: "impossible",
  impossible: "impossible",
};

/** Suffixes that make grammatical sense appended to both options. */
const WYR_MODIFIERS: { suffix: string; bump: boolean; skipPattern: RegExp }[] = [
  {
    suffix: " — every day for a month",
    bump: true,
    skipPattern: /forever|never|always|every |each day|for a year|a month|instantly|right now|per hour|a day|once/i,
  },
  {
    suffix: " — for an entire year",
    bump: true,
    skipPattern: /forever|never|always|every |each day|for a year|a month|instantly|right now|per hour|a day|once/i,
  },
  {
    suffix: " — starting tomorrow morning",
    bump: false,
    skipPattern: /tomorrow/i,
  },
  {
    suffix: " — and you can never tell anyone why",
    bump: false,
    skipPattern: /never tell/i,
  },
];

/**
 * Deterministic 300-question bank. PROJECT1_QUESTIONS are inserted first (they
 * are the batch consumed by the review project), then all base pairs, then
 * grammar-safe modifier expansions until 300 unique hashes exist.
 */
export function buildWyrBank(): BankQuestion[] {
  const out = new Map<string, BankQuestion>();
  const rand = seededRandom(fnv1a("fable-wyr-bank-v1"));

  const push = (
    theme: string,
    difficulty: WyrDifficulty,
    optionA: string,
    optionB: string,
    factoid?: string,
    percentA?: number
  ): void => {
    const hash = wyrHash(optionA, optionB);
    if (out.has(hash)) return;
    out.set(hash, {
      theme,
      difficulty,
      optionA,
      optionB,
      percentA: percentA ?? 18 + Math.floor(rand() * 65),
      factoid: factoid ?? "",
      hash,
    });
  };

  for (const q of PROJECT1_QUESTIONS) {
    push(q.theme, q.difficulty, q.optionA, q.optionB, q.factoid, q.percentA);
  }
  for (const p of WYR_BASE_PAIRS) push(p.theme, p.difficulty, p.a, p.b, p.factoid);
  for (const mod of WYR_MODIFIERS) {
    for (const p of WYR_BASE_PAIRS) {
      if (out.size >= 300) break;
      if (mod.skipPattern.test(`${p.a} ${p.b}`)) continue;
      push(
        p.theme,
        mod.bump ? DIFFICULTY_BUMP[p.difficulty] : p.difficulty,
        `${p.a}${mod.suffix}`,
        `${p.b}${mod.suffix}`
      );
    }
  }
  return [...out.values()].slice(0, 300);
}

// ── Templates ────────────────────────────────────────────────────────────────

export interface TemplateSeed {
  name: string;
  kind: "wyr" | "clips" | "top5" | "caption" | "thumbnail";
  description: string;
  accent: string;
  config: Record<string, unknown>;
}

export const TEMPLATE_SEEDS: TemplateSeed[] = [
  {
    name: "Neon Quiz",
    kind: "wyr",
    description: "Electric split-screen with a neon timer bar and confetti reveals.",
    accent: "#8b5cf6",
    config: {
      font: "Poppins",
      primaryColor: "#8b5cf6",
      secondaryColor: "#22d3ee",
      timerStyle: "neon-bar",
      revealAnimation: "confetti",
      background: "animated-gradient",
      optionLayout: "split-vertical",
    },
  },
  {
    name: "Clean Minimal",
    kind: "caption",
    description: "Lower-third captions with no stroke — lets the footage breathe.",
    accent: "#e2e8f0",
    config: {
      style: "minimal",
      font: "Inter",
      uppercase: false,
      strokeWidth: 0,
      position: "bottom-third",
      wordHighlight: "#8b5cf6",
    },
  },
  {
    name: "Chaos Mode",
    kind: "clips",
    description: "Max-energy clip edits: heavy zooms, meme overlays, dense SFX.",
    accent: "#f43f5e",
    config: {
      captionStyle: "beast",
      zoomIntensity: "high",
      memeOverlays: true,
      sfxDensity: "high",
      transition: "whip-pan",
      saturationBoost: 1.2,
    },
  },
  {
    name: "Countdown Classic",
    kind: "top5",
    description: "Gold 3D number cards with drumroll risers and an orchestral sting.",
    accent: "#f59e0b",
    config: {
      numberStyle: "gold-3d",
      drumroll: true,
      revealSting: "orchestral-hit",
      rankBadge: "corner-left",
      font: "Bebas Neue",
    },
  },
  {
    name: "Beast Captions",
    kind: "caption",
    description: "Huge bouncing uppercase captions with a thick stroke and yellow emphasis.",
    accent: "#facc15",
    config: {
      style: "beast",
      uppercase: true,
      strokeWidth: 6,
      bounce: true,
      emphasisColor: "#facc15",
      font: "Montserrat ExtraBold",
    },
  },
  {
    name: "Midnight Glass",
    kind: "thumbnail",
    description: "Dark glassmorphism thumbnail with a soft glow headline.",
    accent: "#6366f1",
    config: {
      style: "glow",
      bgFrom: "#312e81",
      bgTo: "#0f0a1e",
      vignette: true,
      headlineFont: "Poppins ExtraBold",
      emojiScale: 1.4,
    },
  },
  {
    name: "Split Decision",
    kind: "wyr",
    description: "Diagonal A/B arena with a shrinking-ring timer and percent flips.",
    accent: "#d946ef",
    config: {
      font: "Montserrat",
      optionLayout: "diagonal-split",
      timerStyle: "shrinking-ring",
      revealAnimation: "percent-flip",
      background: "vs-arena",
    },
  },
  {
    name: "Karaoke Pop",
    kind: "caption",
    description: "Word-by-word karaoke highlight captions, centred with a scale pop.",
    accent: "#22d3ee",
    config: {
      style: "karaoke",
      wordByWord: true,
      highlightColor: "#22d3ee",
      font: "Nunito Black",
      position: "center",
      scalePop: 1.15,
    },
  },
];

// ── Notifications ────────────────────────────────────────────────────────────

export interface NotificationSeed {
  kind: string;
  title: string;
  body: string;
  read: boolean;
  hoursAgo: number;
}

export const NOTIFICATION_SEEDS: NotificationSeed[] = [
  {
    kind: "render.done",
    title: "Render complete: Bounty Stream — Best Moments",
    body: "5 clips rendered and ready to schedule.",
    read: false,
    hoursAgo: 1,
  },
  {
    kind: "trend",
    title: "Trending format: 'Impossible Questions'",
    body: "Momentum +38% this week — a perfect fit for Brain Battles.",
    read: false,
    hoursAgo: 3,
  },
  {
    kind: "upload.done",
    title: "Published: Would You Rather LOSE £10,000 or EAT This? 🤯",
    body: "Live on Brain Battles. First-hour views tracking 2.1x channel average.",
    read: true,
    hoursAgo: 26,
  },
  {
    kind: "system",
    title: "Auto-scheduler filled 2 slots for Brain Battles",
    body: "Next uploads: tomorrow 09:00 and 13:00.",
    read: true,
    hoursAgo: 30,
  },
  {
    kind: "billing",
    title: "Studio plan renews in 21 days",
    body: "£59/mo · 3 channels · 240 videos. Manage from Billing.",
    read: true,
    hoursAgo: 74,
  },
];

// ── Asset literals ───────────────────────────────────────────────────────────

export interface LogoSeed {
  file: string;
  name: string;
  svg: string;
}

function logoSvg(initials: string, from: string, to: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${from}"/>
      <stop offset="1" stop-color="${to}"/>
    </linearGradient>
  </defs>
  <rect width="256" height="256" rx="56" fill="#0f0a1e"/>
  <circle cx="128" cy="128" r="88" fill="url(#g)" opacity="0.92"/>
  <text x="128" y="152" font-family="Arial, Helvetica, sans-serif" font-size="72" font-weight="700" text-anchor="middle" fill="#ffffff">${initials}</text>
</svg>
`;
}

export const LOGO_SEEDS: LogoSeed[] = [
  { file: "brain-battles-logo.svg", name: "Brain Battles Logo", svg: logoSvg("BB", "#8b5cf6", "#22d3ee") },
  { file: "streamgold-logo.svg", name: "StreamGold Logo", svg: logoSvg("SG", "#a855f7", "#f59e0b") },
  { file: "top5chaos-logo.svg", name: "Top5Chaos Logo", svg: logoSvg("T5", "#d946ef", "#facc15") },
];

/** Classic 43-byte transparent 1×1 GIF89a. */
export const GIF_1PX_BASE64 = "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
