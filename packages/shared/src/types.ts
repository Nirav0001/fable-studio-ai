// ── Domain types shared between web, api and video ───────────────────────────

export type ChannelType = "wyr" | "clips" | "top5";

export type ProjectStatus =
  | "draft"
  | "generating"
  | "review"
  | "rendering"
  | "ready"
  | "failed";

export type VideoStatus =
  | "draft"
  | "rendering"
  | "ready"
  | "scheduled"
  | "uploading"
  | "published"
  | "failed";

export type SlotStatus =
  | "scheduled"
  | "queued"
  | "uploading"
  | "uploaded"
  | "failed"
  | "cancelled";

export type ClipStatus = "candidate" | "kept" | "discarded";

export type PlanTier = "starter" | "studio" | "agency";

export type AssetKind =
  | "video"
  | "music"
  | "sfx"
  | "gif"
  | "logo"
  | "font"
  | "voiceover"
  | "thumbnail";

export type WyrDifficulty = "easy" | "medium" | "hard" | "impossible";

export type AiProviderName = "openai" | "anthropic" | "gemini" | "mock";

export interface Branding {
  primaryColor: string;
  secondaryColor: string;
  font: string;
  logoAssetId?: string;
  watermarkText: string;
  introText: string;
  outroText: string;
  cta: string;
  voice: VoiceConfig;
  musicStyle: string;
}

export interface VoiceConfig {
  provider: "openai" | "elevenlabs" | "google" | "microsoft" | "mock";
  voiceId: string;
  gender: "male" | "female";
  accent: string;
  energy: "calm" | "medium" | "high" | "hyper";
  emotion: "neutral" | "excited" | "dramatic" | "funny";
  /**
   * "fixed" (default) always narrates with voiceId. "random" picks a different
   * voice per video, seeded by project id so a given video always re-renders
   * with the same voice.
   */
  mode?: "fixed" | "random";
}

export interface UploadDefaults {
  visibility: "public" | "unlisted" | "private";
  category: string;
  madeForKids: boolean;
  notifySubscribers: boolean;
  language: string;
}

/** Weekly schedule: day (0=Sun..6=Sat) -> list of "HH:mm" times */
export type WeeklySchedule = Record<string, string[]>;

export interface WyrConfig {
  difficulty: WyrDifficulty;
  theme: string;
  lengthSec: 15 | 20 | 30 | 45 | 60;
  questionCount: number;
}

export interface WyrQuestionT {
  id?: string;
  theme: string;
  difficulty: WyrDifficulty;
  optionA: string;
  optionB: string;
  /** % of viewers who pick option A (for the reveal) */
  percentA: number;
  factoid?: string;
}

export interface ClipsConfig {
  sourceUrl: string;
  clipCount: 5 | 10 | 20;
  minScore: number;
  captionStyle: string;
  addMemes: boolean;
}

export interface Top5Config {
  sourceUrl: string;
  countdownFrom: number;
  captionStyle: string;
}

export interface SceneT {
  index: number;
  kind: "hook" | "question" | "reveal" | "clip" | "number" | "transition" | "cta";
  startSec: number;
  durationSec: number;
  text?: string;
  question?: WyrQuestionT;
  clipRef?: { startSec: number; endSec: number; label?: string };
  effects: string[];
  sfx?: string;
}

export interface ScriptPlan {
  scenes: SceneT[];
  totalDurationSec: number;
  voiceoverLines: { atSec: number; text: string }[];
  musicStyle: string;
  pacingNotes?: string;
}

export interface SeoPack {
  title: string;
  description: string;
  hashtags: string[];
  tags: string[];
  keywords: string[];
  pinnedComment: string;
  communityPost: string;
}

export interface TitleIdea {
  title: string;
  score: number;
  reasons: string[];
}

export interface ThumbnailVariant {
  id: string;
  headline: string;
  subtext?: string;
  emoji: string;
  bgFrom: string;
  bgTo: string;
  accentColor: string;
  style: "bold" | "glow" | "arrow" | "face" | "split";
  predictedCtr: number;
  imagePath?: string;
}

export interface ViralScore {
  total: number;
  breakdown: {
    hook: number;
    editing: number;
    pacing: number;
    seo: number;
    thumbnail: number;
    retention: number;
    topic: number;
    trending: number;
    psychology: number;
  };
  suggestions: string[];
}

export interface ScoreBreakdown {
  humor: number;
  shock: number;
  emotion: number;
  drama: number;
  informativeness: number;
  energy: number;
  hookStrength: number;
}

/** One spoken word with its own timing — what karaoke captions need. */
export interface TranscriptWord {
  startSec: number;
  endSec: number;
  text: string;
}

export interface TranscriptSegment {
  startSec: number;
  endSec: number;
  text: string;
  speaker?: string;
  markers?: string[]; // "laughter", "shouting", "silence", "music"
  /**
   * Per-word timings when the source provides them (YouTube json3 caption
   * tracks carry them; Whisper can too). Optional — older transcripts stored
   * before this existed simply omit it and captions fall back to spreading a
   * segment's words evenly, which visibly drifts from the speech.
   */
  words?: TranscriptWord[];
}

export interface EditPlan {
  reframe: { mode: "face-track" | "speaker-track" | "center"; };
  zooms: { atSec: number; scale: number; durationSec: number }[];
  captions: { style: string; animated: boolean };
  overlays: { atSec: number; kind: "gif" | "meme" | "sticker" | "graphic"; label: string }[];
  sfx: { atSec: number; name: string }[];
  hookText: string;
  ctaText: string;
}

export interface CostEstimate {
  llmTokens: number;
  llmCostGbp: number;
  ttsChars: number;
  ttsCostGbp: number;
  renderMinutes: number;
  renderCostGbp: number;
  totalGbp: number;
}

export interface AnalyticsOverviewT {
  today: {
    uploads: number;
    scheduled: number;
    views: number;
    subsGained: number;
    revenueGbp: number;
    ctr: number;
    avgViewSec: number;
    retention: number;
  };
  deltas: Record<string, number>;
  sparklines: Record<string, number[]>;
  latestUploads: VideoSummary[];
  upcomingUploads: UpcomingSlot[];
  processingQueue: JobSummary[];
  channels: ChannelSummary[];
}

export interface ChannelSummary {
  id: string;
  name: string;
  handle: string;
  type: ChannelType;
  avatarColor: string;
  connected: boolean;
  subscriberCount: number;
  viewsToday: number;
  videosReady: number;
}

export interface VideoSummary {
  id: string;
  channelId: string;
  channelName?: string;
  title: string;
  status: VideoStatus;
  viralScore: number;
  durationSec: number;
  thumbnailPath?: string | null;
  youtubeId?: string | null;
  publishedAt?: string | null;
  views?: number;
  createdAt: string;
  /** True when the media file was pruned; the row is kept but cannot publish. */
  mediaExpired?: boolean;
}

export interface UpcomingSlot {
  id: string;
  channelId: string;
  channelName?: string;
  scheduledAt: string;
  status: SlotStatus;
  video?: VideoSummary | null;
}

export interface JobSummary {
  id: string;
  queue: string;
  name: string;
  refType: string;
  refId: string;
  status: string;
  progress: number;
  message: string;
  createdAt: string;
}

export interface HeatmapCell {
  day: number; // 0-6
  hour: number; // 0-23
  value: number; // 0-100 relative performance
}

export interface HealthReport {
  ok: boolean;
  version: string;
  db: boolean;
  queueDriver: "bullmq" | "memory";
  ffmpeg: boolean;
  ytdlp: boolean;
  aiProvider: AiProviderName;
  providers: { openai: boolean; anthropic: boolean; gemini: boolean; elevenlabs: boolean };
  youtube: boolean;
  stripe: boolean;
  storage: "r2" | "local";
}

export interface NotificationT {
  id: string;
  kind: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
}

export interface TrendItem {
  topic: string;
  format: string;
  momentum: number; // 0-100
  why: string;
  suggestedHook: string;
  sound?: string;
}

export interface ApiEnvelopeOk<T> {
  ok: true;
  data: T;
}
export interface ApiEnvelopeErr {
  ok: false;
  error: { code: string; message: string; details?: unknown };
}
export type ApiEnvelope<T> = ApiEnvelopeOk<T> | ApiEnvelopeErr;
