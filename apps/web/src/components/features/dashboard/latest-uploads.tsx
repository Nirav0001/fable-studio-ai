"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Clapperboard, Eye } from "lucide-react";
import type { ChannelSummary, VideoSummary } from "@fable/shared";
import { formatCompact } from "@fable/shared";
import { cn, CHANNEL_TYPE_META } from "@/lib/utils";
import { StatusBadge } from "@/components/widgets/status-badge";
import { ScoreDial } from "@/components/widgets/score-dial";
import { EmptyState } from "@/components/widgets/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

interface LatestUploadsProps {
  uploads?: VideoSummary[];
  channels?: ChannelSummary[];
  loading: boolean;
}

export function LatestUploads({ uploads, channels, loading }: LatestUploadsProps) {
  const channelById = new Map((channels ?? []).map((c) => [c.id, c]));

  return (
    <section className="glass rounded-2xl p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="font-display text-sm font-semibold tracking-tight">Latest uploads</h2>
          <p className="text-xs text-muted-foreground">Freshly rendered & published Shorts</p>
        </div>
        <Link
          href="/uploads"
          className="flex items-center gap-1 text-xs font-medium text-primary transition-colors hover:text-accent-foreground"
        >
          View all <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {loading && (
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[120px] w-[270px] shrink-0 rounded-xl" />
          ))}
        </div>
      )}

      {!loading && (uploads ?? []).length === 0 && (
        <EmptyState
          icon={Clapperboard}
          title="No uploads yet"
          body="Generate your first AI project and it will show up here once rendered."
          action={
            <Button asChild size="sm">
              <Link href="/projects/new">Create a project</Link>
            </Button>
          }
        />
      )}

      {!loading && (uploads ?? []).length > 0 && (
        <div className="no-scrollbar -mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
          {(uploads ?? []).map((video, i) => {
            const channel = channelById.get(video.channelId);
            const meta = CHANNEL_TYPE_META[channel?.type ?? "wyr"];
            return (
              <motion.div
                key={video.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: i * 0.04 }}
                className="glass-hover flex w-[270px] shrink-0 gap-3 rounded-xl border border-border/60 bg-secondary/30 p-3"
              >
                {video.thumbnailPath ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={video.thumbnailPath}
                    alt={video.title}
                    className="h-[96px] w-[54px] shrink-0 rounded-lg object-cover"
                  />
                ) : (
                  <div
                    className={cn(
                      "flex h-[96px] w-[54px] shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-2xl",
                      meta.gradient,
                    )}
                  >
                    {meta.emoji}
                  </div>
                )}

                <div className="flex min-w-0 flex-1 flex-col justify-between py-0.5">
                  <p className="line-clamp-2 text-[13px] font-medium leading-snug" title={video.title}>
                    {video.title}
                  </p>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={video.status} />
                    <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Eye className="h-3 w-3" />
                      {formatCompact(video.views ?? 0)}
                    </span>
                  </div>
                </div>

                <div className="flex shrink-0 items-center">
                  <ScoreDial score={video.viralScore} size={44} />
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </section>
  );
}
