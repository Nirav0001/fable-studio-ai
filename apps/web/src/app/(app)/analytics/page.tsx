"use client";

import { useMemo, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import type { ChannelSummary, HeatmapCell } from "@fable/shared";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/widgets/page-header";
import { ChannelTabs } from "@/components/features/analytics/channel-tabs";
import {
  OverviewCharts,
  type GrowthPoint,
  type SeriesPoint,
} from "@/components/features/analytics/overview-charts";
import { HeatmapCard } from "@/components/features/analytics/heatmap-card";
import { BestTimes } from "@/components/features/analytics/best-times";
import { TopVideos, type RankedVideo } from "@/components/features/analytics/top-videos";

const RANGES = [7, 28, 90] as const;
type RangeDays = (typeof RANGES)[number];

interface ChannelAnalytics {
  series: SeriesPoint[];
  totals: Record<string, number>;
  bestVideos: RankedVideo[];
  worstVideos: RankedVideo[];
}

interface GrowthResponse {
  series: GrowthPoint[];
}

function RangePicker({
  value,
  onChange,
}: {
  value: RangeDays;
  onChange: (days: RangeDays) => void;
}) {
  return (
    <div className="flex items-center rounded-full border border-border/70 bg-secondary/40 p-1">
      {RANGES.map((r) => {
        const active = value === r;
        return (
          <button
            key={r}
            onClick={() => onChange(r)}
            className={cn(
              "relative rounded-full px-3.5 py-1 text-xs font-medium transition-colors",
              active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
            aria-pressed={active}
          >
            {active && (
              <motion.span
                layoutId="analytics-range-pill"
                className="absolute inset-0 rounded-full border border-primary/30 bg-primary/15"
                transition={{ type: "spring", stiffness: 400, damping: 32 }}
              />
            )}
            <span className="relative tabular-nums">{r}d</span>
          </button>
        );
      })}
    </div>
  );
}

/** Merge per-channel daily series into one cross-channel series (sums + view-weighted rates). */
function mergeAnalytics(loaded: ChannelAnalytics[]): {
  series: SeriesPoint[];
  best: RankedVideo[];
  worst: RankedVideo[];
} {
  interface Bucket {
    views: number;
    watchMinutes: number;
    subsGained: number;
    revenueGbp: number;
    ctrRates: { rate: number; weight: number }[];
    retRates: { rate: number; weight: number }[];
  }

  const byDate = new Map<string, Bucket>();
  for (const ca of loaded) {
    for (const p of ca.series) {
      const bucket = byDate.get(p.date) ?? {
        views: 0,
        watchMinutes: 0,
        subsGained: 0,
        revenueGbp: 0,
        ctrRates: [],
        retRates: [],
      };
      bucket.views += p.views;
      bucket.watchMinutes += p.watchMinutes;
      bucket.subsGained += p.subsGained;
      bucket.revenueGbp += p.revenueGbp;
      bucket.ctrRates.push({ rate: p.ctr, weight: p.views });
      bucket.retRates.push({ rate: p.retention, weight: p.views });
      byDate.set(p.date, bucket);
    }
  }

  const weighted = (rates: { rate: number; weight: number }[]): number => {
    if (rates.length === 0) return 0;
    const totalWeight = rates.reduce((sum, r) => sum + r.weight, 0);
    if (totalWeight <= 0) {
      return rates.reduce((sum, r) => sum + r.rate, 0) / rates.length;
    }
    return rates.reduce((sum, r) => sum + r.rate * r.weight, 0) / totalWeight;
  };

  const series: SeriesPoint[] = Array.from(byDate.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, b]) => ({
      date,
      views: b.views,
      watchMinutes: b.watchMinutes,
      subsGained: b.subsGained,
      revenueGbp: b.revenueGbp,
      ctr: weighted(b.ctrRates),
      retention: weighted(b.retRates),
    }));

  const best = loaded
    .flatMap((c) => c.bestVideos)
    .sort((a, b) => b.views - a.views)
    .slice(0, 5);
  const worst = loaded
    .flatMap((c) => c.worstVideos)
    .sort((a, b) => a.views - b.views)
    .slice(0, 5);

  return { series, best, worst };
}

export default function AnalyticsPage() {
  const [selected, setSelected] = useState<string>("all");
  const [days, setDays] = useState<RangeDays>(28);

  const { data: channels, isLoading: channelsLoading } = useQuery({
    queryKey: ["channels"],
    queryFn: () => api.get<ChannelSummary[]>("/channels"),
  });

  const channelIds = useMemo(
    () => (selected === "all" ? (channels ?? []).map((c) => c.id) : [selected]),
    [selected, channels],
  );

  const seriesQueries = useQueries({
    queries: channelIds.map((id) => ({
      queryKey: ["analytics", "channel", id, days],
      queryFn: () => api.get<ChannelAnalytics>(`/analytics/channels/${id}?days=${days}`),
    })),
  });

  const seriesLoading = channelsLoading || seriesQueries.some((q) => q.isLoading);
  const loaded = seriesQueries
    .map((q) => q.data)
    .filter((d): d is ChannelAnalytics => d !== undefined);
  const { series, best, worst } = mergeAnalytics(loaded);

  const { data: growth, isLoading: growthLoading } = useQuery({
    queryKey: ["analytics", "growth"],
    queryFn: () => api.get<GrowthResponse>("/analytics/growth?days=90"),
  });

  const { data: heatmap, isLoading: heatmapLoading } = useQuery({
    queryKey: ["analytics", "heatmap", selected],
    queryFn: () =>
      api.get<HeatmapCell[]>(
        selected === "all" ? "/analytics/heatmap" : `/analytics/heatmap?channelId=${selected}`,
      ),
  });

  const scopeLabel =
    selected === "all"
      ? "All channels"
      : (channels ?? []).find((c) => c.id === selected)?.name ?? "Selected channel";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics"
        description="Cross-channel performance, retention and the best times to post."
        actions={<RangePicker value={days} onChange={setDays} />}
      />

      <ChannelTabs
        channels={channels}
        selected={selected}
        onSelect={setSelected}
        loading={channelsLoading}
      />

      <OverviewCharts
        series={series}
        loading={seriesLoading}
        growth={growth?.series}
        growthLoading={growthLoading}
        days={days}
      />

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="min-w-0 xl:col-span-2">
          <HeatmapCard cells={heatmap} loading={heatmapLoading} scopeLabel={scopeLabel} />
        </div>
        <div className="min-w-0">
          <BestTimes channelId={selected === "all" ? null : selected} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="min-w-0">
          <TopVideos tone="best" videos={best} loading={seriesLoading} />
        </div>
        <div className="min-w-0">
          <TopVideos tone="worst" videos={worst} loading={seriesLoading} />
        </div>
      </div>
    </div>
  );
}
