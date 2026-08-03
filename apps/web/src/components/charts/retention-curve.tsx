"use client";

import * as React from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn } from "@/lib/utils";

const TOOLTIP_CONTENT_STYLE: React.CSSProperties = {
  background: "hsl(258 32% 7% / 0.97)",
  border: "1px solid hsl(258 25% 20%)",
  borderRadius: 12,
  boxShadow: "0 12px 32px hsl(258 60% 2% / 0.6)",
  fontSize: 12,
  padding: "8px 12px",
};
const TOOLTIP_LABEL_STYLE: React.CSSProperties = { color: "hsl(258 12% 62%)", marginBottom: 4 };
const TOOLTIP_ITEM_STYLE: React.CSSProperties = { color: "hsl(260 25% 96%)" };

export interface RetentionPoint {
  /** % position through the video (0-100) */
  pct: number;
  /** % of viewers still watching at that position (0-100) */
  value: number;
}

export interface RetentionCurveProps {
  points: RetentionPoint[];
  color?: string;
  height?: number;
  className?: string;
}

/** Audience-retention area chart: % still watching vs position in the video. */
export function RetentionCurve({
  points,
  color = "#8b5cf6",
  height = 150,
  className,
}: RetentionCurveProps) {
  const reactId = React.useId();
  const gradId = `ret-${reactId.replace(/[^a-zA-Z0-9]/g, "")}`;

  return (
    <div style={{ height }} className={cn("w-full", className)}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.4} />
              <stop offset="100%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="hsl(258 25% 15%)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="pct"
            type="number"
            domain={[0, 100]}
            ticks={[0, 25, 50, 75, 100]}
            tickFormatter={(v) => `${v}%`}
            tick={{ fill: "hsl(258 12% 62%)", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis hide domain={[0, 100]} />
          <Tooltip
            contentStyle={TOOLTIP_CONTENT_STYLE}
            labelStyle={TOOLTIP_LABEL_STYLE}
            itemStyle={TOOLTIP_ITEM_STYLE}
            cursor={{ stroke: "hsl(263 60% 60% / 0.3)" }}
            labelFormatter={(label) => `${label}% into the video`}
            formatter={(value) => [`${Number(value).toFixed(1)}% watching`, "Retention"]}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            fill={`url(#${gradId})`}
            dot={false}
            activeDot={{ r: 3, strokeWidth: 0 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
