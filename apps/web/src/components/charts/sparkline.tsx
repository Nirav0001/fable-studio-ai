"use client";

import * as React from "react";
import { Area, AreaChart, ResponsiveContainer, YAxis } from "recharts";
import { cn } from "@/lib/utils";

export interface SparklineProps {
  data: number[];
  color?: string;
  height?: number;
  className?: string;
}

/** Tiny axis-free area chart — used at the bottom of stat cards and table rows. */
export function Sparkline({ data, color = "#8b5cf6", height = 40, className }: SparklineProps) {
  const reactId = React.useId();
  const gradId = `spark-${reactId.replace(/[^a-zA-Z0-9]/g, "")}`;
  const points = React.useMemo(() => data.map((y, i) => ({ i, y })), [data]);

  if (points.length < 2) {
    return <div style={{ height }} className={cn("w-full", className)} aria-hidden />;
  }

  return (
    <div style={{ height }} className={cn("w-full", className)} aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <YAxis hide domain={["dataMin", "dataMax"]} />
          <Area
            type="monotone"
            dataKey="y"
            stroke={color}
            strokeWidth={1.5}
            fill={`url(#${gradId})`}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
