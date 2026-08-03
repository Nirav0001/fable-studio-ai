import { cn, STATUS_COLORS } from "@/lib/utils";

/** Statuses that get a pulsing "live" dot because work is in flight. */
const LIVE_STATUSES = new Set(["generating", "rendering", "uploading", "queued"]);

export interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const tone = STATUS_COLORS[status] ?? "bg-zinc-500/15 text-zinc-300 border-zinc-500/30";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize",
        tone,
        className,
      )}
    >
      {LIVE_STATUSES.has(status) && (
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" aria-hidden />
      )}
      {status}
    </span>
  );
}
