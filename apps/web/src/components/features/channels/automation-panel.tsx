"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { Bot, CheckCircle2, Clock, Flame, Gauge, Loader2, Play } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";

interface AutomationConfig {
  videosPerDay?: number;
  minViralScore?: number;
  autoApprove?: boolean;
  themeRotation?: boolean;
}

interface AutomationRuleRow {
  channelId: string;
  channelName: string;
  enabled: boolean;
  config: AutomationConfig;
  lastRunAt: string | null;
}

export function AutomationPanel({ channelId }: { channelId: string }) {
  const { data: rules, isLoading } = useQuery({
    queryKey: ["automation"],
    queryFn: () => api.get<AutomationRuleRow[]>("/automation"),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-56 rounded-2xl" />
      </div>
    );
  }

  const rule = (rules ?? []).find((r) => r.channelId === channelId);
  // Key by rule identity so local slider state re-seeds if the rule appears after first save.
  return <AutomationInner key={rule ? "rule" : "none"} channelId={channelId} rule={rule} />;
}

function AutomationInner({
  channelId,
  rule,
}: {
  channelId: string;
  rule: AutomationRuleRow | undefined;
}) {
  const qc = useQueryClient();
  const router = useRouter();

  const [enabled, setEnabled] = useState(rule?.enabled ?? false);
  const [videosPerDay, setVideosPerDay] = useState(rule?.config.videosPerDay ?? 3);
  const [minViralScore, setMinViralScore] = useState(rule?.config.minViralScore ?? 60);
  const [autoApprove, setAutoApprove] = useState(rule?.config.autoApprove ?? false);

  const save = useMutation({
    mutationFn: (body: { enabled: boolean; config: AutomationConfig }) =>
      api.patch(`/automation/${channelId}`, body),
    onSuccess: () => {
      toast.success("Automation updated");
      qc.invalidateQueries({ queryKey: ["automation"] });
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Could not update automation"),
  });

  const persist = (patch: {
    enabled?: boolean;
    videosPerDay?: number;
    minViralScore?: number;
    autoApprove?: boolean;
  }) => {
    save.mutate({
      enabled: patch.enabled ?? enabled,
      config: {
        ...rule?.config,
        videosPerDay: patch.videosPerDay ?? videosPerDay,
        minViralScore: patch.minViralScore ?? minViralScore,
        autoApprove: patch.autoApprove ?? autoApprove,
      },
    });
  };

  const runNow = useMutation({
    mutationFn: () => api.post<{ projectId: string }>(`/automation/run/${channelId}`),
    onSuccess: ({ projectId }) => {
      toast.success("Automation cycle started — generating a fresh project", {
        action: { label: "View project", onClick: () => router.push(`/projects/${projectId}`) },
      });
      qc.invalidateQueries({ queryKey: ["automation"] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["jobs"] });
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Could not start automation run"),
  });

  return (
    <div className="space-y-5">
      {/* Master switch */}
      <section className="glass flex flex-wrap items-center justify-between gap-4 rounded-2xl p-5">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors",
              enabled ? "gradient-primary text-white" : "bg-secondary text-muted-foreground",
            )}
          >
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <p className="font-display text-base font-semibold tracking-tight">Autopilot</p>
            <p className="max-w-md text-xs text-muted-foreground">
              Generates, scores and queues Shorts on this channel&apos;s schedule with zero clicks.
            </p>
            <p className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground/70">
              <Clock className="h-3 w-3" />
              {rule?.lastRunAt
                ? `Last run ${formatDistanceToNow(new Date(rule.lastRunAt), { addSuffix: true })}`
                : "Never run yet"}
            </p>
          </div>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={(checked) => {
            setEnabled(checked);
            persist({ enabled: checked });
          }}
          aria-label="Enable automation"
        />
      </section>

      {/* Rule config */}
      <section className={cn("glass rounded-2xl p-5 transition-opacity", !enabled && "opacity-60")}>
        <h3 className="text-sm font-semibold">Pilot rules</h3>
        <div className="mt-5 space-y-7">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-1.5">
                <Gauge className="h-3.5 w-3.5 text-primary" /> Videos per day
              </Label>
              <span className="rounded-lg border border-primary/25 bg-primary/10 px-2 py-0.5 text-sm font-semibold tabular-nums text-violet-200">
                {videosPerDay}
              </span>
            </div>
            <Slider
              min={1}
              max={6}
              step={1}
              value={[videosPerDay]}
              onValueChange={([v]) => setVideosPerDay(v)}
              onValueCommit={([v]) => persist({ videosPerDay: v })}
              aria-label="Videos per day"
            />
            <p className="text-[11px] text-muted-foreground">
              How many fresh Shorts the pilot generates each day.
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-1.5">
                <Flame className="h-3.5 w-3.5 text-primary" /> Minimum viral score
              </Label>
              <span className="rounded-lg border border-primary/25 bg-primary/10 px-2 py-0.5 text-sm font-semibold tabular-nums text-violet-200">
                {minViralScore}
              </span>
            </div>
            <Slider
              min={0}
              max={100}
              step={5}
              value={[minViralScore]}
              onValueChange={([v]) => setMinViralScore(v)}
              onValueCommit={([v]) => persist({ minViralScore: v })}
              aria-label="Minimum viral score"
            />
            <p className="text-[11px] text-muted-foreground">
              Generations scoring below this are discarded and retried instead of published.
            </p>
          </div>

          <div className="flex items-center justify-between gap-4 rounded-xl border border-border/60 bg-secondary/30 p-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div>
                <p className="text-sm font-medium">Auto-approve renders</p>
                <p className="text-xs text-muted-foreground">
                  Skip manual review — passing projects render and enter the upload queue
                  automatically.
                </p>
              </div>
            </div>
            <Switch
              checked={autoApprove}
              onCheckedChange={(checked) => {
                setAutoApprove(checked);
                persist({ autoApprove: checked });
              }}
              aria-label="Auto-approve renders"
            />
          </div>
        </div>
      </section>

      {/* Run now */}
      <section className="glass flex flex-wrap items-center justify-between gap-4 rounded-2xl p-5">
        <div>
          <p className="text-sm font-medium">Run a cycle now</p>
          <p className="text-xs text-muted-foreground">
            Kicks off one generation immediately using the rules above — great for testing.
          </p>
        </div>
        <Button
          className="gap-2"
          disabled={runNow.isPending}
          onClick={() => runNow.mutate()}
        >
          {runNow.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Play className="h-4 w-4" />
          )}
          Run now
        </Button>
      </section>
    </div>
  );
}
