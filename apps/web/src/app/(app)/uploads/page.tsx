"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { Sparkles, UploadCloud } from "lucide-react";
import type { ChannelSummary, VideoStatus, VideoSummary } from "@fable/shared";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/widgets/empty-state";
import { PageHeader } from "@/components/widgets/page-header";
import { VideoCard } from "@/components/features/uploads/video-card";
import { SeoEditDialog } from "@/components/features/uploads/seo-edit-dialog";
import { ScheduleDialog } from "@/components/features/uploads/schedule-dialog";
import { AbTestDialog } from "@/components/features/uploads/abtest-dialog";

type StatusFilter = "all" | Extract<VideoStatus, "ready" | "scheduled" | "uploading" | "published" | "failed">;

const STATUS_FILTERS: { value: StatusFilter; label: string; dot?: string }[] = [
  { value: "all", label: "All" },
  { value: "ready", label: "Ready", dot: "bg-emerald-400" },
  { value: "scheduled", label: "Scheduled", dot: "bg-sky-400" },
  { value: "uploading", label: "Uploading", dot: "bg-blue-400" },
  { value: "published", label: "Published", dot: "bg-emerald-400" },
  { value: "failed", label: "Failed", dot: "bg-red-400" },
];

export default function UploadsPage() {
  const [status, setStatus] = useState<StatusFilter>("all");
  const [channelId, setChannelId] = useState<string>("all");
  const [seoVideo, setSeoVideo] = useState<VideoSummary | null>(null);
  const [scheduleVideo, setScheduleVideo] = useState<VideoSummary | null>(null);
  const [abTestVideo, setAbTestVideo] = useState<VideoSummary | null>(null);

  const channels = useQuery({
    queryKey: ["channels"],
    queryFn: () => api.get<ChannelSummary[]>("/channels"),
  });

  const videos = useQuery({
    queryKey: ["videos", channelId],
    queryFn: () =>
      api.get<VideoSummary[]>(`/videos${channelId !== "all" ? `?channelId=${channelId}` : ""}`),
    // Live-poll while anything is mid-upload so statuses flip in near-real-time.
    refetchInterval: (query) =>
      query.state.data?.some((v) => v.status === "uploading" || v.status === "rendering")
        ? 2000
        : false,
  });

  const channelById = useMemo(() => {
    const map = new Map<string, ChannelSummary>();
    for (const c of channels.data ?? []) map.set(c.id, c);
    return map;
  }, [channels.data]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const v of videos.data ?? []) c[v.status] = (c[v.status] ?? 0) + 1;
    return c;
  }, [videos.data]);

  const filtered = useMemo(() => {
    const list = (videos.data ?? []).filter((v) => status === "all" || v.status === status);
    return [...list].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }, [videos.data, status]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Uploads"
        description="Every rendered Short across your channels — publish, schedule and optimise."
      />

      {/* ── Filters ─────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex flex-wrap items-center gap-2"
      >
        <div className="flex flex-wrap items-center gap-1.5">
          {STATUS_FILTERS.map((f) => {
            const active = status === f.value;
            const count = f.value === "all" ? (videos.data?.length ?? 0) : (counts[f.value] ?? 0);
            return (
              <button
                key={f.value}
                type="button"
                onClick={() => setStatus(f.value)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors",
                  active
                    ? "border-primary/50 bg-primary/15 text-foreground"
                    : "border-border/60 bg-secondary/40 text-muted-foreground hover:bg-secondary/70 hover:text-foreground",
                )}
              >
                {f.dot && <span className={cn("h-1.5 w-1.5 rounded-full", f.dot)} />}
                {f.label}
                {videos.data && (
                  <span className={cn("tabular-nums", active ? "text-primary" : "text-muted-foreground/60")}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="ml-auto w-full sm:w-52">
          <Select value={channelId} onValueChange={setChannelId}>
            <SelectTrigger>
              <SelectValue placeholder="All channels" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All channels</SelectItem>
              {(channels.data ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  <span className="inline-flex items-center gap-2">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: c.avatarColor }}
                    />
                    {c.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </motion.div>

      {/* ── Grid ────────────────────────────────────────────────────── */}
      {videos.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="glass overflow-hidden rounded-2xl">
              <Skeleton className="aspect-video w-full rounded-none" />
              <div className="space-y-3 p-4">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
                <div className="flex items-center justify-between">
                  <Skeleton className="h-6 w-24 rounded-full" />
                  <Skeleton className="h-10 w-10 rounded-full" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={UploadCloud}
          title={status === "all" ? "No videos yet" : `No ${status} videos`}
          body={
            status === "all"
              ? "Generate and approve an AI project to get render-ready Shorts in here."
              : "Try a different status filter, or generate a fresh batch from AI Projects."
          }
          action={
            <Button asChild>
              <Link href="/projects">
                <Sparkles className="mr-2 h-4 w-4" />
                Go to AI Projects
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((video, i) => (
            <VideoCard
              key={video.id}
              video={video}
              channel={channelById.get(video.channelId)}
              index={i}
              onEditSeo={setSeoVideo}
              onSchedule={setScheduleVideo}
              onAbTest={setAbTestVideo}
            />
          ))}
        </div>
      )}

      {/* ── Dialogs ─────────────────────────────────────────────────── */}
      <SeoEditDialog
        video={seoVideo}
        open={Boolean(seoVideo)}
        onOpenChange={(o) => !o && setSeoVideo(null)}
      />
      <ScheduleDialog
        video={scheduleVideo}
        open={Boolean(scheduleVideo)}
        onOpenChange={(o) => !o && setScheduleVideo(null)}
      />
      <AbTestDialog
        video={abTestVideo}
        open={Boolean(abTestVideo)}
        onOpenChange={(o) => !o && setAbTestVideo(null)}
      />
    </div>
  );
}
