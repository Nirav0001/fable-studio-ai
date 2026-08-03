"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Eye, Film, Link2, Loader2, Users, type LucideIcon } from "lucide-react";
import type { ChannelSummary } from "@fable/shared";
import { formatCompact } from "@fable/shared";
import { api, ApiError } from "@/lib/api";
import { CHANNEL_TYPE_META } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export interface ConnectResponse {
  authUrl: string | null;
  connected?: boolean;
}

/** Gradient used for channel avatars everywhere in the channels area. */
export function avatarGradient(color: string): string {
  return `linear-gradient(140deg, ${color} 0%, #d946ef 115%)`;
}

const FALLBACK_META = { label: "Channel", emoji: "🎬", gradient: "from-violet-500 to-fuchsia-500" };

export function ChannelCard({ channel, index = 0 }: { channel: ChannelSummary; index?: number }) {
  const qc = useQueryClient();
  const meta = CHANNEL_TYPE_META[channel.type] ?? FALLBACK_META;

  const connect = useMutation({
    mutationFn: () => api.post<ConnectResponse>(`/channels/${channel.id}/connect`),
    onSuccess: (data) => {
      if (data.authUrl) {
        window.open(data.authUrl, "_blank", "noopener,noreferrer");
        toast.info("Finish connecting in the Google tab we just opened");
      } else {
        toast.success("Channel connected");
      }
      qc.invalidateQueries({ queryKey: ["channels"] });
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Could not connect channel"),
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.04 }}
    >
      <Link href={`/channels/${channel.id}`} className="glass glass-hover block rounded-2xl p-5">
        <div className="flex items-start justify-between gap-3">
          <div
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-xl font-bold text-white shadow-lg"
            style={{ backgroundImage: avatarGradient(channel.avatarColor) }}
          >
            {channel.name.charAt(0).toUpperCase()}
          </div>
          {channel.connected ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Connected
            </span>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              className="h-7 gap-1.5 text-xs"
              disabled={connect.isPending}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                connect.mutate();
              }}
            >
              {connect.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Link2 className="h-3 w-3" />
              )}
              Connect
            </Button>
          )}
        </div>

        <div className="mt-4 min-w-0">
          <h3 className="truncate font-display text-base font-semibold tracking-tight">
            {channel.name}
          </h3>
          <p className="truncate text-sm text-muted-foreground">@{channel.handle}</p>
        </div>

        <div className="mt-2.5 inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-secondary/40 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
          <span aria-hidden>{meta.emoji}</span>
          {meta.label}
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 border-t border-border/50 pt-4">
          <CardStat icon={Users} value={formatCompact(channel.subscriberCount)} label="Subs" />
          <CardStat icon={Eye} value={formatCompact(channel.viewsToday)} label="Views today" />
          <CardStat icon={Film} value={String(channel.videosReady)} label="Ready" />
        </div>
      </Link>
    </motion.div>
  );
}

function CardStat({ icon: Icon, value, label }: { icon: LucideIcon; value: string; label: string }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 shrink-0 text-primary/80" />
        <span className="truncate text-sm font-semibold tabular-nums">{value}</span>
      </div>
      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}
