"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ArrowRight, Clock3, MousePointerClick, Sparkles } from "lucide-react";
import { EASE_OUT, staggerDelay } from "@/lib/motion";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

interface BestTime {
  day: number; // 0=Sun .. 6=Sat
  hour: number; // 0-23
  score: number; // 0-100
}

interface SuggestionsResponse {
  bestTimes: BestTime[];
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function formatHour(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

/** AI best-time-to-post chips for a single channel (from /schedule/suggestions). */
export function BestTimes({ channelId }: { channelId: string | null }) {
  const { data, isLoading } = useQuery({
    queryKey: ["schedule", "suggestions", channelId],
    queryFn: () =>
      api.get<SuggestionsResponse>(`/schedule/suggestions?channelId=${channelId ?? ""}`),
    enabled: channelId !== null,
  });

  const times = data?.bestTimes ?? [];

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.04 }}
      className="glass flex h-full flex-col rounded-2xl p-5"
    >
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="flex items-center gap-1.5 font-display text-sm font-semibold tracking-tight">
            <Clock3 className="h-4 w-4 text-violet-400" /> Best times to post
          </h2>
          <p className="text-xs text-muted-foreground">Ranked from your posting heatmap</p>
        </div>
        <Link
          href="/schedule"
          className="flex items-center gap-1 text-xs font-medium text-primary transition-colors hover:text-accent-foreground"
        >
          Schedule <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {channelId === null && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-8 text-center">
          <MousePointerClick className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm font-medium text-muted-foreground">Pick a channel</p>
          <p className="max-w-[230px] text-xs text-muted-foreground/70">
            Select a single channel above to unlock its AI-suggested posting windows.
          </p>
        </div>
      )}

      {channelId !== null && isLoading && (
        <div className="space-y-2.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-11 rounded-xl" />
          ))}
        </div>
      )}

      {channelId !== null && !isLoading && times.length === 0 && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-8 text-center">
          <Clock3 className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm font-medium text-muted-foreground">Not enough data yet</p>
          <p className="max-w-[230px] text-xs text-muted-foreground/70">
            Publish a few Shorts on this channel and suggestions will appear here.
          </p>
        </div>
      )}

      {channelId !== null && !isLoading && times.length > 0 && (
        <ul className="space-y-2">
          {times.map((t, i) => {
            const top = i === 0;
            return (
              <motion.li
                key={`${t.day}-${t.hour}`}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: i * 0.04 }}
                className={cn(
                  "flex items-center gap-3 rounded-xl border px-3 py-2.5",
                  top
                    ? "border-primary/40 bg-primary/10"
                    : "border-border/60 bg-secondary/30",
                )}
              >
                <span
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold tabular-nums",
                    top
                      ? "gradient-primary text-white"
                      : "border border-border/70 bg-secondary/60 text-muted-foreground",
                  )}
                >
                  {top ? <Sparkles className="h-3 w-3" /> : i + 1}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium">
                    {DAY_NAMES[t.day] ?? "Day"}{" "}
                    <span className="tabular-nums text-muted-foreground">
                      · {formatHour(t.hour)}
                    </span>
                  </p>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-secondary">
                    <motion.div
                      className="h-full w-full origin-left rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500"
                      initial={{ transform: "scaleX(0)" }}
                      animate={{
                        transform: `scaleX(${Math.min(100, Math.max(0, t.score)) / 100})`,
                      }}
                      transition={{ duration: 0.35, ease: EASE_OUT, delay: staggerDelay(i) }}
                    />
                  </div>
                </div>

                <span
                  className={cn(
                    "shrink-0 text-sm font-bold tabular-nums",
                    top ? "text-fuchsia-300" : "text-violet-300",
                  )}
                >
                  {Math.round(t.score)}
                </span>
              </motion.li>
            );
          })}
        </ul>
      )}
    </motion.section>
  );
}
