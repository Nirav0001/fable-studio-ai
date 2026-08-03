"use client";

import * as React from "react";
import type { HeatmapCell } from "@fable/shared";
import { cn } from "@/lib/utils";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** Render rows Monday-first, Sunday last (cell.day is 0=Sun..6=Sat). */
const ROW_ORDER = [1, 2, 3, 4, 5, 6, 0];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

export interface HeatmapProps {
  cells: HeatmapCell[];
  className?: string;
}

/**
 * 7×24 posting-performance heatmap on a violet opacity scale.
 * Hover a cell for the exact day/hour score (native title tooltip).
 */
export function Heatmap({ cells, className }: HeatmapProps) {
  const { lookup, max } = React.useMemo(() => {
    const map = new Map<string, number>();
    let m = 0;
    for (const cell of cells) {
      map.set(`${cell.day}-${cell.hour}`, cell.value);
      if (cell.value > m) m = cell.value;
    }
    return { lookup: map, max: m > 0 ? m : 100 };
  }, [cells]);

  return (
    <div className={cn("no-scrollbar w-full overflow-x-auto", className)}>
      <div
        className="grid min-w-[540px] gap-1"
        style={{ gridTemplateColumns: "2.5rem repeat(24, minmax(0, 1fr))" }}
        role="img"
        aria-label="Posting performance heatmap by day of week and hour"
      >
        {ROW_ORDER.map((day) => (
          <React.Fragment key={day}>
            <div className="flex items-center pr-1 text-[10px] font-medium text-muted-foreground">
              {DAY_LABELS[day]}
            </div>
            {HOURS.map((hour) => {
              const value = lookup.get(`${day}-${hour}`) ?? 0;
              const t = value / max;
              return (
                <div
                  key={hour}
                  title={`${DAY_LABELS[day]} ${String(hour).padStart(2, "0")}:00 — score ${Math.round(value)}`}
                  className="aspect-square min-w-0 rounded-[4px] transition-shadow hover:ring-1 hover:ring-primary/70"
                  style={{
                    background:
                      t <= 0.02
                        ? "hsl(258 25% 12%)"
                        : `hsl(263 84% 66% / ${(0.1 + t * 0.85).toFixed(3)})`,
                  }}
                />
              );
            })}
          </React.Fragment>
        ))}

        <div />
        {HOURS.map((hour) => (
          <div
            key={hour}
            className="pt-0.5 text-center text-[9px] tabular-nums text-muted-foreground/70"
          >
            {hour % 4 === 0 ? String(hour).padStart(2, "0") : ""}
          </div>
        ))}
      </div>
    </div>
  );
}
