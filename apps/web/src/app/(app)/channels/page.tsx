"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Tv } from "lucide-react";
import type { ChannelSummary } from "@fable/shared";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/widgets/page-header";
import { EmptyState } from "@/components/widgets/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ChannelCard } from "@/components/features/channels/channel-card";
import { NewChannelDialog } from "@/components/features/channels/new-channel-dialog";

export default function ChannelsPage() {
  return (
    <Suspense fallback={<ChannelsSkeleton />}>
      <ChannelsView />
    </Suspense>
  );
}

function ChannelsView() {
  const qc = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: channels, isLoading } = useQuery({
    queryKey: ["channels"],
    queryFn: () => api.get<ChannelSummary[]>("/channels"),
  });

  // OAuth callback lands back here with ?connected=1 (or 0 + optional error).
  // Announce the outcome once, then clean the URL.
  const connectedHandled = useRef(false);
  const connectedFlag = searchParams.get("connected");
  const oauthError = searchParams.get("error");
  useEffect(() => {
    if (!connectedFlag || connectedHandled.current) return;
    connectedHandled.current = true;
    if (connectedFlag === "1") {
      toast.success("Channel connected");
      qc.invalidateQueries({ queryKey: ["channels"] });
    } else {
      toast.error("YouTube connection didn't complete", {
        description:
          oauthError === "access_denied"
            ? "Google access was declined — hit Connect to try again."
            : oauthError
              ? `Google said: ${oauthError}. Check your YouTube keys in Settings → Provider keys, then retry.`
              : "Check your YouTube keys in Settings → Provider keys (and the Google redirect URI), then retry.",
      });
    }
    router.replace("/channels");
  }, [connectedFlag, oauthError, qc, router]);

  const list = channels ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Channels"
        description="Every faceless channel you run — branding, cadence and automation per channel."
        actions={
          <Button className="gap-1.5" onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4" /> New channel
          </Button>
        }
      />

      {isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[220px] rounded-2xl" />
          ))}
        </div>
      )}

      {!isLoading && list.length === 0 && (
        <EmptyState
          icon={Tv}
          title="No channels yet"
          body="Create your first channel and Fable will handle scripts, renders, SEO and uploads."
          action={
            <Button className="gap-1.5" onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4" /> Create your first channel
            </Button>
          }
        />
      )}

      {!isLoading && list.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((channel, i) => (
            <ChannelCard key={channel.id} channel={channel} index={i} />
          ))}
        </div>
      )}

      <NewChannelDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}

function ChannelsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-44" />
        <Skeleton className="h-4 w-80" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-[220px] rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
