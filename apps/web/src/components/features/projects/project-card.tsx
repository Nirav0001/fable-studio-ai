"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import { AlertTriangle, Film } from "lucide-react";
import type { ChannelSummary } from "@fable/shared";
import { cn, CHANNEL_TYPE_META } from "@/lib/utils";
import { StatusBadge } from "@/components/widgets/status-badge";
import { ScoreDial } from "@/components/widgets/score-dial";
import { ChannelChip } from "@/components/widgets/channel-chip";
import { ProgressStages } from "@/components/widgets/progress-stages";
import { isProjectBusy, type ProjectListItem } from "./types";

interface ProjectCardProps {
  project: ProjectListItem;
  channel?: ChannelSummary;
  index: number;
}

export function ProjectCard({ project, channel, index }: ProjectCardProps) {
  const meta = CHANNEL_TYPE_META[project.type] ?? CHANNEL_TYPE_META.wyr;
  const busy = isProjectBusy(project.status);
  const scored = !busy && (project.viralScore ?? 0) > 0;
  const showClipCount = project.type !== "wyr" && (project.clipCount ?? 0) > 0;

  let createdAgo = "";
  try {
    createdAgo = formatDistanceToNow(new Date(project.createdAt), { addSuffix: true });
  } catch {
    createdAgo = "";
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.04, ease: "easeOut" }}
      className="h-full"
    >
      <Link href={`/projects/${project.id}`} className="block h-full">
        <div className="glass glass-hover flex h-full flex-col gap-3.5 rounded-2xl p-5">
          {/* ── Top row: type badge + status ─────────────────────────── */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-lg shadow-lg",
                  meta.gradient,
                )}
              >
                {meta.emoji}
              </span>
              <div className="min-w-0">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {meta.label}
                </p>
                <h3 className="line-clamp-2 text-sm font-semibold leading-snug">{project.title}</h3>
              </div>
            </div>
            <StatusBadge status={project.status} />
          </div>

          {/* ── Live progress while generating / rendering ───────────── */}
          {busy && (
            <ProgressStages stage={project.stage ?? "Working…"} progress={project.progress ?? 0} />
          )}

          {project.status === "failed" && project.error && (
            <p className="line-clamp-2 rounded-lg border border-red-500/25 bg-red-500/10 px-2.5 py-1.5 text-[11px] text-red-300">
              <AlertTriangle className="mr-1 inline h-3 w-3" />
              {project.error}
            </p>
          )}

          {/* ── Bottom: channel + meta + score ───────────────────────── */}
          <div className="mt-auto flex items-end justify-between gap-2">
            <div className="min-w-0 space-y-2">
              <ChannelChip
                name={project.channelName ?? channel?.name ?? "Channel"}
                color={channel?.avatarColor ?? "#8b5cf6"}
                type={channel?.type ?? project.type}
              />
              <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                {showClipCount && (
                  <span className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-secondary/50 px-1.5 py-0.5 font-medium">
                    <Film className="h-3 w-3" />
                    {project.clipCount} clip{(project.clipCount ?? 0) === 1 ? "" : "s"}
                  </span>
                )}
                {createdAgo && <span>{createdAgo}</span>}
              </div>
            </div>
            {scored && <ScoreDial score={project.viralScore ?? 0} size={44} />}
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
