"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Check, Copy, Flame } from "lucide-react";
import { toast } from "sonner";
import type { TrendItem } from "@fable/shared";
import { EASE_OUT, staggerDelay } from "@/lib/motion";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

function momentumColor(momentum: number): string {
  if (momentum >= 80) return "text-fuchsia-300";
  if (momentum >= 60) return "text-violet-300";
  return "text-muted-foreground";
}

export function TrendsPanel() {
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const { data: trends, isLoading } = useQuery({
    queryKey: ["ai", "trends"],
    queryFn: () => api.get<TrendItem[]>("/ai/trends"),
    staleTime: 5 * 60_000,
  });

  const copyHook = async (hook: string, idx: number) => {
    try {
      await navigator.clipboard.writeText(hook);
      setCopiedIdx(idx);
      toast.success("Hook copied to clipboard");
      window.setTimeout(() => setCopiedIdx((cur) => (cur === idx ? null : cur)), 1600);
    } catch {
      toast.error("Couldn't access the clipboard");
    }
  };

  return (
    <section className="glass rounded-2xl p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="flex items-center gap-1.5 font-display text-sm font-semibold tracking-tight">
            <Flame className="h-4 w-4 text-fuchsia-400" /> Trending now
          </h2>
          <p className="text-xs text-muted-foreground">
            AI-spotted formats gaining momentum this week
          </p>
        </div>
      </div>

      {isLoading && (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[110px] rounded-xl" />
          ))}
        </div>
      )}

      {!isLoading && (trends ?? []).length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No trend data right now — check back soon.
        </p>
      )}

      {!isLoading && (trends ?? []).length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {(trends ?? []).map((trend, i) => (
            <motion.div
              key={`${trend.topic}-${i}`}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.04 }}
              className="glass-hover flex flex-col rounded-xl border border-border/60 bg-secondary/30 p-3.5"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold" title={trend.topic}>
                    {trend.topic}
                  </p>
                  <span className="mt-0.5 inline-block rounded-full border border-border/70 bg-secondary/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {trend.format}
                  </span>
                </div>
                <span
                  className={cn(
                    "shrink-0 text-sm font-bold tabular-nums",
                    momentumColor(trend.momentum),
                  )}
                >
                  {trend.momentum}
                </span>
              </div>

              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
                <motion.div
                  className="h-full w-full origin-left rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500"
                  initial={{ transform: "scaleX(0)" }}
                  animate={{
                    transform: `scaleX(${Math.min(100, Math.max(0, trend.momentum)) / 100})`,
                  }}
                  transition={{ duration: 0.35, ease: EASE_OUT, delay: staggerDelay(i) }}
                />
              </div>

              <p className="mt-2 line-clamp-2 text-[11px] leading-snug text-muted-foreground">
                {trend.why}
              </p>

              <div className="mt-auto flex items-end justify-between gap-2 pt-2.5">
                <p
                  className="line-clamp-2 min-w-0 flex-1 text-[11px] italic leading-snug text-violet-200/90"
                  title={trend.suggestedHook}
                >
                  &ldquo;{trend.suggestedHook}&rdquo;
                </p>
                <button
                  onClick={() => copyHook(trend.suggestedHook, i)}
                  className="flex shrink-0 items-center gap-1 rounded-lg border border-border/70 bg-secondary/50 px-2 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                  aria-label={`Copy hook for ${trend.topic}`}
                >
                  {copiedIdx === i ? (
                    <Check className="h-3 w-3 text-emerald-400" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                  {copiedIdx === i ? "Copied" : "Copy hook"}
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </section>
  );
}
