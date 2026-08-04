"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { clamp } from "@fable/shared";
import { EASE_OUT } from "@/lib/motion";
import { cn } from "@/lib/utils";

interface StageDef {
  label: string;
  /** Progress % reported by the generate processor when this stage begins. */
  pct: number;
  match: RegExp;
}

const PIPELINE: StageDef[] = [
  { label: "Analyzing", pct: 10, match: /analy[sz]|source|transcript|load/i },
  { label: "Script", pct: 25, match: /script|writ|question|scene/i },
  { label: "SEO", pct: 45, match: /seo|hashtag/i },
  { label: "Scoring", pct: 60, match: /scor|viral/i },
  { label: "Thumbnails", pct: 75, match: /thumb|design/i },
  { label: "Done", pct: 100, match: /done|complete|cost|estimat|finish|ready/i },
];

function inferActiveIndex(stage: string, progress: number): number {
  const byName = PIPELINE.findIndex((s) => s.match.test(stage));
  if (byName >= 0) return byName;
  let idx = 0;
  for (let i = 0; i < PIPELINE.length; i += 1) {
    if (progress >= PIPELINE[i].pct) idx = i;
  }
  return idx;
}

export interface ProgressStagesProps {
  /** Free-form stage string from the job (e.g. "Writing script"). */
  stage: string;
  /** 0-100 overall progress. */
  progress: number;
  className?: string;
}

/** Horizontal animated generation pipeline: Analyzing → Script → SEO → Scoring → Thumbnails → Done. */
export function ProgressStages({ stage, progress, className }: ProgressStagesProps) {
  const pct = clamp(Math.round(progress), 0, 100);
  const active = inferActiveIndex(stage ?? "", pct);
  const finished = pct >= 100;

  return (
    <div className={cn("w-full", className)}>
      <div className="flex items-start">
        {PIPELINE.map((step, i) => {
          const done = finished || i < active;
          const current = !finished && i === active;
          return (
            <React.Fragment key={step.label}>
              {i > 0 && (
                <div className="relative mt-[13px] h-0.5 min-w-[12px] flex-1 overflow-hidden rounded-full bg-secondary/80">
                  <motion.div
                    className="gradient-primary absolute inset-0 origin-left"
                    initial={false}
                    animate={{ transform: `scaleX(${finished || i <= active ? 1 : 0})` }}
                    transition={{ duration: 0.45, ease: EASE_OUT }}
                  />
                </div>
              )}
              <div className="flex w-14 shrink-0 flex-col items-center gap-1.5">
                <div
                  className={cn(
                    "relative flex h-7 w-7 items-center justify-center rounded-full border text-[10px] font-bold transition-colors duration-300",
                    done
                      ? "gradient-primary border-transparent text-white shadow-md shadow-primary/30"
                      : current
                        ? "border-primary/60 bg-primary/15 text-violet-200"
                        : "border-border bg-secondary/40 text-muted-foreground",
                  )}
                >
                  {current && (
                    <span
                      className="pointer-events-none absolute inset-0 animate-ping rounded-full bg-primary/25"
                      aria-hidden
                    />
                  )}
                  {done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : <span>{i + 1}</span>}
                </div>
                <span
                  className={cn(
                    "text-center text-[10px] font-medium leading-tight",
                    done || current ? "text-foreground/90" : "text-muted-foreground/70",
                  )}
                >
                  {step.label}
                </span>
              </div>
            </React.Fragment>
          );
        })}
      </div>

      <div className="mt-2.5 flex items-center justify-between gap-2 text-[11px]">
        <span className="truncate capitalize text-muted-foreground">
          {finished
            ? "Pipeline complete"
            : stage && stage !== "idle"
              ? stage
              : `${PIPELINE[active].label}…`}
        </span>
        <span className="shrink-0 font-semibold tabular-nums text-violet-200">{pct}%</span>
      </div>
    </div>
  );
}
