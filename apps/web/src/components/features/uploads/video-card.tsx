"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CalendarClock,
  ExternalLink,
  Eye,
  FlaskConical,
  Loader2,
  MoreVertical,
  PenLine,
  Sparkles,
  Trash2,
  UploadCloud,
} from "lucide-react";
import type { ChannelSummary, VideoSummary } from "@fable/shared";
import { formatCompact, formatDuration } from "@fable/shared";
import { api } from "@/lib/api";
import { EASE_OUT, staggerDelay } from "@/lib/motion";
import { cn, CHANNEL_TYPE_META } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { StatusBadge } from "@/components/widgets/status-badge";
import { ScoreDial } from "@/components/widgets/score-dial";
import { ChannelChip } from "@/components/widgets/channel-chip";

/** Resolve a stored thumbnail path to the public /files URL the web proxy serves. */
export function thumbUrl(p: string | null | undefined): string | null {
  if (!p) return null;
  if (p.startsWith("http://") || p.startsWith("https://") || p.startsWith("/files/")) return p;
  const norm = p.replace(/\\/g, "/");
  const storageIdx = norm.lastIndexOf("/storage/");
  if (storageIdx >= 0) return `/files/${norm.slice(storageIdx + "/storage/".length)}`;
  if (norm.startsWith("storage/")) return `/files/${norm.slice("storage/".length)}`;
  const parts = norm.split("/").filter(Boolean);
  if (parts.length >= 2) return `/files/${parts[parts.length - 2]}/${parts[parts.length - 1]}`;
  return `/files/thumbnails/${parts[0] ?? ""}`;
}

interface VideoCardProps {
  video: VideoSummary;
  channel?: ChannelSummary;
  index: number;
  onEditSeo: (video: VideoSummary) => void;
  onSchedule: (video: VideoSummary) => void;
  onAbTest: (video: VideoSummary) => void;
}

export function VideoCard({ video, channel, index, onEditSeo, onSchedule, onAbTest }: VideoCardProps) {
  const qc = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["videos"] });
    void qc.invalidateQueries({ queryKey: ["schedule"] });
  };

  const uploadNow = useMutation({
    mutationFn: () => api.post(`/videos/${video.id}/upload`),
    onSuccess: () => {
      toast.success("Upload started", { description: `"${video.title}" is on its way to YouTube.` });
      invalidate();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Upload failed to start"),
  });

  const repost = useMutation({
    mutationFn: () => api.post<VideoSummary>(`/videos/${video.id}/repost`),
    onSuccess: (created) => {
      toast.success("Improved repost drafted", { description: `New draft: "${created.title}"` });
      invalidate();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Repost failed"),
  });

  const del = useMutation({
    mutationFn: () => api.delete(`/videos/${video.id}`),
    onSuccess: () => {
      toast.success("Video deleted");
      setConfirmDelete(false);
      invalidate();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Delete failed"),
  });

  const meta = CHANNEL_TYPE_META[channel?.type ?? "wyr"] ?? CHANNEL_TYPE_META.wyr;
  const thumb = thumbUrl(video.thumbnailPath);
  const isMockYt = Boolean(video.youtubeId?.startsWith("mock-"));
  const busy = video.status === "uploading" || video.status === "rendering";
  const canUpload = !busy && video.status !== "published";
  const canSchedule = video.status === "ready" || video.status === "draft" || video.status === "failed";

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: EASE_OUT, delay: staggerDelay(index) }}
    >
      <div className="glass glass-hover group flex h-full flex-col overflow-hidden rounded-2xl">
        {/* ── Thumbnail ─────────────────────────────────────────────── */}
        <div className="relative aspect-video w-full overflow-hidden">
          {thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={thumb}
              alt={video.title}
              className="h-full w-full object-cover transition-transform duration-150 ease-[var(--ease-out)] group-hover:scale-[1.03]"
            />
          ) : (
            <div
              className={cn(
                "flex h-full w-full items-center justify-center bg-gradient-to-br",
                meta.gradient,
              )}
            >
              <span className="text-4xl drop-shadow-lg">{meta.emoji}</span>
            </div>
          )}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20" />

          <div className="absolute left-2.5 top-2.5">
            <StatusBadge status={video.status} />
          </div>

          <span className="absolute bottom-2.5 right-2.5 rounded-md bg-black/60 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-white backdrop-blur-sm">
            {formatDuration(video.durationSec)}
          </span>

          {busy && (
            <span className="absolute bottom-2.5 left-2.5 inline-flex items-center gap-1.5 rounded-md bg-black/60 px-2 py-0.5 text-[11px] font-medium text-blue-300 backdrop-blur-sm">
              <Loader2 className="h-3 w-3 animate-spin" />
              {video.status === "uploading" ? "Uploading" : "Rendering"}
            </span>
          )}

          <div className="absolute right-2 top-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-lg bg-black/45 text-white backdrop-blur-sm hover:bg-black/65 hover:text-white"
                  aria-label="Video actions"
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem disabled={!canUpload || uploadNow.isPending} onClick={() => uploadNow.mutate()}>
                  <UploadCloud className="mr-2 h-4 w-4" />
                  Upload now
                </DropdownMenuItem>
                <DropdownMenuItem disabled={!canSchedule} onClick={() => onSchedule(video)}>
                  <CalendarClock className="mr-2 h-4 w-4" />
                  Schedule…
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onEditSeo(video)}>
                  <PenLine className="mr-2 h-4 w-4" />
                  Edit SEO
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onAbTest(video)}>
                  <FlaskConical className="mr-2 h-4 w-4" />
                  A/B test
                </DropdownMenuItem>
                <DropdownMenuItem disabled={busy || repost.isPending} onClick={() => repost.mutate()}>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Repost improved
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-red-400 focus:text-red-400"
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* ── Body ──────────────────────────────────────────────────── */}
        <div className="flex flex-1 flex-col gap-3 p-4">
          <h3 className="line-clamp-2 min-h-[2.5rem] text-sm font-semibold leading-snug">
            {video.title}
          </h3>

          <div className="flex flex-wrap items-center gap-1.5">
            {video.status === "published" && video.views !== undefined && (
              <span className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-secondary/50 px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                <Eye className="h-3 w-3" />
                {formatCompact(video.views)} views
              </span>
            )}
            {video.youtubeId &&
              (isMockYt ? (
                <TooltipProvider delayDuration={150}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex cursor-default items-center gap-1 rounded-md border border-red-500/25 bg-red-500/10 px-1.5 py-0.5 text-[11px] font-medium text-red-300">
                        <ExternalLink className="h-3 w-3" />
                        YouTube
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>Demo upload — mock ID, links nowhere</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : (
                <a
                  href={`https://youtube.com/shorts/${video.youtubeId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-md border border-red-500/25 bg-red-500/10 px-1.5 py-0.5 text-[11px] font-medium text-red-300 transition-colors hover:bg-red-500/20"
                >
                  <ExternalLink className="h-3 w-3" />
                  YouTube
                </a>
              ))}
          </div>

          <div className="mt-auto flex items-center justify-between gap-2">
            <ChannelChip
              name={video.channelName ?? channel?.name ?? "Channel"}
              color={channel?.avatarColor ?? "#8b5cf6"}
              type={channel?.type ?? "wyr"}
            />
            <ScoreDial score={video.viralScore} size={40} />
          </div>
        </div>
      </div>

      {/* ── Delete confirm ──────────────────────────────────────────── */}
      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete this video?</DialogTitle>
            <DialogDescription>
              &ldquo;{video.title}&rdquo; will be removed permanently
              {video.status === "published" ? " — we&apos;ll also try to remove it from YouTube." : "."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)} disabled={del.isPending}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => del.mutate()} disabled={del.isPending}>
              {del.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete video
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
