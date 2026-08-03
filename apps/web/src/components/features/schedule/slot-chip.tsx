"use client";

import { useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import { format } from "date-fns";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarX2, Clock, Eye, Loader2, UploadCloud } from "lucide-react";
import type { ChannelSummary, SlotStatus, UpcomingSlot } from "@fable/shared";
import { formatCompact, formatDuration } from "@fable/shared";
import { api } from "@/lib/api";
import { cn, CHANNEL_TYPE_META } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "@/components/widgets/status-badge";
import { ScoreDial } from "@/components/widgets/score-dial";

/** Tiny status dot colors for the compact calendar chips. */
export const SLOT_STATUS_DOT: Record<SlotStatus, string> = {
  scheduled: "bg-sky-400",
  queued: "bg-violet-400",
  uploading: "bg-blue-400",
  uploaded: "bg-emerald-400",
  failed: "bg-red-400",
  cancelled: "bg-zinc-500",
};

/** Presentational chip body — reused by the in-grid chip and the DragOverlay clone. */
export function SlotChipContent({
  slot,
  color,
  dimmed,
  dragging,
}: {
  slot: UpcomingSlot;
  color: string;
  dimmed?: boolean;
  dragging?: boolean;
}) {
  return (
    <span
      className={cn(
        "flex w-full items-center gap-1.5 rounded-lg border px-1.5 py-1 text-left text-[11px] leading-tight",
        dimmed && "opacity-50 saturate-50",
        dragging && "shadow-2xl ring-1 ring-primary/50",
      )}
      style={{ borderColor: `${color}59`, backgroundColor: `${color}24` }}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      <span className="shrink-0 font-semibold tabular-nums text-foreground/90">
        {format(new Date(slot.scheduledAt), "HH:mm")}
      </span>
      <span className="min-w-0 flex-1 truncate text-foreground/75">
        {slot.video?.title ?? "Empty slot"}
      </span>
      {slot.status === "uploading" ? (
        <Loader2 className="h-2.5 w-2.5 shrink-0 animate-spin text-blue-300" />
      ) : (
        <span
          className={cn("h-1.5 w-1.5 shrink-0 rounded-full", SLOT_STATUS_DOT[slot.status] ?? "bg-zinc-500")}
        />
      )}
    </span>
  );
}

interface SlotChipProps {
  slot: UpcomingSlot;
  channel?: ChannelSummary;
  /** Uploaded / cancelled / past slots render dimmed. */
  dimmed: boolean;
  /** Only pending future slots can be dragged to a new cell. */
  draggable: boolean;
}

/** A draggable calendar chip with a click popover (video info + quick actions). */
export function SlotChip({ slot, channel, dimmed, draggable }: SlotChipProps) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const color = channel?.avatarColor ?? "#8b5cf6";
  const meta = CHANNEL_TYPE_META[channel?.type ?? "wyr"] ?? CHANNEL_TYPE_META.wyr;

  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({
    id: slot.id,
    data: { slot },
    disabled: !draggable,
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["schedule"] });
    void qc.invalidateQueries({ queryKey: ["videos"] });
  };

  const uploadNow = useMutation({
    mutationFn: () => api.post(`/videos/${slot.video?.id}/upload`),
    onSuccess: () => {
      toast.success("Upload started", {
        description: slot.video ? `"${slot.video.title}" is uploading now.` : undefined,
      });
      setOpen(false);
      invalidate();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Upload failed to start"),
  });

  const unschedule = useMutation({
    mutationFn: () => api.delete(`/schedule/${slot.id}`),
    onSuccess: () => {
      toast.success("Slot removed", {
        description: slot.video ? "The video is back in Ready." : "The empty slot was deleted.",
      });
      setOpen(false);
      invalidate();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to remove slot"),
  });

  const canUploadNow =
    Boolean(slot.video) && (slot.status === "scheduled" || slot.status === "failed");
  const canUnschedule = slot.status !== "uploading" && slot.status !== "uploaded";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          ref={setNodeRef}
          type="button"
          {...listeners}
          {...attributes}
          onClick={(e) => e.stopPropagation()}
          style={{ touchAction: "none" }}
          className={cn(
            "block w-full rounded-lg outline-none transition-opacity focus-visible:ring-2 focus-visible:ring-ring",
            draggable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
            isDragging && "opacity-30",
          )}
          aria-label={`${format(new Date(slot.scheduledAt), "HH:mm")} — ${slot.video?.title ?? "empty slot"}`}
        >
          <SlotChipContent slot={slot} color={color} dimmed={dimmed && !isDragging} />
        </button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-72 p-3.5" onClick={(e) => e.stopPropagation()}>
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-2">
            <p className="line-clamp-2 text-sm font-semibold leading-snug">
              {slot.video?.title ?? "Empty slot"}
            </p>
            {slot.video && <ScoreDial score={slot.video.viralScore} size={36} />}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <StatusBadge status={slot.status} />
            <span className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-secondary/50 px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
              <Clock className="h-3 w-3" />
              {format(new Date(slot.scheduledAt), "EEE d MMM, HH:mm")}
            </span>
            {slot.video && slot.video.durationSec > 0 && (
              <span className="rounded-md border border-border/60 bg-secondary/50 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
                {formatDuration(slot.video.durationSec)}
              </span>
            )}
            {slot.video?.status === "published" && slot.video.views !== undefined && (
              <span className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-secondary/50 px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                <Eye className="h-3 w-3" />
                {formatCompact(slot.video.views)}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
            <span className="truncate font-medium text-foreground/85">
              {slot.channelName ?? channel?.name ?? "Channel"}
            </span>
            <span>{meta.emoji}</span>
          </div>

          {(canUploadNow || canUnschedule) && (
            <>
              <Separator />
              <div className="flex items-center gap-2">
                {canUploadNow && (
                  <Button
                    size="sm"
                    className="flex-1"
                    disabled={uploadNow.isPending}
                    onClick={() => uploadNow.mutate()}
                  >
                    {uploadNow.isPending ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <UploadCloud className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    Upload now
                  </Button>
                )}
                {canUnschedule && (
                  <Button
                    size="sm"
                    variant="outline"
                    className={cn(!canUploadNow && "flex-1", "text-red-300 hover:text-red-200")}
                    disabled={unschedule.isPending}
                    onClick={() => unschedule.mutate()}
                  >
                    {unschedule.isPending ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <CalendarX2 className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    Unschedule
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
