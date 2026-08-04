"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { EASE_OUT, staggerDelay } from "@/lib/motion";
import { addDays, addWeeks, format, startOfWeek, subWeeks } from "date-fns";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarRange, ChevronLeft, ChevronRight, Loader2, Wand2 } from "lucide-react";
import type { ChannelSummary, UpcomingSlot } from "@fable/shared";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/widgets/page-header";
import {
  WeekCalendar,
  type BestTime,
} from "@/components/features/schedule/week-calendar";
import { SLOT_STATUS_DOT } from "@/components/features/schedule/slot-chip";
import { ScheduleVideoDialog } from "@/components/features/schedule/schedule-video-dialog";

const LEGEND: { label: string; dot: string }[] = [
  { label: "Scheduled", dot: SLOT_STATUS_DOT.scheduled },
  { label: "Uploading", dot: SLOT_STATUS_DOT.uploading },
  { label: "Uploaded", dot: SLOT_STATUS_DOT.uploaded },
  { label: "Failed", dot: SLOT_STATUS_DOT.failed },
];

export default function SchedulePage() {
  const qc = useQueryClient();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [channelId, setChannelId] = useState<string>("all");
  const [cellAt, setCellAt] = useState<Date | null>(null);

  const weekKey = format(weekStart, "yyyy-MM-dd");

  const channels = useQuery({
    queryKey: ["channels"],
    queryFn: () => api.get<ChannelSummary[]>("/channels"),
  });

  const slots = useQuery({
    queryKey: ["schedule", weekKey, channelId],
    queryFn: () => {
      const params = new URLSearchParams({
        from: weekStart.toISOString(),
        to: addDays(weekStart, 7).toISOString(),
      });
      if (channelId !== "all") params.set("channelId", channelId);
      return api.get<UpcomingSlot[]>(`/schedule?${params.toString()}`);
    },
    // Keep the grid on screen while flipping weeks; poll while an upload is live.
    placeholderData: keepPreviousData,
    refetchInterval: (query) =>
      query.state.data?.some((s) => s.status === "uploading" || s.status === "queued")
        ? 2000
        : false,
  });

  const suggestions = useQuery({
    queryKey: ["schedule-suggestions", channelId],
    queryFn: () =>
      api.get<{ bestTimes: BestTime[] }>(
        `/schedule/suggestions${channelId !== "all" ? `?channelId=${channelId}` : ""}`,
      ),
  });

  const autoFillTarget = useMemo(() => {
    const list = channels.data ?? [];
    if (channelId !== "all") return list.find((c) => c.id === channelId) ?? list[0];
    return list[0];
  }, [channels.data, channelId]);

  const autoFill = useMutation({
    mutationFn: () =>
      api.post<{ created: number }>(`/schedule/auto-fill`, {
        channelId: autoFillTarget?.id,
        days: 7,
      }),
    onSuccess: ({ created }) => {
      if (created > 0) {
        toast.success(`Auto-filled ${created} slot${created === 1 ? "" : "s"}`, {
          description: `Ready videos dropped into ${autoFillTarget?.name ?? "the channel"}'s best weekly times.`,
        });
      } else {
        toast.info("Nothing to fill", {
          description: "No ready videos left — approve a rendered project first.",
        });
      }
      void qc.invalidateQueries({ queryKey: ["schedule"] });
      void qc.invalidateQueries({ queryKey: ["videos"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Auto-fill failed"),
  });

  const weekLabel = `${format(weekStart, "d MMM")} – ${format(addDays(weekStart, 6), "d MMM yyyy")}`;
  const slotCount = slots.data?.length ?? 0;
  const initialLoading = slots.isLoading || channels.isLoading;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Schedule"
        description="Your week of uploads — drag slots to reschedule, click a cell to fill it."
        actions={
          <Button
            onClick={() => autoFill.mutate()}
            disabled={autoFill.isPending || !autoFillTarget}
            title={autoFillTarget ? `Fill ${autoFillTarget.name}'s weekly slots` : undefined}
          >
            {autoFill.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Wand2 className="mr-2 h-4 w-4" />
            )}
            Auto-fill week
          </Button>
        }
      />

      {/* ── Week nav + channel filter ─────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: EASE_OUT }}
        className="flex flex-wrap items-center gap-3"
      >
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            aria-label="Previous week"
            onClick={() => setWeekStart((w) => subWeeks(w, 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}
          >
            Today
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            aria-label="Next week"
            onClick={() => setWeekStart((w) => addWeeks(w, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <p className="inline-flex items-center gap-2 text-sm font-semibold text-foreground/90">
          <CalendarRange className="h-4 w-4 text-primary" />
          {weekLabel}
          {slots.isFetching && !slots.isLoading && (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          )}
        </p>

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setChannelId("all")}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
              channelId === "all"
                ? "border-primary/50 bg-primary/15 text-foreground"
                : "border-border/60 bg-secondary/40 text-muted-foreground hover:bg-secondary/70 hover:text-foreground",
            )}
          >
            All channels
          </button>
          {(channels.data ?? []).map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setChannelId((prev) => (prev === c.id ? "all" : c.id))}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                channelId === c.id
                  ? "border-primary/50 bg-primary/15 text-foreground"
                  : "border-border/60 bg-secondary/40 text-muted-foreground hover:bg-secondary/70 hover:text-foreground",
              )}
            >
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: c.avatarColor }} />
              {c.name}
            </button>
          ))}
        </div>
      </motion.div>

      {/* ── Legend ────────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: EASE_OUT, delay: staggerDelay(1) }}
        className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-muted-foreground"
      >
        <span className="font-medium text-foreground/70">
          {slotCount} slot{slotCount === 1 ? "" : "s"} this week
        </span>
        {LEGEND.map((l) => (
          <span key={l.label} className="inline-flex items-center gap-1.5">
            <span className={cn("h-1.5 w-1.5 rounded-full", l.dot)} />
            {l.label}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[4px] bg-violet-500/10 ring-1 ring-violet-500/40" />
          Suggested best time
        </span>
        <span className="hidden sm:inline">Drag a chip to reschedule · click an empty cell to add</span>
      </motion.div>

      {/* ── Empty-week hint ───────────────────────────────────────────── */}
      {!initialLoading && slotCount === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass flex flex-wrap items-center gap-3 rounded-2xl px-4 py-3"
        >
          <CalendarRange className="h-5 w-5 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Nothing scheduled this week</p>
            <p className="text-xs text-muted-foreground">
              Click any highlighted cell to place a ready Short, or let auto-fill use your channel&apos;s
              weekly plan.
            </p>
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => autoFill.mutate()}
            disabled={autoFill.isPending || !autoFillTarget}
          >
            {autoFill.isPending ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Wand2 className="mr-1.5 h-3.5 w-3.5" />
            )}
            Auto-fill
          </Button>
        </motion.div>
      )}

      {/* ── Calendar ──────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: EASE_OUT, delay: staggerDelay(2) }}
      >
        {initialLoading ? (
          <div className="glass space-y-0 overflow-hidden rounded-2xl p-0">
            <div className="flex gap-px border-b border-border/60 p-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className={cn("h-10", i === 0 ? "w-14" : "flex-1")} />
              ))}
            </div>
            <div className="space-y-1.5 p-2">
              {Array.from({ length: 10 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          </div>
        ) : (
          <WeekCalendar
            weekStart={weekStart}
            slots={slots.data ?? []}
            channels={channels.data ?? []}
            bestTimes={suggestions.data?.bestTimes ?? []}
            onCellClick={setCellAt}
          />
        )}
      </motion.div>

      <ScheduleVideoDialog
        at={cellAt}
        channelId={channelId}
        channels={channels.data ?? []}
        open={Boolean(cellAt)}
        onOpenChange={(o) => !o && setCellAt(null)}
      />
    </div>
  );
}
