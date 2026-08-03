import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const CHANNEL_TYPE_META: Record<
  string,
  { label: string; emoji: string; gradient: string }
> = {
  wyr: { label: "Would You Rather", emoji: "🤔", gradient: "from-violet-500 to-fuchsia-500" },
  clips: { label: "AI Clips", emoji: "✂️", gradient: "from-purple-500 to-indigo-500" },
  top5: { label: "Top 5 Funniest", emoji: "🏆", gradient: "from-fuchsia-500 to-pink-500" },
};

export const STATUS_COLORS: Record<string, string> = {
  draft: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30",
  generating: "bg-violet-500/15 text-violet-300 border-violet-500/30",
  review: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  rendering: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  ready: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  approved: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  scheduled: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  queued: "bg-violet-500/15 text-violet-300 border-violet-500/30",
  uploading: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  uploaded: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  published: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  failed: "bg-red-500/15 text-red-300 border-red-500/30",
  cancelled: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
  candidate: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30",
  kept: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  discarded: "bg-red-500/15 text-red-400 border-red-500/30",
};

export function scoreColor(score: number): string {
  if (score >= 80) return "text-emerald-400";
  if (score >= 60) return "text-lime-400";
  if (score >= 40) return "text-amber-400";
  return "text-red-400";
}
