"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { Sparkles, WandSparkles } from "lucide-react";
import type { ChannelSummary, ChannelType, ProjectStatus } from "@fable/shared";
import { api } from "@/lib/api";
import { cn, CHANNEL_TYPE_META } from "@/lib/utils";
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
import { ProjectCard } from "@/components/features/projects/project-card";
import { isProjectBusy, type ProjectListItem } from "@/components/features/projects/types";

type TypeFilter = "all" | ChannelType;
type StatusFilter = "all" | ProjectStatus;

const TYPE_FILTERS: TypeFilter[] = ["all", "wyr", "clips", "top5"];

const STATUS_FILTERS: { value: StatusFilter; label: string; dot?: string }[] = [
  { value: "all", label: "All" },
  { value: "generating", label: "Generating", dot: "bg-violet-400" },
  { value: "review", label: "In review", dot: "bg-amber-400" },
  { value: "rendering", label: "Rendering", dot: "bg-blue-400" },
  { value: "ready", label: "Ready", dot: "bg-emerald-400" },
  { value: "failed", label: "Failed", dot: "bg-red-400" },
];

export default function ProjectsPage() {
  const [channelId, setChannelId] = useState<string>("all");
  const [type, setType] = useState<TypeFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("all");

  const channels = useQuery({
    queryKey: ["channels"],
    queryFn: () => api.get<ChannelSummary[]>("/channels"),
  });

  const projects = useQuery({
    queryKey: ["projects", channelId],
    queryFn: () =>
      api.get<ProjectListItem[]>(
        `/projects${channelId !== "all" ? `?channelId=${channelId}` : ""}`,
      ),
    // Live-poll the list while anything is generating or rendering.
    refetchInterval: (query) =>
      query.state.data?.some((p) => isProjectBusy(p.status)) ? 2000 : false,
  });

  const channelById = useMemo(() => {
    const map = new Map<string, ChannelSummary>();
    for (const c of channels.data ?? []) map.set(c.id, c);
    return map;
  }, [channels.data]);

  const typeCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const p of projects.data ?? []) c[p.type] = (c[p.type] ?? 0) + 1;
    return c;
  }, [projects.data]);

  const statusCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const p of projects.data ?? []) c[p.status] = (c[p.status] ?? 0) + 1;
    return c;
  }, [projects.data]);

  const filtered = useMemo(() => {
    const list = (projects.data ?? []).filter(
      (p) => (type === "all" || p.type === type) && (status === "all" || p.status === status),
    );
    return [...list].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }, [projects.data, type, status]);

  const hasAny = (projects.data?.length ?? 0) > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Projects"
        description="Generate, review and approve Shorts — the AI does the heavy lifting."
        actions={
          <Button asChild className="gap-1.5">
            <Link href="/projects/new">
              <Sparkles className="h-4 w-4" /> New project
            </Link>
          </Button>
        }
      />

      {/* ── Filter bar ──────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex flex-wrap items-center gap-2"
      >
        {/* Curated to Would-You-Rather only — type filter retired. */}
        {/* Status chips */}
        <div className="flex flex-wrap items-center gap-1.5">
          {STATUS_FILTERS.map((f) => {
            const active = status === f.value;
            const count =
              f.value === "all" ? (projects.data?.length ?? 0) : (statusCounts[f.value] ?? 0);
            return (
              <button
                key={f.value}
                type="button"
                onClick={() => setStatus(f.value)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  active
                    ? "border-primary/50 bg-primary/15 text-foreground"
                    : "border-border/60 bg-secondary/40 text-muted-foreground hover:bg-secondary/70 hover:text-foreground",
                )}
              >
                {f.dot && <span className={cn("h-1.5 w-1.5 rounded-full", f.dot)} />}
                {f.label}
                {projects.data && (
                  <span className={cn("tabular-nums", active ? "text-primary" : "text-muted-foreground/60")}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Channel select */}
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
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: c.avatarColor }} />
                    {c.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </motion.div>

      {/* ── Grid ────────────────────────────────────────────────────── */}
      {projects.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="glass space-y-4 rounded-2xl p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-xl" />
                  <div className="space-y-1.5">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-4 w-40" />
                  </div>
                </div>
                <Skeleton className="h-5 w-20 rounded-full" />
              </div>
              <div className="flex items-end justify-between">
                <div className="space-y-2">
                  <Skeleton className="h-6 w-28 rounded-full" />
                  <Skeleton className="h-3 w-32" />
                </div>
                <Skeleton className="h-11 w-11 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={WandSparkles}
          title={hasAny ? "Nothing matches those filters" : "No projects yet"}
          body={
            hasAny
              ? "Try a different type, status or channel — or spin up something new."
              : "Point the AI at a theme or a source video and get a review-ready Short in about a minute."
          }
          action={
            <Button asChild>
              <Link href="/projects/new">
                <Sparkles className="mr-2 h-4 w-4" />
                Generate your first project
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((project, i) => (
            <ProjectCard
              key={project.id}
              project={project}
              channel={channelById.get(project.channelId)}
              index={i}
            />
          ))}
        </div>
      )}
    </div>
  );
}
