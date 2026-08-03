"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Hash, Loader2 } from "lucide-react";
import type { VideoStatus, VideoSummary } from "@fable/shared";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

interface VideoDetail {
  id: string;
  title: string;
  description: string;
  tags: string[];
  hashtags: string[];
  visibility: string;
  status: VideoStatus;
}

interface SeoEditDialogProps {
  video: VideoSummary | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function splitList(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function SeoEditDialog({ video, open, onOpenChange }: SeoEditDialogProps) {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [hashtags, setHashtags] = useState("");

  const detail = useQuery({
    queryKey: ["video", video?.id],
    queryFn: () => api.get<VideoDetail>(`/videos/${video?.id}`),
    enabled: open && Boolean(video),
  });

  useEffect(() => {
    if (!detail.data) return;
    setTitle(detail.data.title ?? "");
    setDescription(detail.data.description ?? "");
    setTags(Array.isArray(detail.data.tags) ? detail.data.tags.join(", ") : "");
    setHashtags(Array.isArray(detail.data.hashtags) ? detail.data.hashtags.join(", ") : "");
  }, [detail.data]);

  const save = useMutation({
    mutationFn: () =>
      api.patch(`/videos/${video?.id}`, {
        title: title.trim(),
        description,
        tags: splitList(tags),
        hashtags: splitList(hashtags).map((h) => (h.startsWith("#") ? h : `#${h}`)),
      }),
    onSuccess: () => {
      toast.success("SEO updated", { description: "Title, description and tags saved." });
      void qc.invalidateQueries({ queryKey: ["videos"] });
      void qc.invalidateQueries({ queryKey: ["video", video?.id] });
      onOpenChange(false);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to save SEO"),
  });

  const loading = detail.isLoading || detail.isFetching;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit SEO</DialogTitle>
          <DialogDescription>
            Fine-tune the metadata YouTube sees before this Short goes live.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="space-y-4 py-2">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : (
          <form
            className="space-y-4 py-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!title.trim()) {
                toast.error("Title can't be empty");
                return;
              }
              save.mutate();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="seo-title">Title</Label>
              <Input
                id="seo-title"
                value={title}
                maxLength={100}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Attention-grabbing title"
              />
              <p className="text-right text-[11px] text-muted-foreground">{title.length}/100</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="seo-desc">Description</Label>
              <Textarea
                id="seo-desc"
                value={description}
                rows={4}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Description with keywords, links and CTAs"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="seo-tags">Tags</Label>
              <Input
                id="seo-tags"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="shorts, would you rather, quiz"
              />
              <p className="text-[11px] text-muted-foreground">Comma separated.</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="seo-hashtags" className="inline-flex items-center gap-1">
                <Hash className="h-3.5 w-3.5" /> Hashtags
              </Label>
              <Input
                id="seo-hashtags"
                value={hashtags}
                onChange={(e) => setHashtags(e.target.value)}
                placeholder="#shorts, #quiz, #wouldyourather"
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={save.isPending}>
                Cancel
              </Button>
              <Button type="submit" disabled={save.isPending}>
                {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save SEO
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
