"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Tv } from "lucide-react";
import type { ChannelSummary } from "@fable/shared";
import { formatCompact } from "@fable/shared";
import { cn, CHANNEL_TYPE_META } from "@/lib/utils";
import { EmptyState } from "@/components/widgets/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

interface ChannelsRowProps {
  channels?: ChannelSummary[];
  loading: boolean;
}

export function ChannelsRow({ channels, loading }: ChannelsRowProps) {
  return (
    <section className="glass rounded-2xl p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="font-display text-sm font-semibold tracking-tight">Channels</h2>
          <p className="text-xs text-muted-foreground">Performance at a glance</p>
        </div>
        <Link
          href="/channels"
          className="flex items-center gap-1 text-xs font-medium text-primary transition-colors hover:text-accent-foreground"
        >
          Manage <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {loading && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-[104px] rounded-xl" />
          ))}
        </div>
      )}

      {!loading && (channels ?? []).length === 0 && (
        <EmptyState
          icon={Tv}
          title="No channels yet"
          body="Create your first faceless channel to start the automation pipeline."
          action={
            <Button asChild size="sm">
              <Link href="/channels">Add a channel</Link>
            </Button>
          }
        />
      )}

      {!loading && (channels ?? []).length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {(channels ?? []).map((channel, i) => {
            const meta = CHANNEL_TYPE_META[channel.type];
            return (
              <motion.div
                key={channel.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: i * 0.04 }}
              >
                <Link
                  href={`/channels/${channel.id}`}
                  className="glass-hover block rounded-xl border border-border/60 bg-secondary/30 p-3.5"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-base font-bold text-white"
                      style={{
                        background: `linear-gradient(135deg, ${channel.avatarColor}, #d946ef)`,
                      }}
                    >
                      {meta.emoji}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold">{channel.name}</p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        @{channel.handle.replace(/^@/, "")}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "h-2 w-2 shrink-0 rounded-full",
                        channel.connected ? "animate-pulse-glow bg-emerald-400" : "bg-zinc-600",
                      )}
                      title={channel.connected ? "Connected to YouTube" : "Not connected"}
                    />
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-[13px] font-bold tabular-nums">
                        {formatCompact(channel.subscriberCount)}
                      </p>
                      <p className="text-[10px] text-muted-foreground">Subs</p>
                    </div>
                    <div>
                      <p className="text-[13px] font-bold tabular-nums">
                        {formatCompact(channel.viewsToday)}
                      </p>
                      <p className="text-[10px] text-muted-foreground">Views today</p>
                    </div>
                    <div>
                      <p className="text-[13px] font-bold tabular-nums">{channel.videosReady}</p>
                      <p className="text-[10px] text-muted-foreground">Ready</p>
                    </div>
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </div>
      )}
    </section>
  );
}
