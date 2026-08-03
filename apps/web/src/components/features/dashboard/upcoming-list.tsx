"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, CalendarClock } from "lucide-react";
import type { ChannelSummary, UpcomingSlot } from "@fable/shared";
import { ChannelChip } from "@/components/widgets/channel-chip";
import { EmptyState } from "@/components/widgets/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

interface UpcomingListProps {
  slots?: UpcomingSlot[];
  channels?: ChannelSummary[];
  loading: boolean;
}

/** Compact countdown, e.g. "in 3h", "in 45m", "in 2d 4h". */
function countdown(iso: string, now: number): string {
  const diff = new Date(iso).getTime() - now;
  if (diff <= 30_000) return "due now";
  const totalMin = Math.round(diff / 60_000);
  if (totalMin < 60) return `in ${totalMin}m`;
  const hours = Math.floor(totalMin / 60);
  if (hours < 24) {
    const rem = totalMin % 60;
    return hours < 6 && rem > 0 ? `in ${hours}h ${rem}m` : `in ${hours}h`;
  }
  const days = Math.floor(hours / 24);
  const remH = hours % 24;
  return remH > 0 ? `in ${days}d ${remH}h` : `in ${days}d`;
}

export function UpcomingList({ slots, channels, loading }: UpcomingListProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const channelById = new Map((channels ?? []).map((c) => [c.id, c]));

  return (
    <section className="glass rounded-2xl p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="font-display text-sm font-semibold tracking-tight">Upcoming uploads</h2>
          <p className="text-xs text-muted-foreground">Next slots on the schedule</p>
        </div>
        <Link
          href="/schedule"
          className="flex items-center gap-1 text-xs font-medium text-primary transition-colors hover:text-accent-foreground"
        >
          Calendar <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {loading && (
        <div className="space-y-2.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 rounded-xl" />
          ))}
        </div>
      )}

      {!loading && (slots ?? []).length === 0 && (
        <EmptyState
          icon={CalendarClock}
          title="Nothing scheduled"
          body="Approve a project or auto-fill your week to queue uploads."
          action={
            <Button asChild size="sm" variant="secondary">
              <Link href="/schedule">Open schedule</Link>
            </Button>
          }
        />
      )}

      {!loading && (slots ?? []).length > 0 && (
        <ul className="space-y-2">
          {(slots ?? []).map((slot, i) => {
            const channel = channelById.get(slot.channelId);
            return (
              <motion.li
                key={slot.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: i * 0.04 }}
                className="flex items-center gap-3 rounded-xl border border-border/60 bg-secondary/30 px-3 py-2.5"
              >
                <ChannelChip
                  name={channel?.name ?? slot.channelName ?? "Channel"}
                  color={channel?.avatarColor ?? "#8b5cf6"}
                  type={channel?.type ?? "wyr"}
                />
                <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                  {slot.video?.title ?? "Empty slot — auto-fill picks the next ready video"}
                </p>
                <span className="shrink-0 rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[11px] font-medium tabular-nums text-sky-300">
                  {countdown(slot.scheduledAt, now)}
                </span>
              </motion.li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
