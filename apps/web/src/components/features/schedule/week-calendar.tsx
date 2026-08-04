"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { addDays, format, getDay, getHours, isToday } from "date-fns";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ChannelSummary, UpcomingSlot } from "@fable/shared";
import { clamp } from "@fable/shared";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { SlotChip, SlotChipContent } from "@/components/features/schedule/slot-chip";

export interface BestTime {
  day: number; // 0=Sun..6=Sat (heatmap convention)
  hour: number; // 0-23
  score: number;
}

const FIRST_HOUR = 6;
const LAST_HOUR = 22;
const HOURS = Array.from({ length: LAST_HOUR - FIRST_HOUR + 1 }, (_, i) => FIRST_HOUR + i);

/** Column index (Mon-first) for a JS/heatmap day number (0=Sun). */
function colForDay(day: number): number {
  return (day + 6) % 7;
}

interface WeekCalendarProps {
  weekStart: Date; // Monday 00:00
  slots: UpcomingSlot[];
  channels: ChannelSummary[];
  bestTimes: BestTime[];
  onCellClick: (at: Date) => void;
}

interface CellData {
  dayIso: string;
  hour: number;
}

function DayCell({
  dayIso,
  date,
  hour,
  past,
  today,
  best,
  children,
  onClick,
}: {
  dayIso: string;
  date: Date;
  hour: number;
  past: boolean;
  today: boolean;
  best: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `cell-${dayIso}-${hour}`,
    data: { dayIso, hour } satisfies CellData,
    disabled: past,
  });

  return (
    <div
      ref={setNodeRef}
      role="gridcell"
      aria-label={`${format(date, "EEE d MMM")} ${String(hour).padStart(2, "0")}:00`}
      onClick={past ? undefined : onClick}
      className={cn(
        "group/cell relative min-h-[44px] space-y-0.5 border-b border-r border-border/40 p-0.5 transition-colors",
        today && "bg-primary/[0.04]",
        best && !past && "bg-violet-500/[0.06] ring-1 ring-inset ring-violet-500/30",
        past ? "cursor-default opacity-45" : "cursor-pointer hover:bg-accent/25",
        isOver && !past && "bg-primary/15 ring-1 ring-inset ring-primary/60",
      )}
    >
      {children}
      {!past && (
        <span className="pointer-events-none absolute inset-x-1 bottom-0.5 hidden text-center text-[9px] font-medium text-primary/70 group-hover/cell:block">
          + schedule
        </span>
      )}
    </div>
  );
}

/**
 * 7-day (Mon-Sun) × hourly (06:00-22:00) schedule grid with dnd-kit drag-drop
 * rescheduling, best-time highlighting and click-to-schedule empty cells.
 */
export function WeekCalendar({ weekStart, slots, channels, bestTimes, onCellClick }: WeekCalendarProps) {
  const qc = useQueryClient();
  const [activeSlot, setActiveSlot] = useState<UpcomingSlot | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const channelById = useMemo(() => {
    const map = new Map<string, ChannelSummary>();
    for (const c of channels) map.set(c.id, c);
    return map;
  }, [channels]);

  /** Slots bucketed per cell, keyed `col-hour` (hours clamped into the visible band). */
  const byCell = useMemo(() => {
    const map = new Map<string, UpcomingSlot[]>();
    for (const slot of slots) {
      const at = new Date(slot.scheduledAt);
      if (Number.isNaN(at.getTime())) continue;
      const key = `${colForDay(getDay(at))}-${clamp(getHours(at), FIRST_HOUR, LAST_HOUR)}`;
      const list = map.get(key) ?? [];
      list.push(slot);
      map.set(key, list);
    }
    Array.from(map.values()).forEach((list) => {
      list.sort((a, b) => (a.scheduledAt < b.scheduledAt ? -1 : 1));
    });
    return map;
  }, [slots]);

  const bestSet = useMemo(() => {
    const set = new Set<string>();
    for (const bt of bestTimes) set.add(`${colForDay(bt.day)}-${bt.hour}`);
    return set;
  }, [bestTimes]);

  const reschedule = useMutation({
    mutationFn: ({ id, scheduledAt }: { id: string; scheduledAt: string; title?: string }) =>
      api.patch<UpcomingSlot>(`/schedule/${id}`, { scheduledAt }),
    onMutate: async ({ id, scheduledAt }) => {
      await qc.cancelQueries({ queryKey: ["schedule"] });
      const previous = qc.getQueriesData<UpcomingSlot[]>({ queryKey: ["schedule"] });
      qc.setQueriesData<UpcomingSlot[]>({ queryKey: ["schedule"] }, (old) =>
        old?.map((s) => (s.id === id ? { ...s, scheduledAt } : s)),
      );
      return { previous };
    },
    onSuccess: (_data, vars) => {
      toast.success("Rescheduled", {
        description: `${vars.title ? `"${vars.title}"` : "Slot"} moved to ${format(
          new Date(vars.scheduledAt),
          "EEE d MMM 'at' HH:mm",
        )}.`,
      });
    },
    onError: (err, _vars, ctx) => {
      for (const [key, data] of ctx?.previous ?? []) qc.setQueryData(key, data);
      toast.error(err instanceof Error ? err.message : "Failed to reschedule");
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["schedule"] });
    },
  });

  const handleDragStart = (event: DragStartEvent) => {
    const slot = (event.active.data.current as { slot?: UpcomingSlot } | undefined)?.slot;
    setActiveSlot(slot ?? null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveSlot(null);
    const slot = (event.active.data.current as { slot?: UpcomingSlot } | undefined)?.slot;
    const cell = event.over?.data.current as CellData | undefined;
    if (!slot || !cell) return;

    const original = new Date(slot.scheduledAt);
    const next = new Date(`${cell.dayIso}T00:00:00`);
    next.setHours(cell.hour, original.getMinutes(), 0, 0);
    if (next.getTime() === original.getTime()) return;
    if (next.getTime() <= Date.now()) {
      toast.error("That slot is in the past — drop it on a future cell.");
      return;
    }
    reschedule.mutate({ id: slot.id, scheduledAt: next.toISOString(), title: slot.video?.title });
  };

  const now = Date.now();

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveSlot(null)}
    >
      <div className="glass overflow-hidden rounded-2xl">
        <div className="overflow-x-auto">
          <div role="grid" aria-label="Weekly upload schedule" className="min-w-[880px]">
            {/* ── Day headers ─────────────────────────────────────────── */}
            <div className="grid grid-cols-[56px_repeat(7,minmax(104px,1fr))] border-b border-border/60">
              <div className="sticky left-0 z-20 border-r border-border/40 bg-popover/95 backdrop-blur-sm" />
              {days.map((day) => {
                const today = isToday(day);
                return (
                  <div
                    key={day.toISOString()}
                    className={cn(
                      "border-r border-border/40 px-2 py-2.5 text-center",
                      today && "bg-primary/[0.07]",
                    )}
                  >
                    <p
                      className={cn(
                        "text-[11px] font-semibold uppercase tracking-wide",
                        today ? "text-primary" : "text-muted-foreground",
                      )}
                    >
                      {format(day, "EEE")}
                    </p>
                    <p
                      className={cn(
                        "mt-0.5 text-sm font-bold tabular-nums",
                        today ? "gradient-text" : "text-foreground/85",
                      )}
                    >
                      {format(day, "d")}
                    </p>
                  </div>
                );
              })}
            </div>

            {/* ── Hour rows ───────────────────────────────────────────── */}
            {HOURS.map((hour) => (
              <div key={hour} className="grid grid-cols-[56px_repeat(7,minmax(104px,1fr))]">
                <div className="sticky left-0 z-20 flex items-start justify-end border-b border-r border-border/40 bg-popover/95 pr-2 pt-1 backdrop-blur-sm">
                  <span className="text-[10px] font-medium tabular-nums text-muted-foreground">
                    {String(hour).padStart(2, "0")}:00
                  </span>
                </div>
                {days.map((day, col) => {
                  const dayIso = format(day, "yyyy-MM-dd");
                  const cellEnd = new Date(day);
                  cellEnd.setHours(hour + 1, 0, 0, 0);
                  const past = cellEnd.getTime() <= now;
                  const cellSlots = byCell.get(`${col}-${hour}`) ?? [];

                  return (
                    <DayCell
                      key={`${dayIso}-${hour}`}
                      dayIso={dayIso}
                      date={day}
                      hour={hour}
                      past={past}
                      today={isToday(day)}
                      best={bestSet.has(`${col}-${hour}`)}
                      onClick={() => {
                        const at = new Date(day);
                        at.setHours(hour, 0, 0, 0);
                        onCellClick(at);
                      }}
                    >
                      {cellSlots.map((slot) => {
                        const slotPast = new Date(slot.scheduledAt).getTime() <= now;
                        const settled =
                          slot.status === "uploaded" || slot.status === "cancelled";
                        return (
                          <SlotChip
                            key={slot.id}
                            slot={slot}
                            channel={channelById.get(slot.channelId)}
                            dimmed={settled || slotPast}
                            draggable={
                              !slotPast &&
                              (slot.status === "scheduled" || slot.status === "failed")
                            }
                          />
                        );
                      })}
                    </DayCell>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      <DragOverlay>
        {activeSlot && (
          <div className="w-44">
            <SlotChipContent
              slot={activeSlot}
              color={channelById.get(activeSlot.channelId)?.avatarColor ?? "#8b5cf6"}
              dragging
            />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
