"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import type { AnalyticsOverviewT } from "@fable/shared";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/widgets/page-header";
import { Button } from "@/components/ui/button";
import { StatGrid } from "@/components/features/dashboard/stat-grid";
import { LatestUploads } from "@/components/features/dashboard/latest-uploads";
import { UpcomingList } from "@/components/features/dashboard/upcoming-list";
import { QueuePanel } from "@/components/features/dashboard/queue-panel";
import { TrendsPanel } from "@/components/features/dashboard/trends-panel";
import { ChannelsRow } from "@/components/features/dashboard/channels-row";

export default function DashboardPage() {
  const { data: overview, isLoading } = useQuery({
    queryKey: ["analytics", "overview"],
    queryFn: () => api.get<AnalyticsOverviewT>("/analytics/overview"),
    refetchInterval: 30_000,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Your faceless empire at a glance — live pipeline, uploads and trends."
        actions={
          <Button asChild className="gap-1.5">
            <Link href="/projects/new">
              <Sparkles className="h-4 w-4" /> New project
            </Link>
          </Button>
        }
      />

      <StatGrid overview={overview} />

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="min-w-0 space-y-6 xl:col-span-2">
          <LatestUploads
            uploads={overview?.latestUploads}
            channels={overview?.channels}
            loading={isLoading}
          />
          <ChannelsRow channels={overview?.channels} loading={isLoading} />
          <TrendsPanel />
        </div>

        <div className="min-w-0 space-y-6">
          <QueuePanel />
          <UpcomingList
            slots={overview?.upcomingUploads}
            channels={overview?.channels}
            loading={isLoading}
          />
        </div>
      </div>
    </div>
  );
}
