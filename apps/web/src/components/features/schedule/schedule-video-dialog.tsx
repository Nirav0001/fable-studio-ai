"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarPlus, Check, Clapperboard, Loader2, Sparkles } from "lucide-react";
import type { ChannelSummary, UpcomingSlot, VideoSummary } from "@fable/shared";
import { formatDuration } from "@fable/shared";
import { api } from "@/lib/api";
import { cn, CHANNEL_TYPE_META, scoreColor } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

interface ScheduleVideoDialogProps {
  /** The cell datetime the user clicked (hour precision). Null while closed. */
  at: Date | null;
  /** Active channel filter — "all" means no filter. */
  channelId: string;
  channels: ChannelSummary[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Pick a render-ready video and drop it into the clicked calendar cell. */
export function ScheduleVideoDialog({
  at,
  channelId,
  channels,
  open,
  onOpenChange,
}: ScheduleVideoDialogProps) {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [time, setTime] = useState("12:00");

  useEffect(() => {
    if (!open || !at) return;
    setSelectedId(null);
    setTime(format(at, "HH:mm"));
  }, [open, at]);

  const ready = useQuery({
    queryKey: ["videos", "ready", channelId],
    queryFn: () =>
      api.get<VideoSummary[]>(
        `/videos?status=ready${channelId !== "all" ? `&channelId=${channelId}` : ""}`,
      ),
    enabled: open,
  });

  const channelById = useMemo(() => {
    const map = new Map<string, ChannelSummary>();
    for (const c of channels) map.set(c.id, c);
    return map;
  }, [channels]);

  const selected = (ready.data ?? []).find((v) => v.id === selectedId) ?? null;

  const schedule = useMutation({
    mutationFn: (when: Date) =>
      api.post<UpcomingSlot>(`/schedule`, {
        channelId: selected?.channelId,
        videoId: selected?.id,
        scheduledAt: when.toISOString(),
      }),
    onSuccess: (_slot, when) => {
      toast.success("Scheduled", {
        description: `"${selected?.title}" goes live ${format(when, "EEE d MMM 'at' HH:mm")}.`,
      });
      void qc.invalidateQueries({ queryKey: ["schedule"] });
      void qc.invalidateQueries({ queryKey: ["videos"] });
      onOpenChange(false);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to schedule"),
  });

  const submit = () => {
    if (!at || !selected) return;
    const [h, m] = time.split(":").map((n) => Number.parseInt(n, 10));
    const when = new Date(at);
    when.setHours(Number.isNaN(h) ? at.getHours() : h, Number.isNaN(m) ? 0 : m, 0, 0);
    if (when.getTime() <= Date.now()) {
      toast.error("That time is in the past — pick a later time");
      return;
    }
    schedule.mutate(when);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarPlus className="h-5 w-5 text-primary" />
            Schedule a video
          </DialogTitle>
          <DialogDescription>
            {at ? `Pick a ready Short for ${format(at, "EEEE d MMMM")}.` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="grid grid-cols-2 items-end gap-3">
            <div className="space-y-1.5">
              <Label>Date</Label>
              <div className="flex h-9 items-center rounded-xl border border-input bg-secondary/40 px-3 text-sm text-muted-foreground">
                {at ? format(at, "EEE d MMM yyyy") : "—"}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cell-time">Time</Label>
              <Input
                id="cell-time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>
              Ready videos{ready.data ? ` (${ready.data.length})` : ""}
            </Label>

            {ready.isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full rounded-xl" />
                ))}
              </div>
            ) : (ready.data ?? []).length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border/70 bg-secondary/20 px-4 py-6 text-center">
                <Clapperboard className="h-6 w-6 text-muted-foreground" />
                <p className="text-sm font-medium">No ready videos</p>
                <p className="text-xs text-muted-foreground">
                  Approve a rendered AI project first — it lands here as a ready Short.
                </p>
                <Button asChild variant="outline" size="sm" className="mt-1">
                  <Link href="/projects">
                    <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                    Go to AI Projects
                  </Link>
                </Button>
              </div>
            ) : (
              <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
                {(ready.data ?? []).map((video) => {
                  const channel = channelById.get(video.channelId);
                  const meta = CHANNEL_TYPE_META[channel?.type ?? "wyr"] ?? CHANNEL_TYPE_META.wyr;
                  const active = selectedId === video.id;
                  return (
                    <button
                      key={video.id}
                      type="button"
                      onClick={() => setSelectedId(active ? null : video.id)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-xl border p-2 text-left transition-colors",
                        active
                          ? "border-primary/60 bg-primary/10"
                          : "border-border/60 bg-secondary/30 hover:border-primary/30 hover:bg-secondary/60",
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-lg",
                          meta.gradient,
                        )}
                      >
                        {meta.emoji}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{video.title}</span>
                        <span className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                          <span
                            className="h-1.5 w-1.5 shrink-0 rounded-full"
                            style={{ backgroundColor: channel?.avatarColor ?? "#8b5cf6" }}
                          />
                          <span className="truncate">{video.channelName ?? channel?.name ?? "Channel"}</span>
                          <span className="tabular-nums">{formatDuration(video.durationSec)}</span>
                          <span className={cn("font-semibold tabular-nums", scoreColor(video.viralScore))}>
                            {video.viralScore}
                          </span>
                        </span>
                      </span>
                      {active && <Check className="h-4 w-4 shrink-0 text-primary" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={schedule.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!selected || schedule.isPending}>
            {schedule.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Schedule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
