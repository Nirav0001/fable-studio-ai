import { cn, CHANNEL_TYPE_META } from "@/lib/utils";

export interface ChannelChipProps {
  name: string;
  /** Channel avatar colour (hex), used for the mini avatar gradient. */
  color: string;
  /** Channel type: wyr | clips | top5 (unknown types render without emoji). */
  type: string;
  className?: string;
}

export function ChannelChip({ name, color, type, className }: ChannelChipProps) {
  const meta = CHANNEL_TYPE_META[type];
  const initial = (name.trim().charAt(0) || "?").toUpperCase();

  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-full border border-border/60 bg-secondary/40 py-0.5 pl-1 pr-2.5 text-xs font-medium",
        className,
      )}
      title={meta ? `${name} · ${meta.label}` : name}
    >
      <span
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white shadow-sm"
        style={{
          backgroundColor: color,
          backgroundImage:
            "linear-gradient(140deg, rgb(255 255 255 / 0.28), rgb(0 0 0 / 0.25))",
        }}
        aria-hidden
      >
        {initial}
      </span>
      <span className="truncate">{name}</span>
      {meta && (
        <span className="shrink-0 text-[11px] leading-none" aria-hidden>
          {meta.emoji}
        </span>
      )}
    </span>
  );
}
