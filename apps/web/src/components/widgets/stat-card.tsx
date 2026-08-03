"use client";

import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Sparkline } from "@/components/charts/sparkline";

export interface StatCardProps {
  label: string;
  value: string | number;
  /** Percentage change vs the previous period; sign decides the chip colour. */
  delta?: number;
  icon?: LucideIcon;
  spark?: number[];
  hint?: string;
  className?: string;
}

function formatDelta(delta: number): string {
  const abs = Math.abs(delta);
  const rounded = abs >= 10 ? String(Math.round(abs)) : abs.toFixed(1).replace(/\.0$/, "");
  return `${rounded}%`;
}

export function StatCard({ label, value, delta, icon: Icon, spark, hint, className }: StatCardProps) {
  return (
    <div
      className={cn("glass glass-hover flex h-full flex-col rounded-2xl p-4", className)}
      title={hint}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        {Icon && (
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10">
            <Icon className="h-3.5 w-3.5 text-violet-300" />
          </span>
        )}
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <span className="font-display text-2xl font-bold tracking-tight tabular-nums">{value}</span>
        {typeof delta === "number" && Number.isFinite(delta) && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
              delta >= 0
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                : "border-red-500/30 bg-red-500/10 text-red-300",
            )}
            title="Change vs previous day"
          >
            {delta >= 0 ? (
              <ArrowUpRight className="h-3 w-3" />
            ) : (
              <ArrowDownRight className="h-3 w-3" />
            )}
            {formatDelta(delta)}
          </span>
        )}
      </div>

      {hint && <p className="mt-0.5 truncate text-[11px] text-muted-foreground/70">{hint}</p>}

      {spark && spark.length > 1 && (
        <div className="mt-auto pt-2">
          <Sparkline data={spark} height={36} />
        </div>
      )}
    </div>
  );
}
