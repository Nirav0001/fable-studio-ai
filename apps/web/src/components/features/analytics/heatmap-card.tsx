"use client";

import { motion } from "framer-motion";
import { CalendarRange } from "lucide-react";
import type { HeatmapCell } from "@fable/shared";
import { Heatmap } from "@/components/charts/heatmap";
import { EmptyState } from "@/components/widgets/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

interface HeatmapCardProps {
  cells?: HeatmapCell[];
  loading: boolean;
  /** "All channels" or the selected channel's name — shown in the subtitle. */
  scopeLabel: string;
}

export function HeatmapCard({ cells, loading, scopeLabel }: HeatmapCardProps) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="glass rounded-2xl p-5"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-display text-sm font-semibold tracking-tight">Posting heatmap</h2>
          <p className="text-xs text-muted-foreground">
            Day × hour engagement — {scopeLabel}
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <span>Quiet</span>
          <span
            className="h-2 w-16 rounded-full"
            style={{
              background:
                "linear-gradient(90deg, hsl(258 25% 13%), hsl(263 60% 40%), hsl(280 85% 60%))",
            }}
          />
          <span>Peak</span>
        </div>
      </div>

      {loading && <Skeleton className="h-[230px] rounded-xl" />}

      {!loading && (cells ?? []).length === 0 && (
        <EmptyState
          icon={CalendarRange}
          title="No heatmap data yet"
          body="Publish a few Shorts and we'll map the hours your audience shows up."
        />
      )}

      {!loading && (cells ?? []).length > 0 && (
        <div className="no-scrollbar overflow-x-auto pb-1">
          <Heatmap cells={cells ?? []} />
        </div>
      )}
    </motion.section>
  );
}
