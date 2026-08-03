"use client";

import { motion } from "framer-motion";
import { Layers } from "lucide-react";
import type { ChannelSummary } from "@fable/shared";
import { cn, CHANNEL_TYPE_META } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

interface ChannelTabsProps {
  channels?: ChannelSummary[];
  selected: string; // "all" or channelId
  onSelect: (id: string) => void;
  loading: boolean;
}

export function ChannelTabs({ channels, selected, onSelect, loading }: ChannelTabsProps) {
  if (loading) {
    return (
      <div className="flex gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-32 rounded-full" />
        ))}
      </div>
    );
  }

  const tabs: { id: string; label: string; color?: string; emoji?: string }[] = [
    { id: "all", label: "All channels" },
    ...(channels ?? []).map((c) => ({
      id: c.id,
      label: c.name,
      color: c.avatarColor,
      emoji: CHANNEL_TYPE_META[c.type]?.emoji,
    })),
  ];

  return (
    <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      {tabs.map((tab) => {
        const active = selected === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onSelect(tab.id)}
            className={cn(
              "relative flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors",
              active
                ? "border-transparent text-foreground"
                : "border-border/70 bg-secondary/30 text-muted-foreground hover:border-primary/40 hover:text-foreground",
            )}
          >
            {active && (
              <motion.span
                layoutId="analytics-channel-tab"
                className="absolute inset-0 rounded-full border border-primary/30 bg-primary/15"
                transition={{ type: "spring", stiffness: 400, damping: 32 }}
              />
            )}
            {tab.id === "all" ? (
              <Layers className={cn("relative h-3.5 w-3.5", active && "text-primary")} />
            ) : (
              <span
                className="relative h-2.5 w-2.5 rounded-full"
                style={{ background: tab.color ?? "#8b5cf6" }}
              />
            )}
            <span className="relative">
              {tab.emoji ? `${tab.emoji} ` : ""}
              {tab.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
