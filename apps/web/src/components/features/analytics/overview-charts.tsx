"use client";

import { motion } from "framer-motion";
import { EASE_OUT, staggerDelay } from "@/lib/motion";
import { format } from "date-fns";
import { BarChart3 } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCompact } from "@fable/shared";
import { AreaCard } from "@/components/charts/area-card";
import { EmptyState } from "@/components/widgets/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

export interface SeriesPoint {
  date: string;
  views: number;
  watchMinutes: number;
  subsGained: number;
  revenueGbp: number;
  ctr: number;
  retention: number;
}

export interface GrowthPoint {
  date: string;
  subscribers: number;
  views: number;
}

interface OverviewChartsProps {
  series?: SeriesPoint[];
  loading: boolean;
  growth?: GrowthPoint[];
  growthLoading: boolean;
  days: number;
}

function dateLabel(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : format(d, "d MMM");
}

export function OverviewCharts({ series, loading, growth, growthLoading, days }: OverviewChartsProps) {
  if (loading) {
    return (
      <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-[280px] rounded-2xl" />
        ))}
      </div>
    );
  }

  if ((series ?? []).length === 0) {
    return (
      <div className="glass rounded-2xl p-5">
        <EmptyState
          icon={BarChart3}
          title="No analytics yet"
          body="Once your channels start uploading, daily performance lands here."
        />
      </div>
    );
  }

  const points = series ?? [];
  const viewsData = points.map((p) => ({ x: dateLabel(p.date), y: p.views }));
  const lineData = points.map((p) => ({
    x: dateLabel(p.date),
    ctr: Number(p.ctr.toFixed(2)),
    retention: Number(p.retention.toFixed(1)),
  }));
  const growthData = (growth ?? []).map((p) => ({ x: dateLabel(p.date), y: p.subscribers }));

  return (
    <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: EASE_OUT }}
        className="min-w-0"
      >
        <AreaCard
          title={`Views · last ${days} days`}
          data={viewsData}
          color="#a78bfa"
          valueFormatter={formatCompact}
        />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: EASE_OUT, delay: staggerDelay(1) }}
        className="glass min-w-0 rounded-2xl p-5"
      >
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-sm font-medium">CTR & retention</h3>
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-fuchsia-400" /> CTR
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-400" /> Retention
            </span>
          </div>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">Click-through vs watch-through</p>
        <div className="h-[190px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={lineData} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
              <CartesianGrid stroke="hsl(258 25% 15%)" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="x"
                tick={{ fill: "hsl(258 12% 62%)", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                minTickGap={28}
                interval="preserveStartEnd"
              />
              <YAxis yAxisId="ctr" hide domain={[0, "auto"]} />
              <YAxis yAxisId="retention" hide domain={[0, 100]} />
              <ChartTooltip
                cursor={{ stroke: "hsl(263 60% 60% / 0.3)" }}
                content={({ active, payload, label }) => {
                  if (!active || !payload || payload.length === 0) return null;
                  return (
                    <div className="glass rounded-xl px-3 py-2 text-xs shadow-xl">
                      <p className="mb-1 font-medium text-muted-foreground">{label}</p>
                      {payload.map((entry) => (
                        <p key={String(entry.dataKey)} className="flex items-center gap-1.5">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ background: entry.color ?? "#a78bfa" }}
                          />
                          <span className="capitalize text-muted-foreground">
                            {String(entry.dataKey)}
                          </span>
                          <span className="ml-auto pl-3 font-semibold tabular-nums">
                            {Number(entry.value).toFixed(1)}%
                          </span>
                        </p>
                      ))}
                    </div>
                  );
                }}
              />
              <Line
                yAxisId="ctr"
                type="monotone"
                dataKey="ctr"
                stroke="#e879f9"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 3, strokeWidth: 0 }}
              />
              <Line
                yAxisId="retention"
                type="monotone"
                dataKey="retention"
                stroke="#34d399"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 3, strokeWidth: 0 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: EASE_OUT, delay: staggerDelay(2) }}
        className="min-w-0 lg:col-span-2 xl:col-span-1"
      >
        {growthLoading ? (
          <Skeleton className="h-full min-h-[280px] rounded-2xl" />
        ) : (
          <AreaCard
            title="Subscriber growth · 90 days"
            data={growthData}
            color="#e879f9"
            valueFormatter={formatCompact}
          />
        )}
      </motion.div>
    </div>
  );
}
