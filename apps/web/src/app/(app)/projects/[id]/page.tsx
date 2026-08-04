"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  FileQuestion,
  Film,
  Image as ImageIcon,
  Loader2,
  PenLine,
  PoundSterling,
  ScrollText,
  Search,
  TrendingUp,
  X,
  type LucideIcon,
} from "lucide-react";
import { api } from "@/lib/api";
import { EASE_OUT, SPRING_CELEBRATE } from "@/lib/motion";
import { cn, CHANNEL_TYPE_META } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/widgets/empty-state";
import { StatusBadge } from "@/components/widgets/status-badge";
import { ProgressStages } from "@/components/widgets/progress-stages";
import { ScriptTimeline } from "@/components/features/projects/script-timeline";
import { ClipsBoard } from "@/components/features/projects/clips-board";
import { SeoPanel } from "@/components/features/projects/seo-panel";
import { ThumbnailGrid } from "@/components/features/projects/thumbnail-grid";
import { ViralPanel } from "@/components/features/projects/viral-panel";
import { CostPanel } from "@/components/features/projects/cost-panel";
import { ActionBar } from "@/components/features/projects/action-bar";
import {
  hasCost,
  hasScript,
  hasSeo,
  hasViralScore,
  isProjectBusy,
  type ProjectDetail,
} from "@/components/features/projects/types";

function GeneratingHint({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <div className="glass flex flex-col items-center gap-3 rounded-2xl px-6 py-14 text-center">
      <span className="relative flex h-12 w-12 items-center justify-center rounded-2xl border border-violet-500/30 bg-violet-500/10">
        <Icon className="h-5 w-5 text-violet-300" />
        <Loader2 className="absolute -bottom-1.5 -right-1.5 h-4 w-4 animate-spin text-violet-400" />
      </span>
      <p className="text-sm font-medium">{label}</p>
      <p className="max-w-xs text-xs text-muted-foreground">
        This tab fills in automatically as the pipeline finishes — no refresh needed.
      </p>
    </div>
  );
}

export default function ProjectDetailPage({ params }: { params: { id: string } }) {
  const qc = useQueryClient();
  const projectId = params.id;
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");

  const project = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => api.get<ProjectDetail>(`/projects/${projectId}`),
    // Live progress while the pipeline runs.
    refetchInterval: (query) =>
      query.state.data && isProjectBusy(query.state.data.status) ? 2000 : false,
  });

  const p = project.data;
  const busy = Boolean(p && isProjectBusy(p.status));

  useEffect(() => {
    if (p && !editingTitle) setTitleDraft(p.title);
  }, [p, editingTitle]);

  const saveTitle = useMutation({
    mutationFn: (title: string) => api.patch(`/projects/${projectId}`, { title }),
    onSuccess: () => {
      toast.success("Title updated");
      setEditingTitle(false);
      void qc.invalidateQueries({ queryKey: ["project", projectId] });
      void qc.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to rename"),
  });

  const regenerate = useMutation({
    mutationFn: () => api.post(`/projects/${projectId}/generate`),
    onSuccess: () => {
      toast.success("Regenerating project");
      void qc.invalidateQueries({ queryKey: ["project", projectId] });
      void qc.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to regenerate"),
  });

  /* ── Loading ─────────────────────────────────────────────────────── */
  if (project.isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-xl" />
          <Skeleton className="h-10 w-10 rounded-xl" />
          <div className="space-y-2">
            <Skeleton className="h-5 w-64" />
            <Skeleton className="h-3 w-40" />
          </div>
        </div>
        <Skeleton className="h-9 w-96 rounded-xl" />
        <Skeleton className="h-72 w-full rounded-2xl" />
      </div>
    );
  }

  /* ── Not found / error ───────────────────────────────────────────── */
  if (project.isError || !p) {
    return (
      <EmptyState
        icon={FileQuestion}
        title="Project not found"
        body="It may have been deleted, or the link is stale."
        action={
          <Button asChild>
            <Link href="/projects">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to projects
            </Link>
          </Button>
        }
      />
    );
  }

  const meta = CHANNEL_TYPE_META[p.type] ?? CHANNEL_TYPE_META.wyr;
  const showClipsTab = p.type !== "wyr";
  const clips = p.clips ?? [];
  const thumbnails = p.thumbnails ?? [];
  let updatedAgo = "";
  try {
    updatedAgo = formatDistanceToNow(new Date(p.updatedAt ?? p.createdAt), { addSuffix: true });
  } catch {
    updatedAgo = "";
  }

  const commitTitle = () => {
    const next = titleDraft.trim();
    if (!next) {
      toast.error("Title can't be empty");
      return;
    }
    if (next === p.title) {
      setEditingTitle(false);
      return;
    }
    saveTitle.mutate(next);
  };

  return (
    <div className="space-y-5">
      {/* ── Sticky header ───────────────────────────────────────────── */}
      <div className="sticky top-16 z-30 -mx-4 border-b border-border/60 bg-background/75 px-4 py-3 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="flex flex-wrap items-center gap-3">
          <Button asChild variant="ghost" size="icon" className="h-9 w-9 shrink-0" aria-label="Back to projects">
            <Link href="/projects">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>

          <span
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-base shadow-lg",
              meta.gradient,
            )}
          >
            {meta.emoji}
          </span>

          <div className="min-w-0 flex-1">
            {editingTitle ? (
              <div className="flex items-center gap-1.5">
                <Input
                  value={titleDraft}
                  autoFocus
                  maxLength={120}
                  disabled={saveTitle.isPending}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitTitle();
                    if (e.key === "Escape") {
                      setTitleDraft(p.title);
                      setEditingTitle(false);
                    }
                  }}
                  className="h-9 max-w-xl text-sm font-semibold"
                />
                <Button
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  disabled={saveTitle.isPending}
                  onClick={commitTitle}
                  aria-label="Save title"
                >
                  {saveTitle.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  disabled={saveTitle.isPending}
                  onClick={() => {
                    setTitleDraft(p.title);
                    setEditingTitle(false);
                  }}
                  aria-label="Cancel rename"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setEditingTitle(true)}
                className="group flex min-w-0 items-center gap-2 text-left"
                title="Rename project"
              >
                <h1 className="truncate text-base font-semibold sm:text-lg">{p.title}</h1>
                <PenLine className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
              </button>
            )}
            <p className="truncate text-[11px] text-muted-foreground">
              {meta.label}
              {p.channelName ? ` · ${p.channelName}` : ""}
              {updatedAgo ? ` · updated ${updatedAgo}` : ""}
            </p>
          </div>

          <StatusBadge status={p.status} />
        </div>

        <AnimatePresence>
          {busy && (
            <motion.div
              className="mt-3"
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: EASE_OUT }}
            >
              <ProgressStages stage={p.stage ?? "Working…"} progress={p.progress ?? 0} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Failed banner ───────────────────────────────────────────── */}
      {p.status === "failed" && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-wrap items-center gap-3 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3"
        >
          <AlertTriangle className="h-4 w-4 shrink-0 text-red-400" />
          <p className="min-w-0 flex-1 text-sm text-red-300">
            {p.error ?? "Generation failed — try running it again."}
          </p>
          <Button
            variant="secondary"
            size="sm"
            disabled={regenerate.isPending}
            onClick={() => regenerate.mutate()}
          >
            {regenerate.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
            Try again
          </Button>
        </motion.div>
      )}

      {/* ── Tabs ────────────────────────────────────────────────────── */}
      <motion.div
        key={busy ? "generating" : "ready"}
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={SPRING_CELEBRATE}
      >
        <Tabs defaultValue={p.type === "clips" ? "clips" : "script"}>
          <TabsList className="h-auto flex-wrap">
            <TabsTrigger value="script">
              <ScrollText className="h-3.5 w-3.5" /> Script
            </TabsTrigger>
            {showClipsTab && (
              <TabsTrigger value="clips">
                <Film className="h-3.5 w-3.5" /> Clips
                {clips.length > 0 && (
                  <span className="rounded-full bg-secondary/80 px-1.5 text-[10px] tabular-nums">
                    {clips.length}
                  </span>
                )}
              </TabsTrigger>
            )}
            <TabsTrigger value="seo">
              <Search className="h-3.5 w-3.5" /> SEO
            </TabsTrigger>
            <TabsTrigger value="thumbnails">
              <ImageIcon className="h-3.5 w-3.5" /> Thumbnails
            </TabsTrigger>
            <TabsTrigger value="viral">
              <TrendingUp className="h-3.5 w-3.5" /> Viral score
            </TabsTrigger>
            <TabsTrigger value="cost">
              <PoundSterling className="h-3.5 w-3.5" /> Cost
            </TabsTrigger>
          </TabsList>

          <TabsContent value="script">
            {hasScript(p.script) ? (
              <ScriptTimeline projectId={p.id} script={p.script} editable={!busy} />
            ) : busy ? (
              <GeneratingHint icon={ScrollText} label="The AI is writing your script…" />
            ) : (
              <EmptyState
                icon={ScrollText}
                title="No script yet"
                body="Run generation and the scene-by-scene plan lands here."
              />
            )}
          </TabsContent>

          {showClipsTab && (
            <TabsContent value="clips">
              {clips.length > 0 ? (
                <ClipsBoard projectId={p.id} clips={clips} disabled={busy} />
              ) : busy ? (
                <GeneratingHint icon={Film} label="Scanning the source for viral moments…" />
              ) : (
                <EmptyState
                  icon={Film}
                  title="No clips yet"
                  body="Generation analyses the source video and drops scored clips in here."
                />
              )}
            </TabsContent>
          )}

          <TabsContent value="seo">
            {hasSeo(p.seo) ? (
              <SeoPanel projectId={p.id} seo={p.seo} channelType={p.type} disabled={busy} />
            ) : busy ? (
              <GeneratingHint icon={Search} label="Writing the SEO pack…" />
            ) : (
              <EmptyState
                icon={Search}
                title="No SEO pack yet"
                body="Titles, description, tags and hashtags appear after generation."
              />
            )}
          </TabsContent>

          <TabsContent value="thumbnails">
            {thumbnails.length > 0 ? (
              <ThumbnailGrid thumbnails={thumbnails} />
            ) : busy ? (
              <GeneratingHint icon={ImageIcon} label="Designing thumbnail variants…" />
            ) : (
              <EmptyState
                icon={ImageIcon}
                title="No thumbnails yet"
                body="Four click-tested variants appear here after generation."
              />
            )}
          </TabsContent>

          <TabsContent value="viral">
            {hasViralScore(p.viral) ? (
              <ViralPanel viral={p.viral} />
            ) : busy ? (
              <GeneratingHint icon={TrendingUp} label="Scoring viral potential…" />
            ) : (
              <EmptyState
                icon={TrendingUp}
                title="Not scored yet"
                body="The 9-factor viral breakdown appears after generation."
              />
            )}
          </TabsContent>

          <TabsContent value="cost">
            {hasCost(p.cost) ? (
              <CostPanel cost={p.cost} />
            ) : busy ? (
              <GeneratingHint icon={PoundSterling} label="Estimating the cost…" />
            ) : (
              <EmptyState
                icon={PoundSterling}
                title="No estimate yet"
                body="Generation calculates LLM, voiceover and render costs for this project."
              />
            )}
          </TabsContent>
        </Tabs>
      </motion.div>

      {/* Spacer so the floating action bar never covers content */}
      <div className="h-14" />

      <ActionBar project={p} />
    </div>
  );
}
