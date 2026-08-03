"use client";

import * as React from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn } from "@/lib/utils";

const PALETTE = ["#8b5cf6", "#a78bfa", "#e879f9", "#34d399", "#38bdf8"];

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

export interface MultiLineSeries {
  /** dataKey inside each data row */
  key: string;
  label?: string;
  color?: string;
}

export interface MultiLineProps {
  data: Record<string, string | number>[];
  series: MultiLineSeries[];
  /** dataKey used for the x axis (default "x") */
  xKey?: string;
  title?: string;
  description?: string;
  valueFormatter?: (value: number) => string;
  height?: number;
  className?: string;
}

/**
 * Multiple line series over a shared x axis. With `title` it renders inside a
 * glass card with a dot legend; without it, just the bare responsive chart.
 */
export function MultiLine({
  data,
  series,
  xKey = "x",
  title,
  description,
  valueFormatter,
  height = 220,
  className,
}: MultiLineProps) {
  const format = valueFormatter ?? ((v: number) => v.toLocaleString("en-GB"));

  const chart = (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
          <CartesianGrid stroke="hsl(258 25% 15%)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey={xKey}
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
            formatter={(value, name) => [format(Number(value)), String(name)]}
          />
          {series.map((s, i) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label ?? s.key}
              stroke={s.color ?? PALETTE[i % PALETTE.length]}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 3, strokeWidth: 0 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );

  if (!title) {
    return <div className={cn("w-full", className)}>{chart}</div>;
  }

  return (
    <div className={cn("glass h-full rounded-2xl p-5", className)}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-medium">{title}</h3>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-3 text-[11px] text-muted-foreground">
          {series.map((s, i) => (
            <span key={s.key} className="flex items-center gap-1.5">
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: s.color ?? PALETTE[i % PALETTE.length] }}
              />
              {s.label ?? s.key}
            </span>
          ))}
        </div>
      </div>
      {chart}
    </div>
  );
}
