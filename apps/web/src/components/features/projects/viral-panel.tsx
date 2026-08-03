"use client";

import { motion } from "framer-motion";
import { Lightbulb } from "lucide-react";
import type { ViralScore } from "@fable/shared";
import { cn, scoreColor } from "@/lib/utils";
import { ScoreDial } from "@/components/widgets/score-dial";

const BREAKDOWN_ORDER: { key: keyof ViralScore["breakdown"]; label: string }[] = [
  { key: "hook", label: "Hook strength" },
  { key: "editing", label: "Editing" },
  { key: "pacing", label: "Pacing" },
  { key: "seo", label: "SEO" },
  { key: "thumbnail", label: "Thumbnail" },
  { key: "retention", label: "Retention" },
  { key: "topic", label: "Topic" },
  { key: "trending", label: "Trending" },
  { key: "psychology", label: "Psychology" },
];

function verdict(total: number): string {
  if (total >= 85) return "Primed to pop — publish with confidence.";
  if (total >= 70) return "Strong contender — a couple of tweaks from viral.";
  if (total >= 55) return "Decent — sharpen the hook and thumbnail.";
  if (total >= 40) return "Risky — rework the weakest areas below.";
  return "Needs a rethink — consider regenerating.";
}

function barColor(value: number): string {
  if (value >= 80) return "from-emerald-500 to-emerald-400";
  if (value >= 60) return "from-violet-500 to-fuchsia-400";
  if (value >= 40) return "from-amber-500 to-amber-400";
  return "from-red-500 to-red-400";
}

interface ViralPanelProps {
  viral: ViralScore;
}

/** Big radial score, 9-factor breakdown bars and concrete suggestions. */
export function ViralPanel({ viral }: ViralPanelProps) {
  return (
    <div className="space-y-5">
      <div className="glass rounded-2xl p-6">
        <div className="flex flex-col items-center gap-8 lg:flex-row lg:items-start">
          {/* ── Total ────────────────────────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4 }}
            className="flex shrink-0 flex-col items-center gap-2 text-center"
          >
            <ScoreDial score={viral.total} size={150} />
            <p className="text-sm font-semibold">Viral score</p>
            <p className="max-w-[200px] text-xs text-muted-foreground">{verdict(viral.total)}</p>
          </motion.div>

          {/* ── Breakdown bars ───────────────────────────────────────── */}
          <div className="w-full min-w-0 flex-1 space-y-3">
            {BREAKDOWN_ORDER.map(({ key, label }, i) => {
              const value = Math.max(0, Math.min(100, viral.breakdown[key] ?? 0));
              return (
                <div key={key} className="flex items-center gap-3">
                  <span className="w-28 shrink-0 text-xs text-muted-foreground">{label}</span>
                  <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-secondary/70">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${value}%` }}
                      transition={{ duration: 0.7, delay: i * 0.05, ease: "easeOut" }}
                      className={cn("h-full rounded-full bg-gradient-to-r", barColor(value))}
                    />
                  </div>
                  <span className={cn("w-8 shrink-0 text-right text-xs font-semibold tabular-nums", scoreColor(value))}>
                    {Math.round(value)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Suggestions ──────────────────────────────────────────────── */}
      {viral.suggestions.length > 0 && (
        <div className="glass rounded-2xl p-5">
          <h4 className="mb-3 text-sm font-semibold">How to push it higher</h4>
          <ul className="space-y-2.5">
            {viral.suggestions.map((s, i) => (
              <motion.li
                key={s}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: i * 0.06 }}
                className="flex items-start gap-2.5 text-sm text-muted-foreground"
              >
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-amber-500/30 bg-amber-500/10">
                  <Lightbulb className="h-3 w-3 text-amber-400" />
                </span>
                {s}
              </motion.li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
