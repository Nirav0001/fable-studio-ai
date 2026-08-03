"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Eye,
  Film,
  Link2,
  Loader2,
  Pencil,
  Trash2,
  Unlink,
  X,
} from "lucide-react";
import type {
  Branding,
  ChannelType,
  UploadDefaults,
  VideoSummary,
  WeeklySchedule,
} from "@fable/shared";
import { formatCompact, formatDuration } from "@fable/shared";
import { api, ApiError } from "@/lib/api";
import { CHANNEL_TYPE_META, cn, scoreColor } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/widgets/empty-state";
import { StatusBadge } from "@/components/widgets/status-badge";
import { AreaCard } from "@/components/charts/area-card";
import { avatarGradient, type ConnectResponse } from "@/components/features/channels/channel-card";
import { BrandingForm } from "@/components/features/channels/branding-form";
import { ScheduleEditor } from "@/components/features/channels/schedule-editor";
import { UploadDefaultsForm } from "@/components/features/channels/upload-defaults-form";
import { PromptsForm } from "@/components/features/channels/prompts-form";
import { AutomationPanel } from "@/components/features/channels/automation-panel";

interface ChannelDetail {
  id: string;
  name: string;
  handle: string;
  type: ChannelType;
  description: string;
  avatarColor: string;
  connected: boolean;
  subscriberCount: number;
  branding: Partial<Branding>;
  uploadDefaults: Partial<UploadDefaults>;
  schedule: WeeklySchedule;
  prompts: Record<string, string>;
  recentVideos: VideoSummary[];
}

interface ChannelAnalytics {
  series: {
    date: string;
    views: number;
    watchMinutes: number;
    subsGained: number;
    revenueGbp: number;
    ctr: number;
    retention: number;
  }[];
}

const FALLBACK_META = { label: "Channel", emoji: "🎬", gradient: "from-violet-500 to-fuchsia-500" };

export default function ChannelDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const qc = useQueryClient();
  const router = useRouter();

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);

  const {
    data: channel,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["channel", id],
    queryFn: () => api.get<ChannelDetail>(`/channels/${id}`),
  });

  const rename = useMutation({
    mutationFn: (name: string) => api.patch(`/channels/${id}`, { name }),
    onSuccess: () => {
      toast.success("Channel renamed");
      qc.invalidateQueries({ queryKey: ["channel", id] });
      qc.invalidateQueries({ queryKey: ["channels"] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Could not rename channel"),
  });

  const connect = useMutation({
    mutationFn: () => api.post<ConnectResponse>(`/channels/${id}/connect`),
    onSuccess: (data) => {
      if (data.authUrl) {
        window.open(data.authUrl, "_blank", "noopener,noreferrer");
        toast.info("Finish connecting in the Google tab we just opened");
      } else {
        toast.success("Channel connected");
      }
      qc.invalidateQueries({ queryKey: ["channel", id] });
      qc.invalidateQueries({ queryKey: ["channels"] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Could not connect channel"),
  });

  const disconnect = useMutation({
    mutationFn: () => api.post(`/channels/${id}/disconnect`),
    onSuccess: () => {
      toast.success("Channel disconnected");
      qc.invalidateQueries({ queryKey: ["channel", id] });
      qc.invalidateQueries({ queryKey: ["channels"] });
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Could not disconnect channel"),
  });

  const remove = useMutation({
    mutationFn: () => api.delete(`/channels/${id}`),
    onSuccess: () => {
      toast.success("Channel deleted");
      qc.invalidateQueries({ queryKey: ["channels"] });
      router.push("/channels");
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Could not delete channel");
      setDeleteOpen(false);
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-28 rounded-2xl" />
        <Skeleton className="h-9 w-full max-w-xl rounded-xl" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-72 rounded-2xl" />
          <Skeleton className="h-72 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (error || !channel) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Channel not found"
        body="It may have been deleted, or the link is stale."
        action={
          <Button asChild variant="secondary" className="gap-1.5">
            <Link href="/channels">
              <ArrowLeft className="h-4 w-4" /> Back to channels
            </Link>
          </Button>
        }
      />
    );
  }

  const meta = CHANNEL_TYPE_META[channel.type] ?? FALLBACK_META;

  const startEditing = () => {
    setNameDraft(channel.name);
    setEditingName(true);
  };
  const commitRename = () => {
    const next = nameDraft.trim();
    setEditingName(false);
    if (next && next !== channel.name) rename.mutate(next);
  };

  return (
    <div className="space-y-6">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="glass flex flex-wrap items-center justify-between gap-4 rounded-2xl p-5"
      >
        <div className="flex min-w-0 items-center gap-4">
          <div
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl text-2xl font-bold text-white shadow-lg"
            style={{ backgroundImage: avatarGradient(channel.avatarColor) }}
          >
            {channel.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            {editingName ? (
              <div className="flex items-center gap-1.5">
                <Input
                  autoFocus
                  value={nameDraft}
                  className="h-8 w-56"
                  onChange={(e) => setNameDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitRename();
                    if (e.key === "Escape") setEditingName(false);
                  }}
                />
                <Button size="icon" className="h-8 w-8" onClick={commitRename} aria-label="Save name">
                  <Check className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  onClick={() => setEditingName(false)}
                  aria-label="Cancel rename"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ) : (
              <div className="group flex items-center gap-2">
                <h2 className="truncate font-display text-xl font-semibold tracking-tight">
                  {channel.name}
                </h2>
                {rename.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                ) : (
                  <button
                    type="button"
                    onClick={startEditing}
                    aria-label="Rename channel"
                    className="rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-accent/50 hover:text-foreground group-hover:opacity-100"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            )}
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-muted-foreground">
              <span className="truncate">@{channel.handle}</span>
              <span className="text-border">·</span>
              <span className="inline-flex items-center gap-1">
                <span aria-hidden>{meta.emoji}</span> {meta.label}
              </span>
              <span className="text-border">·</span>
              <span className="tabular-nums">{formatCompact(channel.subscriberCount)} subs</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {channel.connected ? (
            <>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Connected
              </span>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                disabled={disconnect.isPending}
                onClick={() => disconnect.mutate()}
              >
                {disconnect.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Unlink className="h-3.5 w-3.5" />
                )}
                Disconnect
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              className="gap-1.5"
              disabled={connect.isPending}
              onClick={() => connect.mutate()}
            >
              {connect.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Link2 className="h-3.5 w-3.5" />
              )}
              Connect YouTube
            </Button>
          )}
        </div>
      </motion.div>

      {/* ── Tabs ────────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.06 }}
      >
        <Tabs defaultValue="overview">
          <div className="overflow-x-auto pb-1">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="branding">Branding</TabsTrigger>
              <TabsTrigger value="schedule">Schedule</TabsTrigger>
              <TabsTrigger value="defaults">Defaults</TabsTrigger>
              <TabsTrigger value="prompts">Prompts</TabsTrigger>
              <TabsTrigger value="automation">Automation</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="overview">
            <OverviewTab channel={channel} />
          </TabsContent>
          <TabsContent value="branding">
            <BrandingForm channelId={channel.id} branding={channel.branding} />
          </TabsContent>
          <TabsContent value="schedule">
            <ScheduleEditor channelId={channel.id} schedule={channel.schedule} />
          </TabsContent>
          <TabsContent value="defaults">
            <UploadDefaultsForm channelId={channel.id} defaults={channel.uploadDefaults} />
          </TabsContent>
          <TabsContent value="prompts">
            <PromptsForm channelId={channel.id} prompts={channel.prompts} />
          </TabsContent>
          <TabsContent value="automation">
            <AutomationPanel channelId={channel.id} />
          </TabsContent>
        </Tabs>
      </motion.div>

      {/* ── Danger zone ─────────────────────────────────────────────── */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.12 }}
        className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-red-500/25 bg-red-500/5 p-5"
      >
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-red-300">
            <AlertTriangle className="h-4 w-4" /> Danger zone
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Deleting removes this channel plus its projects, videos and schedule from Fable. Nothing
            is removed from YouTube itself.
          </p>
        </div>
        <Button variant="destructive" className="gap-1.5" onClick={() => setDeleteOpen(true)}>
          <Trash2 className="h-4 w-4" /> Delete channel
        </Button>
      </motion.section>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete “{channel.name}”?</DialogTitle>
            <DialogDescription>
              This permanently removes the channel, its projects, rendered videos and scheduled
              slots from Fable Studio. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)} disabled={remove.isPending}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="gap-1.5"
              disabled={remove.isPending}
              onClick={() => remove.mutate()}
            >
              {remove.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Delete forever
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ── Overview tab ─────────────────────────────────────────────────── */

function OverviewTab({ channel }: { channel: ChannelDetail }) {
  const { data: analytics, isLoading } = useQuery({
    queryKey: ["channel-analytics", channel.id],
    queryFn: () => api.get<ChannelAnalytics>(`/analytics/channels/${channel.id}?days=28`),
  });

  const meta = CHANNEL_TYPE_META[channel.type] ?? FALLBACK_META;
  const series = analytics?.series ?? [];
  const viewsData = series.map((s) => ({ x: format(new Date(s.date), "d MMM"), y: s.views }));
  const subsData = series.map((s) => ({ x: format(new Date(s.date), "d MMM"), y: s.subsGained }));

  return (
    <div className="space-y-5">
      {isLoading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-64 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <AreaCard
            title="Views — last 28 days"
            data={viewsData}
            color="#8b5cf6"
            valueFormatter={formatCompact}
          />
          <AreaCard
            title="Subscribers gained"
            data={subsData}
            color="#d946ef"
            valueFormatter={formatCompact}
          />
        </div>
      )}

      <section className="glass rounded-2xl p-5">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Film className="h-4 w-4 text-primary" /> Recent videos
          </h3>
          <Button asChild variant="ghost" size="sm" className="h-7 text-xs">
            <Link href="/uploads">View all</Link>
          </Button>
        </div>

        {channel.recentVideos.length === 0 ? (
          <div className="py-4">
            <EmptyState
              icon={Film}
              title="No videos yet"
              body="Generate an AI project for this channel and its renders will land here."
              action={
                <Button asChild size="sm" className="gap-1.5">
                  <Link href="/projects/new">New project</Link>
                </Button>
              }
            />
          </div>
        ) : (
          <div className="mt-3 divide-y divide-border/50">
            {channel.recentVideos.map((video, i) => (
              <motion.div
                key={video.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: i * 0.04 }}
                className="flex items-center gap-3 py-3 first:pt-1 last:pb-1"
              >
                <div
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-lg",
                    meta.gradient,
                  )}
                >
                  <span aria-hidden>{meta.emoji}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{video.title}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {formatDuration(video.durationSec)}
                    {typeof video.views === "number" && (
                      <>
                        {" · "}
                        <Eye className="mb-0.5 inline h-3 w-3" /> {formatCompact(video.views)}
                      </>
                    )}
                    {" · "}
                    {formatDistanceToNow(new Date(video.publishedAt ?? video.createdAt), {
                      addSuffix: true,
                    })}
                  </p>
                </div>
                <span
                  className={cn("text-sm font-semibold tabular-nums", scoreColor(video.viralScore))}
                  title="Viral score"
                >
                  {video.viralScore}
                </span>
                <StatusBadge status={video.status} />
              </motion.div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
