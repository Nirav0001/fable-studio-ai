"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FlaskConical, Loader2, Plus, Trophy, X } from "lucide-react";
import type { VideoSummary } from "@fable/shared";
import { safeJson } from "@fable/shared";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

interface AbTestRow {
  id: string;
  kind: string;
  status: string;
  winnerIdx: number | null;
  variants?: unknown;
  variantsJson?: string;
  createdAt: string;
}

interface VideoDetailWithTests {
  id: string;
  title: string;
  abTests?: AbTestRow[];
}

function testVariants(t: AbTestRow): string[] {
  if (Array.isArray(t.variants)) return t.variants.map(String);
  return safeJson<string[]>(t.variantsJson, []);
}

interface AbTestDialogProps {
  video: VideoSummary | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AbTestDialog({ video, open, onOpenChange }: AbTestDialogProps) {
  const qc = useQueryClient();
  const [kind, setKind] = useState<"title" | "thumbnail">("title");
  const [variants, setVariants] = useState<string[]>(["", ""]);

  useEffect(() => {
    if (!open) return;
    setKind("title");
    setVariants(["", ""]);
  }, [open, video?.id]);

  const detail = useQuery({
    queryKey: ["video", video?.id],
    queryFn: () => api.get<VideoDetailWithTests>(`/videos/${video?.id}`),
    enabled: open && Boolean(video),
  });

  const tests = detail.data?.abTests ?? [];
  const running = tests.filter((t) => t.status === "running");

  const create = useMutation({
    mutationFn: () =>
      api.post<AbTestRow>(`/videos/${video?.id}/abtest`, {
        kind,
        variants: variants.map((v) => v.trim()).filter(Boolean),
      }),
    onSuccess: () => {
      toast.success("A/B test started", {
        description: `Testing ${variants.filter((v) => v.trim()).length} ${kind} variants — the winner is picked automatically.`,
      });
      setVariants(["", ""]);
      void qc.invalidateQueries({ queryKey: ["video", video?.id] });
      void qc.invalidateQueries({ queryKey: ["videos"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to start test"),
  });

  const filled = variants.map((v) => v.trim()).filter(Boolean);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-primary" />
            A/B test
            {running.length > 0 && (
              <Badge className="ml-1 border-violet-500/30 bg-violet-500/15 text-violet-300">
                <span className="mr-1.5 inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-violet-400" />
                {running.length} running
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription className="line-clamp-2">
            {video ? `Pit variants against each other on "${video.title}".` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>What to test</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as "title" | "thumbnail")}>
              <SelectTrigger>
                <SelectValue placeholder="Pick a test kind" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="title">Title</SelectItem>
                <SelectItem value="thumbnail">Thumbnail headline</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Variants ({filled.length}/3)</Label>
            {variants.map((v, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-secondary/50 text-xs font-bold text-muted-foreground">
                  {String.fromCharCode(65 + i)}
                </span>
                <Input
                  value={v}
                  onChange={(e) =>
                    setVariants((prev) => prev.map((p, j) => (j === i ? e.target.value : p)))
                  }
                  placeholder={
                    kind === "title" ? `Title variant ${String.fromCharCode(65 + i)}` : `Headline variant ${String.fromCharCode(65 + i)}`
                  }
                />
                {variants.length > 2 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-muted-foreground"
                    aria-label={`Remove variant ${String.fromCharCode(65 + i)}`}
                    onClick={() => setVariants((prev) => prev.filter((_, j) => j !== i))}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
            {variants.length < 3 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full border-dashed"
                onClick={() => setVariants((prev) => [...prev, ""])}
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Add third variant
              </Button>
            )}
          </div>

          {(detail.isLoading || tests.length > 0) && (
            <>
              <Separator />
              <div className="space-y-2">
                <Label className="text-muted-foreground">Existing tests</Label>
                {detail.isLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                  </div>
                ) : (
                  <div className="max-h-44 space-y-2 overflow-y-auto pr-1">
                    {tests.map((t) => {
                      const vs = testVariants(t);
                      const decided = t.status !== "running" && t.winnerIdx !== null;
                      return (
                        <div
                          key={t.id}
                          className="rounded-xl border border-border/60 bg-secondary/30 p-2.5"
                        >
                          <div className="flex items-center gap-2">
                            <Badge
                              className={cn(
                                "capitalize",
                                t.status === "running"
                                  ? "border-violet-500/30 bg-violet-500/15 text-violet-300"
                                  : "border-emerald-500/30 bg-emerald-500/15 text-emerald-300",
                              )}
                            >
                              {t.status === "running" && (
                                <span className="mr-1.5 inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-violet-400" />
                              )}
                              {t.status}
                            </Badge>
                            <span className="text-xs capitalize text-muted-foreground">{t.kind}</span>
                          </div>
                          <div className="mt-1.5 space-y-0.5">
                            {vs.map((variant, i) => (
                              <div
                                key={i}
                                className={cn(
                                  "flex items-center gap-1.5 truncate text-xs",
                                  decided && t.winnerIdx === i
                                    ? "font-semibold text-emerald-300"
                                    : "text-muted-foreground",
                                )}
                              >
                                {decided && t.winnerIdx === i ? (
                                  <Trophy className="h-3 w-3 shrink-0" />
                                ) : (
                                  <span className="w-3 shrink-0 text-center text-[10px]">
                                    {String.fromCharCode(65 + i)}
                                  </span>
                                )}
                                <span className="truncate">{variant}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={create.isPending}>
            Close
          </Button>
          <Button
            onClick={() => {
              if (filled.length < 2) {
                toast.error("Enter at least two variants");
                return;
              }
              create.mutate();
            }}
            disabled={create.isPending || filled.length < 2}
          >
            {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Start test
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
