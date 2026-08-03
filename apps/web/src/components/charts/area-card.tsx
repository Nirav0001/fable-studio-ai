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

export interface AreaCardProps {
  title: string;
  data: { x: string; y: number }[];
  color?: string;
  valueFormatter?: (value: number) => string;
  height?: number;
  className?: string;
}

/** Glass card wrapping a single gradient-filled area series. */
export function AreaCard({
  title,
  data,
  color = "#8b5cf6",
  valueFormatter,
  height = 200,
  className,
}: AreaCardProps) {
  const reactId = React.useId();
  const gradId = `area-${reactId.replace(/[^a-zA-Z0-9]/g, "")}`;
  const format = valueFormatter ?? ((v: number) => v.toLocaleString("en-GB"));
  const latest = data.length > 0 ? data[data.length - 1].y : null;

  return (
    <div className={cn("glass h-full rounded-2xl p-5", className)}>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="min-w-0 truncate text-sm font-medium">{title}</h3>
        {latest !== null && (
          <span
            className="shrink-0 font-display text-sm font-semibold tabular-nums text-violet-200"
            title="Latest data point"
          >
            {format(latest)}
          </span>
        )}
      </div>
      <div style={{ height }} className="w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.4} />
                <stop offset="100%" stopColor={color} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="hsl(258 25% 15%)" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="x"
              tick={{ fill: "hsl(258 12% 62%)", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              minTickGap={28}
              interval="preserveStartEnd"
            />
            <YAxis hide domain={[0, "auto"]} />
            <Tooltip
              contentStyle={TOOLTIP_CONTENT_STYLE}
              labelStyle={TOOLTIP_LABEL_STYLE}
              itemStyle={TOOLTIP_ITEM_STYLE}
              cursor={{ stroke: "hsl(263 60% 60% / 0.3)" }}
              formatter={(value) => [format(Number(value)), title]}
            />
            <Area
              type="monotone"
              dataKey="y"
              stroke={color}
              strokeWidth={2}
              fill={`url(#${gradId})`}
              dot={false}
              activeDot={{ r: 3, strokeWidth: 0 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
