import type {
  ChannelType,
  ClipsConfig,
  CostEstimate,
  ProjectStatus,
  ScoreBreakdown,
  ScriptPlan,
  SeoPack,
  ThumbnailVariant,
  Top5Config,
  TranscriptSegment,
  ViralScore,
  WyrConfig,
} from "@fable/shared";

/** Clip row as returned inside GET /projects/:id. */
export interface ClipT {
  id: string;
  index: number;
  title: string;
  hook: string;
  startSec: number;
  endSec: number;
  score: number;
  status: string; // candidate | kept | discarded
  transcript: string;
  breakdown?: Partial<ScoreBreakdown> | null;
}

/** Item shape from GET /projects (list endpoint). */
export interface ProjectListItem {
  id: string;
  channelId: string;
  channelName?: string;
  type: ChannelType;
  title: string;
  status: ProjectStatus;
  stage?: string;
  progress?: number;
  viralScore?: number;
  clipCount?: number;
  sourceUrl?: string | null;
  error?: string | null;
  createdAt: string;
}

export interface ProjectVideoRef {
  id: string;
  title: string;
  status: string;
}

/** Union of the three per-type configs (JSON column, so treat every field as optional). */
export type AnyProjectConfig = Partial<WyrConfig> & Partial<ClipsConfig> & Partial<Top5Config>;

/** Full parsed shape from GET /projects/:id. */
export interface ProjectDetail {
  id: string;
  channelId: string;
  channelName?: string;
  channelType?: ChannelType;
  type: ChannelType;
  title: string;
  status: ProjectStatus;
  stage?: string;
  progress?: number;
  error?: string | null;
  sourceUrl?: string | null;
  config?: AnyProjectConfig | null;
  script?: Partial<ScriptPlan> | null;
  seo?: Partial<SeoPack> | null;
  thumbnails?: ThumbnailVariant[] | null;
  viral?: Partial<ViralScore> | null;
  cost?: Partial<CostEstimate> | null;
  transcript?: TranscriptSegment[] | null;
  clips?: ClipT[] | null;
  videos?: ProjectVideoRef[] | null;
  createdAt: string;
  updatedAt?: string;
}

/** Emoji tile per Would-You-Rather theme (matches WYR_THEMES from @fable/shared). */
export const THEME_EMOJI: Record<string, string> = {
  food: "🍕",
  animals: "🐾",
  money: "💰",
  superpowers: "🦸",
  movies: "🎬",
  gaming: "🎮",
  sports: "⚽",
  school: "🎒",
  travel: "✈️",
  luxury: "💎",
  general: "🧠",
  funny: "😂",
  random: "🎲",
};

export const DIFFICULTY_LABELS: Record<string, string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
  impossible: "Impossible",
};

export const CAPTION_STYLE_LABELS: Record<string, string> = {
  beast: "Beast — huge bold pop-ins",
  clean: "Clean — crisp white",
  karaoke: "Karaoke — word-by-word highlight",
  comic: "Comic — bubbly + playful",
  minimal: "Minimal — subtle lower third",
};

export function isProjectBusy(status: string): boolean {
  return status === "generating" || status === "rendering";
}

export function hasViralScore(viral: Partial<ViralScore> | null | undefined): viral is ViralScore {
  return Boolean(viral && typeof viral.total === "number" && viral.total > 0 && viral.breakdown);
}

export function hasScript(script: Partial<ScriptPlan> | null | undefined): script is ScriptPlan {
  return Boolean(script && Array.isArray(script.scenes) && script.scenes.length > 0);
}

export function hasSeo(seo: Partial<SeoPack> | null | undefined): seo is SeoPack {
  return Boolean(seo && typeof seo.title === "string" && seo.title.length > 0);
}

export function hasCost(cost: Partial<CostEstimate> | null | undefined): cost is CostEstimate {
  return Boolean(cost && typeof cost.totalGbp === "number");
}

export function isValidHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}
