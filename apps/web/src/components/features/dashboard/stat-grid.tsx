"use client";

import { motion } from "framer-motion";
import {
  Activity,
  CalendarClock,
  Eye,
  MousePointerClick,
  PoundSterling,
  Timer,
  UploadCloud,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { AnalyticsOverviewT } from "@fable/shared";
import { formatCompact, formatDuration, formatGbp } from "@fable/shared";
import { StatCard } from "@/components/widgets/stat-card";
import { Skeleton } from "@/components/ui/skeleton";

interface StatDef {
  label: string;
  value: string;
  delta?: number;
  icon: LucideIcon;
  spark?: number[];
  hint?: string;
}

export function StatGrid({ overview }: { overview?: AnalyticsOverviewT }) {
  if (!overview) {
    return (
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-[124px] rounded-2xl" />
        ))}
      </div>
    );
  }

  const t = overview.today;
  const d = overview.deltas ?? {};
  const s = overview.sparklines ?? {};

  const cards: StatDef[] = [
    {
      label: "Today's uploads",
      value: String(t.uploads),
      delta: d.uploads,
      icon: UploadCloud,
      spark: s.uploads,
      hint: "Videos published today across all channels",
    },
    {
      label: "Scheduled",
      value: String(t.scheduled),
      delta: d.scheduled,
      icon: CalendarClock,
      spark: s.scheduled,
      hint: "Slots waiting in the upload queue",
    },
    {
      label: "Views today",
      value: formatCompact(t.views),
      delta: d.views,
      icon: Eye,
      spark: s.views,
      hint: "Views across all connected channels",
    },
    {
      label: "Subs gained",
      value: `+${formatCompact(t.subsGained)}`,
      delta: d.subsGained ?? d.subs,
      icon: Users,
      spark: s.subs ?? s.subsGained,
      hint: "Net new subscribers today",
    },
    {
      label: "Revenue est.",
      value: formatGbp(t.revenueGbp),
      delta: d.revenueGbp ?? d.revenue,
      icon: PoundSterling,
      spark: s.revenue ?? s.revenueGbp,
      hint: "Estimated ad revenue today",
    },
    {
      label: "CTR",
      value: `${t.ctr.toFixed(1)}%`,
      delta: d.ctr,
      icon: MousePointerClick,
      spark: s.ctr,
      hint: "Impressions click-through rate",
    },
    {
      label: "Avg watch time",
      value: formatDuration(t.avgViewSec),
      delta: d.avgViewSec,
      icon: Timer,
      spark: s.avgViewSec,
      hint: "Average view duration per Short",
    },
    {
      label: "Retention",
      value: `${Math.round(t.retention)}%`,
      delta: d.retention,
      icon: Activity,
      spark: s.retention,
      hint: "Average % of each video watched",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      {cards.map((card, i) => (
        <motion.div
          key={card.label}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: i * 0.04 }}
        >
          <StatCard
            label={card.label}
            value={card.value}
            delta={card.delta}
            icon={card.icon}
            spark={card.spark}
            hint={card.hint}
          />
        </motion.div>
      ))}
    </div>
  );
}
