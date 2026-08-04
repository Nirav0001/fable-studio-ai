"use client";

import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Cog, Loader2 } from "lucide-react";
import type { JobSummary } from "@fable/shared";
import { api } from "@/lib/api";
import { EASE_OUT } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

const JOB_LABELS: Record<string, string> = {
  "project.generate": "Generating project",
  "project.render": "Rendering video",
  "video.upload": "Uploading to YouTube",
  "analytics.sync": "Syncing analytics",
  "automation.tick": "Automation run",
};

export function QueuePanel() {
  const { data: jobs, isLoading } = useQuery({
    queryKey: ["jobs", "active"],
    queryFn: () => api.get<JobSummary[]>("/jobs/active"),
    refetchInterval: 2000,
  });

  const active = (jobs ?? []).filter((j) => j.status === "active").length;

  return (
    <section className="glass rounded-2xl p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="font-display text-sm font-semibold tracking-tight">Processing queue</h2>
          <p className="text-xs text-muted-foreground">Live render & upload pipeline</p>
        </div>
        <span
          className={cn(
            "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium",
            active > 0
              ? "border-violet-500/30 bg-violet-500/10 text-violet-300"
              : "border-border/70 bg-secondary/40 text-muted-foreground",
          )}
        >
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              active > 0 ? "animate-pulse-glow bg-violet-400" : "bg-muted-foreground/50",
            )}
          />
          {active > 0 ? `${active} running` : "idle"}
        </span>
      </div>

      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      )}

      {!isLoading && (jobs ?? []).length === 0 && (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <Cog className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm font-medium text-muted-foreground">Queue is idle</p>
          <p className="max-w-[240px] text-xs text-muted-foreground/70">
            Generations, renders and uploads appear here in real time.
          </p>
        </div>
      )}

      {!isLoading && (jobs ?? []).length > 0 && (
        <ul className="space-y-3">
          <AnimatePresence initial={false}>
            {(jobs ?? []).map((job) => (
              <motion.li
                key={job.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, transform: "scale(0.97)" }}
                transition={{ duration: 0.25, ease: EASE_OUT }}
                className="rounded-xl border border-border/60 bg-secondary/30 p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 truncate text-xs font-medium">
                    {job.status === "active" && (
                      <Loader2 className="h-3 w-3 shrink-0 animate-spin text-violet-400" />
                    )}
                    {JOB_LABELS[job.name] ?? job.name}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize",
                      job.status === "active"
                        ? "border-violet-500/30 bg-violet-500/10 text-violet-300"
                        : "border-zinc-500/30 bg-zinc-500/10 text-zinc-400",
                    )}
                  >
                    {job.status}
                  </span>
                </div>

                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
                  <motion.div
                    className="gradient-primary h-full w-full origin-left rounded-full"
                    initial={false}
                    animate={{
                      transform: `scaleX(${Math.max(2, Math.min(100, job.progress)) / 100})`,
                    }}
                    transition={{ duration: 0.6, ease: EASE_OUT }}
                  />
                </div>

                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <p className="truncate text-[11px] text-muted-foreground">
                    {job.message || "Waiting for a worker…"}
                  </p>
                  <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground/70">
                    {Math.min(100, job.progress)}%
                  </span>
                </div>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </section>
  );
}
