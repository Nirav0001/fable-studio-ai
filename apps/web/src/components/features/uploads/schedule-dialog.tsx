"use client";

import { useEffect, useState } from "react";
import { addDays, addHours, format, startOfHour } from "date-fns";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarClock, Loader2 } from "lucide-react";
import type { UpcomingSlot, VideoSummary } from "@fable/shared";
import { api } from "@/lib/api";
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

interface ScheduleDialogProps {
  video: VideoSummary | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const QUICK_PICKS: { label: string; compute: (now: Date) => Date }[] = [
  { label: "In 1 hour", compute: (now) => startOfHour(addHours(now, 1)) },
  {
    label: "Tonight 18:00",
    compute: (now) => {
      const d = new Date(now);
      d.setHours(18, 0, 0, 0);
      return d.getTime() > now.getTime() ? d : addDays(d, 1);
    },
  },
  {
    label: "Tomorrow 09:00",
    compute: (now) => {
      const d = addDays(new Date(now), 1);
      d.setHours(9, 0, 0, 0);
      return d;
    },
  },
];

export function ScheduleDialog({ video, open, onOpenChange }: ScheduleDialogProps) {
  const qc = useQueryClient();
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");

  // Re-seed sensible defaults each time the dialog opens for a video.
  useEffect(() => {
    if (!open) return;
    const def = startOfHour(addHours(new Date(), 1));
    setDate(format(def, "yyyy-MM-dd"));
    setTime(format(def, "HH:mm"));
  }, [open, video?.id]);

  const schedule = useMutation({
    mutationFn: (when: Date) =>
      api.post<UpcomingSlot>(`/schedule`, {
        channelId: video?.channelId,
        videoId: video?.id,
        scheduledAt: when.toISOString(),
      }),
    onSuccess: (_slot, when) => {
      toast.success("Scheduled", {
        description: `"${video?.title}" goes live ${format(when, "EEE d MMM 'at' HH:mm")}.`,
      });
      void qc.invalidateQueries({ queryKey: ["videos"] });
      void qc.invalidateQueries({ queryKey: ["schedule"] });
      onOpenChange(false);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to schedule"),
  });

  const submit = () => {
    if (!video) return;
    const when = new Date(`${date}T${time || "00:00"}:00`);
    if (Number.isNaN(when.getTime())) {
      toast.error("Pick a valid date and time");
      return;
    }
    if (when.getTime() <= Date.now()) {
      toast.error("That time is in the past — pick a future slot");
      return;
    }
    schedule.mutate(when);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-primary" />
            Schedule upload
          </DialogTitle>
          <DialogDescription className="line-clamp-2">
            {video ? `"${video.title}" will upload automatically at the chosen time.` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex flex-wrap gap-1.5">
            {QUICK_PICKS.map((qp) => (
              <button
                key={qp.label}
                type="button"
                className="rounded-full border border-border/60 bg-secondary/40 px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-foreground"
                onClick={() => {
                  const when = qp.compute(new Date());
                  setDate(format(when, "yyyy-MM-dd"));
                  setTime(format(when, "HH:mm"));
                }}
              >
                {qp.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="sched-date">Date</Label>
              <Input
                id="sched-date"
                type="date"
                value={date}
                min={format(new Date(), "yyyy-MM-dd")}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sched-time">Time</Label>
              <Input
                id="sched-time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={schedule.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={schedule.isPending || !date || !time}>
            {schedule.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Schedule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
