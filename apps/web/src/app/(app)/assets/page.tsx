"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { FolderOpen } from "lucide-react";
import type { AssetKind } from "@fable/shared";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/widgets/page-header";
import { EmptyState } from "@/components/widgets/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AssetCard } from "@/components/features/assets/asset-card";
import { UploadDropzone } from "@/components/features/assets/upload-dropzone";
import {
  ASSET_KINDS,
  ASSET_KIND_META,
  type AssetT,
} from "@/components/features/assets/asset-kinds";

type KindFilter = "all" | AssetKind;

export default function AssetsPage() {
  const qc = useQueryClient();
  const [kind, setKind] = useState<KindFilter>("all");

  const { data: assets, isLoading } = useQuery({
    queryKey: ["assets", kind],
    queryFn: () => api.get<AssetT[]>(kind === "all" ? "/assets" : `/assets?kind=${kind}`),
  });

  const refetchAssets = () => qc.invalidateQueries({ queryKey: ["assets"] });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Assets"
        description="Music, SFX, logos, fonts and clips available to the render pipeline."
      />

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <UploadDropzone onUploaded={refetchAssets} />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.04 }}
      >
        <Tabs value={kind} onValueChange={(v) => setKind(v as KindFilter)}>
          <TabsList className="no-scrollbar h-auto w-full justify-start gap-1 overflow-x-auto p-1">
            <TabsTrigger value="all">All</TabsTrigger>
            {ASSET_KINDS.map((k) => (
              <TabsTrigger key={k} value={k}>
                {ASSET_KIND_META[k].label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </motion.div>

      {isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-2xl" />
          ))}
        </div>
      )}

      {!isLoading && (assets ?? []).length === 0 && (
        <EmptyState
          icon={FolderOpen}
          title={kind === "all" ? "No assets yet" : `No ${ASSET_KIND_META[kind as AssetKind].label.toLowerCase()} assets`}
          body="Drop music, logos, fonts or clips into the zone above — renders pick them up automatically."
        />
      )}

      {!isLoading && (assets ?? []).length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {(assets ?? []).map((asset, i) => (
            <AssetCard key={asset.id} asset={asset} index={i} onChanged={refetchAssets} />
          ))}
        </div>
      )}
    </div>
  );
}
