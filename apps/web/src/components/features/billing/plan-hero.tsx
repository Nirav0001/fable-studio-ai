"use client";

import { format } from "date-fns";
import { CalendarClock } from "lucide-react";
import type { PlanTier } from "@fable/shared";
import { PLANS, clamp, formatGbp } from "@fable/shared";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

export interface BillingUsage {
  videosThisMonth: number;
  aiTokensK: number;
  channels: number;
  storageMb: number;
}

/** Soft storage allowance per plan, used only for the usage meter. */
const STORAGE_LIMIT_MB: Record<PlanTier, number> = {
  starter: 5 * 1024,
  studio: 20 * 1024,
  agency: 100 * 1024,
};

function formatStorage(mb: number): string {
  return mb >= 1024 ? `${(mb / 1024).toFixed(1).replace(/\.0$/, "")} GB` : `${Math.round(mb)} MB`;
}

interface MeterProps {
  label: string;
  valueText: string;
  pct: number;
}

function Meter({ label, valueText, pct }: MeterProps) {
  const clamped = clamp(pct, 0, 100);
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span
          className={cn(
            "text-xs font-medium tabular-nums",
            clamped >= 95 ? "text-red-300" : clamped >= 80 ? "text-amber-300" : "text-foreground",
          )}
        >
          {valueText}
        </span>
      </div>
      <Progress value={clamped} className="h-1.5" />
    </div>
  );
}

interface PlanHeroProps {
  plan: PlanTier;
  planStatus: string;
  renewsAt: string;
  usage: BillingUsage;
}

export function PlanHero({ plan, planStatus, renewsAt, usage }: PlanHeroProps) {
  const meta = PLANS[plan];
  const renews = new Date(renewsAt);
  const storageLimit = STORAGE_LIMIT_MB[plan];

  return (
    <div className="rounded-2xl bg-gradient-to-br from-violet-500/70 via-purple-500/35 to-fuchsia-500/70 p-px">
      <div className="rounded-[calc(1rem-1px)] bg-card/95 p-6 backdrop-blur-xl">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              Current plan
            </p>
            <div className="mt-1 flex items-center gap-2.5">
              <h2 className="font-display text-2xl font-bold tracking-tight gradient-text">
                {meta.name}
              </h2>
              <Badge
                variant={planStatus === "active" ? "success" : "destructive"}
                className="capitalize"
              >
                {planStatus}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              <span className="text-lg font-semibold text-foreground">
                {formatGbp(meta.priceGbp)}
              </span>{" "}
              / month
            </p>
            <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarClock className="h-3.5 w-3.5" />
              {Number.isNaN(renews.getTime())
                ? "Renewal date pending"
                : `Renews ${format(renews, "d MMM yyyy")}`}
            </p>
          </div>

          <div className="grid w-full max-w-md grid-cols-1 gap-4 sm:grid-cols-2">
            <Meter
              label="Videos this month"
              valueText={`${usage.videosThisMonth} / ${meta.videosPerMonth}`}
              pct={(usage.videosThisMonth / meta.videosPerMonth) * 100}
            />
            <Meter
              label="AI credits"
              valueText={`${usage.aiTokensK}K / ${meta.aiCreditsK}K`}
              pct={(usage.aiTokensK / meta.aiCreditsK) * 100}
            />
            <Meter
              label="Channels"
              valueText={`${usage.channels} / ${meta.channels}`}
              pct={(usage.channels / meta.channels) * 100}
            />
            <Meter
              label="Storage"
              valueText={`${formatStorage(usage.storageMb)} / ${formatStorage(storageLimit)}`}
              pct={(usage.storageMb / storageLimit) * 100}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
