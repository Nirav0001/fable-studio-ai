"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Crown, MousePointerClick } from "lucide-react";
import type { ThumbnailVariant } from "@fable/shared";
import { cn } from "@/lib/utils";

const STYLE_LABELS: Record<ThumbnailVariant["style"], string> = {
  bold: "Bold",
  glow: "Glow",
  arrow: "Arrow",
  face: "Face",
  split: "Split",
};

interface ThumbnailGridProps {
  thumbnails: ThumbnailVariant[];
}

/** CSS-gradient previews of the AI thumbnail variants with primary selection. */
export function ThumbnailGrid({ thumbnails }: ThumbnailGridProps) {
  const defaultPrimary = useMemo(() => {
    if (thumbnails.length === 0) return null;
    return [...thumbnails].sort((a, b) => b.predictedCtr - a.predictedCtr)[0].id;
  }, [thumbnails]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const primaryId = selectedId ?? defaultPrimary;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        The primary variant is used for the rendered Short — CTR is the AI&apos;s click-through
        prediction.
      </p>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {thumbnails.map((t, i) => {
          const primary = t.id === primaryId;
          return (
            <motion.button
              key={t.id}
              type="button"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.06 }}
              onClick={() => {
                setSelectedId(t.id);
                toast.success("Primary thumbnail set", { description: t.headline });
              }}
              className={cn(
                "group relative overflow-hidden rounded-2xl border text-left transition-all",
                primary
                  ? "border-primary/70 ring-2 ring-primary/50 shadow-lg shadow-primary/20"
                  : "border-border/60 hover:border-primary/40",
              )}
            >
              {/* ── Gradient preview (9:16) ─────────────────────────── */}
              <div
                className="relative flex aspect-[9/16] flex-col items-center justify-center gap-2 p-3"
                style={{ background: `linear-gradient(160deg, ${t.bgFrom}, ${t.bgTo})` }}
              >
                <span className="text-4xl drop-shadow-lg transition-transform duration-300 group-hover:scale-110">
                  {t.emoji}
                </span>
                <span
                  className="text-center text-lg font-black uppercase leading-tight tracking-tight text-white"
                  style={{ textShadow: "0 2px 12px rgba(0,0,0,0.6)" }}
                >
                  {t.headline}
                </span>
                {t.subtext && (
                  <span
                    className="rounded-md px-1.5 py-0.5 text-center text-[11px] font-bold"
                    style={{ backgroundColor: t.accentColor, color: "#fff" }}
                  >
                    {t.subtext}
                  </span>
                )}

                {/* CTR badge */}
                <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-white backdrop-blur-sm">
                  <MousePointerClick className="h-2.5 w-2.5" />
                  {t.predictedCtr.toFixed(1)}% CTR
                </span>

                {/* Style badge */}
                <span className="absolute bottom-2 left-2 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white/90 backdrop-blur-sm">
                  {STYLE_LABELS[t.style] ?? t.style}
                </span>

                {primary && (
                  <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-md gradient-primary px-1.5 py-0.5 text-[10px] font-bold text-white shadow-md">
                    <Crown className="h-2.5 w-2.5" />
                    Primary
                  </span>
                )}
              </div>

              {/* ── Footer ──────────────────────────────────────────── */}
              <div className="bg-secondary/40 px-3 py-2 backdrop-blur-sm">
                <p className={cn("text-[11px] font-medium", primary ? "text-violet-300" : "text-muted-foreground")}>
                  {primary ? "Selected as primary" : "Click to make primary"}
                </p>
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
