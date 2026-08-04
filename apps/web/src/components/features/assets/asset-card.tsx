"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Clock, HardDrive, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatDuration } from "@fable/shared";
import { api } from "@/lib/api";
import { EASE_OUT, staggerDelay } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ASSET_KIND_META,
  AUDIO_KINDS,
  IMAGE_KINDS,
  formatBytes,
  type AssetT,
} from "./asset-kinds";

interface AssetCardProps {
  asset: AssetT;
  index: number;
  /** Called after a rename or delete succeeds so the parent can refetch. */
  onChanged: () => void;
}

export function AssetCard({ asset, index, onChanged }: AssetCardProps) {
  const meta = ASSET_KIND_META[asset.kind];
  const Icon = meta.icon;

  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(asset.name);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const rename = useMutation({
    mutationFn: (name: string) => api.patch<AssetT>(`/assets/${asset.id}`, { name }),
    onSuccess: () => {
      toast.success("Asset renamed");
      onChanged();
    },
    onError: (err) =>
      toast.error("Rename failed", {
        description: err instanceof Error ? err.message : undefined,
      }),
  });

  const remove = useMutation({
    mutationFn: () => api.delete<Record<string, never>>(`/assets/${asset.id}`),
    onSuccess: () => {
      toast.success(`Deleted ${asset.name}`);
      setConfirmOpen(false);
      onChanged();
    },
    onError: (err) =>
      toast.error("Delete failed", {
        description: err instanceof Error ? err.message : undefined,
      }),
  });

  function commitRename() {
    setEditing(false);
    const next = draftName.trim();
    if (!next || next === asset.name) {
      setDraftName(asset.name);
      return;
    }
    rename.mutate(next);
  }

  const showAudio = AUDIO_KINDS.includes(asset.kind) && !!asset.url;
  const showImage = IMAGE_KINDS.includes(asset.kind) && !!asset.url;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: EASE_OUT, delay: staggerDelay(index) }}
      className="glass glass-hover flex flex-col gap-3 rounded-2xl p-4"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <div
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
              meta.bg,
            )}
          >
            <Icon className={cn("h-[18px] w-[18px]", meta.text)} />
          </div>
          <span
            className={cn(
              "rounded-full border border-border/70 bg-secondary/50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
              meta.text,
            )}
          >
            {meta.label}
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 text-muted-foreground hover:text-red-400"
          aria-label={`Delete ${asset.name}`}
          onClick={() => setConfirmOpen(true)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {showImage && asset.url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={asset.url}
          alt={asset.name}
          className="h-28 w-full rounded-xl border border-border/50 bg-background/40 object-contain p-1"
        />
      )}

      {showAudio && asset.url && (
        <audio controls preload="none" src={asset.url} className="h-9 w-full" />
      )}

      <div className="min-w-0">
        {editing ? (
          <Input
            autoFocus
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") {
                setDraftName(asset.name);
                setEditing(false);
              }
            }}
            className="h-8 text-sm"
          />
        ) : (
          <p
            className="cursor-text truncate text-sm font-medium"
            title={`${asset.name} — double-click to rename`}
            onDoubleClick={() => {
              setDraftName(asset.name);
              setEditing(true);
            }}
          >
            {asset.name}
          </p>
        )}

        <div className="mt-1.5 flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <HardDrive className="h-3 w-3" />
            {formatBytes(asset.sizeBytes)}
          </span>
          {asset.durationSec != null && asset.durationSec > 0 && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatDuration(asset.durationSec)}
            </span>
          )}
        </div>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete asset?</DialogTitle>
            <DialogDescription>
              “{asset.name}” will be removed from your library and its file deleted. This cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => remove.mutate()}
            >
              {remove.isPending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
