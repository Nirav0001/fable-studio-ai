"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarClock, Loader2, Plus, X } from "lucide-react";
import type { WeeklySchedule } from "@fable/shared";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** Display order Monday → Sunday; keys follow the WeeklySchedule 0=Sun..6=Sat convention. */
const DAYS: { key: string; label: string; short: string }[] = [
  { key: "1", label: "Monday", short: "Mon" },
  { key: "2", label: "Tuesday", short: "Tue" },
  { key: "3", label: "Wednesday", short: "Wed" },
  { key: "4", label: "Thursday", short: "Thu" },
  { key: "5", label: "Friday", short: "Fri" },
  { key: "6", label: "Saturday", short: "Sat" },
  { key: "0", label: "Sunday", short: "Sun" },
];

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function normalizeSchedule(raw: WeeklySchedule | undefined): WeeklySchedule {
  const out: WeeklySchedule = {};
  for (const day of DAYS) {
    const times = raw?.[day.key];
    out[day.key] = Array.isArray(times)
      ? Array.from(new Set(times.filter((t) => TIME_RE.test(t)))).sort((a, b) =>
          a.localeCompare(b),
        )
      : [];
  }
  return out;
}

export function ScheduleEditor({
  channelId,
  schedule,
}: {
  channelId: string;
  schedule: WeeklySchedule | undefined;
}) {
  const qc = useQueryClient();
  const [week, setWeek] = useState<WeeklySchedule>(() => normalizeSchedule(schedule));
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [draftTime, setDraftTime] = useState("18:00");

  const save = useMutation({
    mutationFn: (next: WeeklySchedule) => api.patch(`/channels/${channelId}`, { schedule: next }),
    onSuccess: () => {
      toast.success("Schedule updated");
      qc.invalidateQueries({ queryKey: ["channel", channelId] });
      qc.invalidateQueries({ queryKey: ["schedule"] });
    },
    onMutate: (next) => {
      const previous = week;
      setWeek(next);
      return { previous };
    },
    onError: (err, _next, context) => {
      // Roll back the optimistic update so the grid matches the server again.
      if (context) setWeek(context.previous);
      toast.error(err instanceof ApiError ? err.message : "Could not save schedule");
    },
  });

  const addTime = (dayKey: string) => {
    if (!TIME_RE.test(draftTime)) {
      toast.error("Pick a valid time first");
      return;
    }
    if (week[dayKey].includes(draftTime)) {
      toast.error("That time is already scheduled");
      return;
    }
    const next: WeeklySchedule = {
      ...week,
      [dayKey]: [...week[dayKey], draftTime].sort((a, b) => a.localeCompare(b)),
    };
    setOpenDay(null);
    save.mutate(next);
  };

  const removeTime = (dayKey: string, time: string) => {
    const next: WeeklySchedule = { ...week, [dayKey]: week[dayKey].filter((t) => t !== time) };
    save.mutate(next);
  };

  const totalPerWeek = DAYS.reduce((sum, d) => sum + week[d.key].length, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <CalendarClock className="h-4 w-4 text-primary" />
          <span>
            <span className="font-semibold text-foreground tabular-nums">{totalPerWeek}</span>{" "}
            upload{totalPerWeek === 1 ? "" : "s"} per week — auto-fill and automation post into
            these slots.
          </span>
        </div>
        {save.isPending && (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Saving…
          </span>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {DAYS.map((day) => (
          <div key={day.key} className="glass flex flex-col rounded-2xl p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">
                <span className="xl:hidden">{day.label}</span>
                <span className="hidden xl:inline">{day.short}</span>
              </span>
              <span className="text-[11px] tabular-nums text-muted-foreground">
                {week[day.key].length}
              </span>
            </div>

            <div className="mt-2.5 flex flex-1 flex-col gap-1.5">
              {week[day.key].length === 0 && (
                <p className="rounded-lg border border-dashed border-border/60 px-2 py-2.5 text-center text-[11px] text-muted-foreground/70">
                  No uploads
                </p>
              )}
              {week[day.key].map((time) => (
                <span
                  key={time}
                  className="group inline-flex items-center justify-between gap-1 rounded-lg border border-primary/25 bg-primary/10 px-2 py-1 text-xs font-medium tabular-nums text-violet-200"
                >
                  {time}
                  <button
                    type="button"
                    aria-label={`Remove ${day.label} ${time} slot`}
                    className="rounded p-0.5 text-violet-300/60 transition-colors hover:bg-primary/20 hover:text-white"
                    onClick={() => removeTime(day.key, time)}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>

            <Popover
              open={openDay === day.key}
              onOpenChange={(open) => {
                setOpenDay(open ? day.key : null);
                if (open) setDraftTime("18:00");
              }}
            >
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "mt-2 h-7 w-full gap-1 text-xs text-muted-foreground",
                    "hover:text-foreground",
                  )}
                >
                  <Plus className="h-3 w-3" /> Add time
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-56" align="center">
                <div className="space-y-3">
                  <Label htmlFor={`time-${day.key}`} className="text-xs">
                    New slot — {day.label}
                  </Label>
                  <Input
                    id={`time-${day.key}`}
                    type="time"
                    value={draftTime}
                    onChange={(e) => setDraftTime(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") addTime(day.key);
                    }}
                  />
                  <Button size="sm" className="w-full gap-1.5" onClick={() => addTime(day.key)}>
                    <Plus className="h-3 w-3" /> Add slot
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        ))}
      </div>
    </div>
  );
}
