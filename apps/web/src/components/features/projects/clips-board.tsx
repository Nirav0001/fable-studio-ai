"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, ChevronDown, Clock, Loader2, Quote, X } from "lucide-react";
import { formatDuration } from "@fable/shared";
import { api } from "@/lib/api";
import { EASE_OUT } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScoreDial } from "@/components/widgets/score-dial";
import { StatusBadge } from "@/components/widgets/status-badge";
import type { ClipT } from "./types";

interface ClipsBoardProps {
  projectId: string;
  clips: ClipT[];
  disabled?: boolean;
}

const BREAKDOWN_LABELS: Record<string, string> = {
  humor: "Humor",
  shock: "Shock",
  emotion: "Emotion",
  drama: "Drama",
  informativeness: "Info",
  energy: "Energy",
  hookStrength: "Hook",
};

/** Score-sorted clip cards with keep / discard triage. */
export function ClipsBoard({ projectId, clips, disabled = false }: ClipsBoardProps) {
  const qc = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const sorted = useMemo(() => [...clips].sort((a, b) => b.score - a.score), [clips]);
  const keptCount = useMemo(() => clips.filter((c) => c.status === "kept").length, [clips]);

  const setStatus = useMutation({
    mutationFn: ({ clipId, status }: { clipId: string; status: "kept" | "discarded" }) =>
      api.patch(`/projects/${projectId}/clips/${clipId}`, { status }),
    onSuccess: (_data, vars) => {
      toast.success(vars.status === "kept" ? "Clip kept" : "Clip discarded");
      void qc.invalidateQueries({ queryKey: ["project", projectId] });
      void qc.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to update clip"),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">{keptCount}</span> of {clips.length} clips
          kept — each kept clip becomes its own Short on approve.
        </p>
      </div>

      <div className="space-y-3">
        {sorted.map((clip, i) => {
          const kept = clip.status === "kept";
          const discarded = clip.status === "discarded";
          const expanded = expandedId === clip.id;
          const pendingThis = setStatus.isPending && setStatus.variables?.clipId === clip.id;
          const topTraits = Object.entries(clip.breakdown ?? {})
            .filter((e): e is [string, number] => typeof e[1] === "number")
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3);

          return (
            <motion.div
              key={clip.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: EASE_OUT, delay: Math.min(i, 10) * 0.04 }}
            >
              <div
                className={cn(
                  "glass rounded-2xl p-4 transition-[color,background-color,border-color,box-shadow,opacity]",
                  kept && "border-emerald-500/40 bg-emerald-500/[0.04] ring-1 ring-emerald-500/25",
                  discarded && "opacity-55",
                )}
              >
                <div className="flex items-start gap-4">
                  <div className="shrink-0 pt-0.5">
                    <ScoreDial score={clip.score} size={48} />
                  </div>

                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-sm font-semibold leading-snug">{clip.title}</h4>
                      <StatusBadge status={clip.status} />
                    </div>

                    {clip.hook && (
                      <p className="flex items-start gap-1.5 text-xs italic text-muted-foreground">
                        <Quote className="mt-0.5 h-3 w-3 shrink-0 text-violet-400" />
                        {clip.hook}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-secondary/50 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
                        <Clock className="h-2.5 w-2.5" />
                        {formatDuration(clip.startSec)} – {formatDuration(clip.endSec)}
                        <span className="text-muted-foreground/60">
                          ({Math.round(clip.endSec - clip.startSec)}s)
                        </span>
                      </span>
                      {topTraits.map(([key, value]) => (
                        <span
                          key={key}
                          className="rounded-md border border-violet-500/25 bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-medium text-violet-300"
                        >
                          {BREAKDOWN_LABELS[key] ?? key} {Math.round(value)}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-col gap-1.5 sm:flex-row">
                    <Button
                      size="sm"
                      variant={kept ? "default" : "secondary"}
                      className="h-8 gap-1 px-3 text-xs"
                      disabled={disabled || pendingThis || kept}
                      onClick={() => setStatus.mutate({ clipId: clip.id, status: "kept" })}
                    >
                      {pendingThis && setStatus.variables?.status === "kept" ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Check className="h-3.5 w-3.5" />
                      )}
                      Keep
                    </Button>
                    <Button
                      size="sm"
                      variant={discarded ? "destructive" : "ghost"}
                      className="h-8 gap-1 px-3 text-xs"
                      disabled={disabled || pendingThis || discarded}
                      onClick={() => setStatus.mutate({ clipId: clip.id, status: "discarded" })}
                    >
                      {pendingThis && setStatus.variables?.status === "discarded" ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <X className="h-3.5 w-3.5" />
                      )}
                      Discard
                    </Button>
                  </div>
                </div>

                {/* ── Expandable transcript ──────────────────────────── */}
                {clip.transcript && (
                  <div className="mt-3 border-t border-border/50 pt-2.5">
                    <button
                      type="button"
                      onClick={() => setExpandedId(expanded ? null : clip.id)}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <ChevronDown
                        className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-180")}
                      />
                      {expanded ? "Hide transcript" : "Show transcript"}
                    </button>
                    <div
                      className={cn(
                        "grid transition-[grid-template-rows,opacity] duration-200 ease-[var(--ease-out)]",
                        expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
                      )}
                    >
                      <div className="overflow-hidden">
                        <p className="mt-2 whitespace-pre-wrap rounded-lg bg-secondary/40 p-3 text-xs leading-relaxed text-muted-foreground">
                          {clip.transcript}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
