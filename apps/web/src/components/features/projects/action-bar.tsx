"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  CalendarClock,
  CheckCheck,
  Clapperboard,
  Loader2,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { isProjectBusy, type ProjectDetail } from "./types";

interface ActionBarProps {
  project: ProjectDetail;
}

/** Floating action bar: re-generate, render, approve (+auto-schedule), delete. */
export function ActionBar({ project }: ActionBarProps) {
  const router = useRouter();
  const qc = useQueryClient();
  const [regenOpen, setRegenOpen] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [autoSchedule, setAutoSchedule] = useState(true);

  const busy = isProjectBusy(project.status);
  const keptCount = (project.clips ?? []).filter((c) => c.status === "kept").length;
  const approveBlocked = project.type === "clips" && keptCount === 0;
  const videoNoun =
    project.type === "clips" ? `${keptCount} Short${keptCount === 1 ? "" : "s"}` : "1 Short";

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["project", project.id] });
    void qc.invalidateQueries({ queryKey: ["projects"] });
  };

  const regenerate = useMutation({
    mutationFn: () => api.post(`/projects/${project.id}/generate`),
    onSuccess: () => {
      toast.success("Regenerating project", { description: "The AI pipeline is running again." });
      setRegenOpen(false);
      invalidate();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to regenerate"),
  });

  const render = useMutation({
    mutationFn: () => api.post(`/projects/${project.id}/render`),
    onSuccess: () => {
      toast.success("Render started", { description: "Track live progress in the header." });
      invalidate();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to start render"),
  });

  const approve = useMutation({
    mutationFn: () => api.post(`/projects/${project.id}/approve`, { schedule: autoSchedule }),
    onSuccess: () => {
      toast.success(`Approved — ${videoNoun} created`, {
        description: autoSchedule
          ? "Auto-scheduled into the next free slots."
          : "Waiting in Uploads, ready when you are.",
        action: { label: "View uploads", onClick: () => router.push("/uploads") },
      });
      setApproveOpen(false);
      invalidate();
      void qc.invalidateQueries({ queryKey: ["videos"] });
      void qc.invalidateQueries({ queryKey: ["schedule"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to approve"),
  });

  const del = useMutation({
    mutationFn: () => api.delete(`/projects/${project.id}`),
    onSuccess: () => {
      toast.success("Project deleted");
      void qc.invalidateQueries({ queryKey: ["projects"] });
      router.push("/projects");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to delete"),
  });

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.15 }}
        className="fixed bottom-5 right-4 z-40 sm:right-6 lg:right-8"
      >
        <div className="glass flex items-center gap-1.5 rounded-2xl p-1.5 shadow-2xl">
          <Button
            variant="secondary"
            size="sm"
            className="gap-1.5"
            disabled={busy || regenerate.isPending}
            onClick={() => setRegenOpen(true)}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Re-generate</span>
          </Button>

          {project.status === "review" && (
            <Button
              variant="secondary"
              size="sm"
              className="gap-1.5"
              disabled={render.isPending}
              onClick={() => render.mutate()}
            >
              {render.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Clapperboard className="h-3.5 w-3.5" />
              )}
              Render
            </Button>
          )}

          <Button
            size="sm"
            className="gap-1.5"
            disabled={project.status !== "review" || approve.isPending}
            onClick={() => setApproveOpen(true)}
          >
            <CheckCheck className="h-3.5 w-3.5" />
            Approve
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-red-400 hover:bg-red-500/15 hover:text-red-300"
            aria-label="Delete project"
            disabled={del.isPending}
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </motion.div>

      {/* ── Re-generate confirm ─────────────────────────────────────── */}
      <Dialog open={regenOpen} onOpenChange={setRegenOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Re-generate this project?</DialogTitle>
            <DialogDescription>
              The AI rebuilds the script, SEO pack, thumbnails and scores from scratch — manual
              edits will be overwritten.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRegenOpen(false)} disabled={regenerate.isPending}>
              Cancel
            </Button>
            <Button onClick={() => regenerate.mutate()} disabled={regenerate.isPending}>
              {regenerate.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Re-generate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Approve dialog ──────────────────────────────────────────── */}
      <Dialog open={approveOpen} onOpenChange={setApproveOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Approve project</DialogTitle>
            <DialogDescription>
              {project.type === "clips"
                ? `Creates ${videoNoun} from your kept clips, ready to upload.`
                : "Creates 1 upload-ready Short with the SEO pack applied."}
            </DialogDescription>
          </DialogHeader>

          {approveBlocked ? (
            <p className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-3 text-xs text-amber-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              No clips are kept — keep at least one clip in the Clips tab before approving.
            </p>
          ) : (
            <div className="flex items-center justify-between rounded-xl border border-border/60 bg-secondary/30 px-4 py-3">
              <div className="pr-4">
                <Label htmlFor="auto-schedule" className="inline-flex items-center gap-1.5 text-sm">
                  <CalendarClock className="h-3.5 w-3.5 text-violet-300" /> Auto-schedule
                </Label>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Drop into the next free slots from the channel&apos;s weekly schedule.
                </p>
              </div>
              <Switch id="auto-schedule" checked={autoSchedule} onCheckedChange={setAutoSchedule} />
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setApproveOpen(false)} disabled={approve.isPending}>
              Cancel
            </Button>
            <Button onClick={() => approve.mutate()} disabled={approveBlocked || approve.isPending}>
              {approve.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CheckCheck className="mr-2 h-4 w-4" />
              )}
              Approve {videoNoun}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirm ──────────────────────────────────────────── */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete this project?</DialogTitle>
            <DialogDescription>
              &ldquo;{project.title}&rdquo; and its script, clips and thumbnails will be removed
              permanently. Approved videos are kept.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)} disabled={del.isPending}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => del.mutate()} disabled={del.isPending}>
              {del.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
