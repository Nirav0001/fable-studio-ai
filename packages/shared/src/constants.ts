import type { PlanTier, WyrDifficulty } from "./types";

export const CHANNEL_TYPES = [
  { value: "wyr", label: "Would You Rather", tagline: "AI-generated interactive question Shorts" },
  { value: "clips", label: "AI Clip Generator", tagline: "Auto-clip long videos into viral Shorts" },
  { value: "top5", label: "Top 5 Funniest", tagline: "Countdown compilations of the best moments" },
] as const;

export const WYR_THEMES = [
  "food",
  "animals",
  "money",
  "superpowers",
  "movies",
  "gaming",
  "sports",
  "school",
  "travel",
  "luxury",
  "general",
  "funny",
  "random",
] as const;

export const WYR_DIFFICULTIES: WyrDifficulty[] = ["easy", "medium", "hard", "impossible"];

export const SHORT_LENGTHS = [15, 20, 30, 45, 60] as const;

export const CLIP_COUNTS = [5, 10, 20] as const;

export const PROJECT_STATUSES = ["draft", "generating", "review", "rendering", "ready", "failed"] as const;
export const VIDEO_STATUSES = ["draft", "rendering", "ready", "scheduled", "uploading", "published", "failed"] as const;
export const SLOT_STATUSES = ["scheduled", "queued", "uploading", "uploaded", "failed", "cancelled"] as const;

export const CAPTION_STYLES = ["beast", "clean", "karaoke", "comic", "minimal"] as const;

// The id's first segment IS the provider voice name (see openaiVoice() in
// services/media/voiceover.ts) — keep that prefix accurate when editing.
export const VOICE_PRESETS = [
  { id: "onyx-uk", label: "Onyx — deep, authoritative", provider: "openai", gender: "male", accent: "british" },
  { id: "nova-us", label: "Nova — bright, upbeat", provider: "openai", gender: "female", accent: "american" },
  { id: "echo-us", label: "Echo — calm, measured", provider: "openai", gender: "male", accent: "american" },
  { id: "fable-uk", label: "Fable — warm storyteller", provider: "openai", gender: "male", accent: "british" },
  { id: "shimmer-us", label: "Shimmer — light, friendly", provider: "openai", gender: "female", accent: "american" },
  { id: "alloy-us", label: "Alloy — neutral, clear", provider: "openai", gender: "male", accent: "american" },
  { id: "ash-us", label: "Ash — punchy, confident", provider: "openai", gender: "male", accent: "american" },
  { id: "sage-us", label: "Sage — smooth, relaxed", provider: "openai", gender: "female", accent: "american" },
  { id: "coral-us", label: "Coral — expressive, lively", provider: "openai", gender: "female", accent: "american" },
  { id: "ballad-uk", label: "Ballad — soft, emotive", provider: "openai", gender: "male", accent: "british" },
  { id: "aria-uk", label: "Aria — UK Female, warm", provider: "elevenlabs", gender: "female", accent: "british" },
  { id: "blitz-au", label: "Blitz — AU Male, hyper", provider: "elevenlabs", gender: "male", accent: "australian" },
] as const;

export const PLANS: Record<
  PlanTier,
  {
    name: string;
    priceGbp: number;
    channels: number;
    videosPerMonth: number;
    aiCreditsK: number;
    features: string[];
  }
> = {
  starter: {
    name: "Starter",
    priceGbp: 29,
    channels: 1,
    videosPerMonth: 60,
    aiCreditsK: 250,
    features: ["1 channel", "60 videos/mo", "AI SEO pack", "Auto-scheduling", "Email support"],
  },
  studio: {
    name: "Studio",
    priceGbp: 59,
    channels: 3,
    videosPerMonth: 240,
    aiCreditsK: 1000,
    features: [
      "3 channels",
      "240 videos/mo",
      "Viral score + A/B testing",
      "Trend discovery",
      "Full automation pilot",
      "Priority render queue",
    ],
  },
  agency: {
    name: "Agency",
    priceGbp: 99,
    channels: 10,
    videosPerMonth: 1000,
    aiCreditsK: 5000,
    features: [
      "10 channels",
      "Unlimited videos",
      "Team seats & approvals",
      "API + webhooks",
      "Cross-posting (TikTok/Reels)",
      "Dedicated support",
    ],
  },
};

/** Rough per-unit costs used by the cost estimator (GBP). */
export const COST_RATES = {
  llmPer1kTokensGbp: 0.008,
  ttsPer1kCharsGbp: 0.012,
  renderPerMinuteGbp: 0.05,
  whisperPerMinuteGbp: 0.0048,
};

export const DEFAULT_WEEKLY_SCHEDULE: Record<string, string[]> = {
  "1": ["09:00", "13:00", "18:00"],
  "2": ["09:00", "13:00", "18:00"],
  "3": ["09:00", "13:00", "18:00"],
  "4": ["09:00", "13:00", "18:00"],
  "5": ["09:00", "13:00", "18:00"],
  "6": ["10:00", "15:00", "19:00"],
  "0": ["10:00", "15:00", "19:00"],
};

export const QUEUE_JOBS = {
  PROJECT_GENERATE: "project.generate",
  PROJECT_RENDER: "project.render",
  VIDEO_UPLOAD: "video.upload",
  ANALYTICS_SYNC: "analytics.sync",
  AUTOMATION_TICK: "automation.tick",
} as const;

export const DEMO_USER = {
  email: "demo@fablestudio.ai",
  password: "fable-demo-2026",
  name: "Demo Founder",
};
