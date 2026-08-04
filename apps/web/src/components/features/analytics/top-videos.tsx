"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Eye, Film, TrendingDown, TrendingUp } from "lucide-react";
import type { VideoSummary } from "@fable/shared";
import { fnv1a, formatCompact, formatDuration, seededRandom } from "@fable/shared";
import { EASE_OUT } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { ScoreDial } from "@/components/widgets/score-dial";
import { RetentionCurve } from "@/components/charts/retention-curve";
import { EmptyState } from "@/components/widgets/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

export type RankedVideo = VideoSummary & { views: number };

/**
 * Deterministic per-video retention curve (no API field for this — derived
 * from the video id + viral score so it is stable across refreshes).
 */
function retentionPoints(video: RankedVideo): { pct: number; value: number }[] {
  const rand = seededRandom(fnv1a(video.id));
  const endValue = 18 + (video.viralScore / 100) * 45 + rand() * 10;
  const droop = 1.1 + rand() * 0.9;
  const points: { pct: number; value: number }[] = [];
  for (let pct = 0; pct <= 100; pct += 5) {
    const base = endValue + (100 - endValue) * Math.pow(1 - pct / 100, droop);
    const wiggle = pct === 0 ? 0 : (rand() - 0.5) * 4;
    // Shorts often get a loop-rewatch bump right at the end.
    const loopBump = pct >= 90 ? (pct - 90) * 0.3 * rand() : 0;
    points.push({
      pct,
      value: Math.round(Math.min(100, Math.max(4, base + wiggle + loopBump)) * 10) / 10,
    });
  }
  return points;
}

interface TopVideosProps {
  tone: "best" | "worst";
  videos?: RankedVideo[];
  loading: boolean;
}

export function TopVideos({ tone, videos, loading }: TopVideosProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const best = tone === "best";
  const Icon = best ? TrendingUp : TrendingDown;

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: best ? 0 : 0.04 }}
      className="glass rounded-2xl p-5"
    >
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="flex items-center gap-1.5 font-display text-sm font-semibold tracking-tight">
            <Icon className={cn("h-4 w-4", best ? "text-emerald-400" : "text-red-400")} />
            {best ? "Best performers" : "Underperformers"}
          </h2>
          <p className="text-xs text-muted-foreground">
            {best
              ? "Your top Shorts in this range — tap a row for retention"
              : "Weakest Shorts in this range — learn what to avoid"}
          </p>
        </div>
      </div>

      {loading && (
        <div className="space-y-2.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-[58px] rounded-xl" />
          ))}
        </div>
      )}

      {!loading && (videos ?? []).length === 0 && (
        <EmptyState
          icon={Film}
          title="No published videos yet"
          body="Once videos go live, their rankings land here automatically."
        />
      )}

      {!loading && (videos ?? []).length > 0 && (
        <ul className="space-y-2">
          {(videos ?? []).map((video, i) => {
            const expanded = expandedId === video.id;
            return (
              <motion.li
                key={video.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: i * 0.04 }}
                className={cn(
                  "overflow-hidden rounded-xl border bg-secondary/30 transition-colors",
                  expanded ? "border-primary/40" : "border-border/60 hover:border-primary/30",
                )}
              >
                <button
                  onClick={() => setExpandedId(expanded ? null : video.id)}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
                  aria-expanded={expanded}
                  aria-label={`${video.title} — toggle retention curve`}
                >
                  <span
                    className={cn(
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold tabular-nums",
                      best
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                        : "border-red-500/30 bg-red-500/10 text-red-300",
                    )}
                  >
                    {i + 1}
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium" title={video.title}>
                      {video.title}
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {video.channelName ?? "Channel"} · {formatDuration(video.durationSec)}
                    </p>
                  </div>

                  <span className="flex shrink-0 items-center gap-1 text-xs tabular-nums text-muted-foreground">
                    <Eye className="h-3.5 w-3.5" />
                    {formatCompact(video.views)}
                  </span>

                  <div className="shrink-0">
                    <ScoreDial score={video.viralScore} size={38} />
                  </div>

                  <ChevronDown
                    className={cn(
                      "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
                      expanded && "rotate-180 text-primary",
                    )}
                  />
                </button>

                <AnimatePresence initial={false}>
                  {expanded && (
                    <motion.div
                      className="grid"
                      initial={{ gridTemplateRows: "0fr", opacity: 0 }}
                      animate={{ gridTemplateRows: "1fr", opacity: 1 }}
                      exit={{ gridTemplateRows: "0fr", opacity: 0 }}
                      transition={{ duration: 0.25, ease: EASE_OUT }}
                    >
                      <div className="min-h-0 overflow-hidden">
                        <div className="border-t border-border/60 px-3 pb-3 pt-2.5">
                          <div className="mb-1.5 flex items-center justify-between">
                            <p className="text-[11px] font-medium text-muted-foreground">
                              Audience retention
                            </p>
                            <p className="text-[10px] text-muted-foreground/70">
                              % still watching vs video position
                            </p>
                          </div>
                          <RetentionCurve points={retentionPoints(video)} />
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.li>
            );
          })}
        </ul>
      )}
    </motion.section>
  );
}
