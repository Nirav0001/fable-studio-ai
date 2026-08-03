"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

interface PrefRow {
  key: string;
  label: string;
  description: string;
  defaultValue: boolean;
}

const PREF_ROWS: PrefRow[] = [
  {
    key: "renderDone",
    label: "Render complete",
    description: "When a project finishes rendering and is ready to review",
    defaultValue: true,
  },
  {
    key: "uploadDone",
    label: "Upload published",
    description: "When a video goes live on YouTube",
    defaultValue: true,
  },
  {
    key: "uploadFailed",
    label: "Upload failed",
    description: "When an upload errors out after all retries",
    defaultValue: true,
  },
  {
    key: "trendAlerts",
    label: "Trend alerts",
    description: "Trending formats and topics worth jumping on",
    defaultValue: true,
  },
  {
    key: "discordEnabled",
    label: "Discord webhook",
    description: "Mirror every notification to your Discord server",
    defaultValue: false,
  },
];

interface NotificationPrefsProps {
  preferences: Record<string, unknown>;
}

export function NotificationPrefs({ preferences }: NotificationPrefsProps) {
  const qc = useQueryClient();
  // Local overrides give instant feedback; server state wins again on refetch.
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});

  const save = useMutation({
    mutationFn: (change: { key: string; value: boolean }) =>
      api.patch<unknown>("/settings", { preferences: { [change.key]: change.value } }),
    onSuccess: (_data, change) => {
      const row = PREF_ROWS.find((r) => r.key === change.key);
      toast.success(`${row?.label ?? "Preference"} ${change.value ? "on" : "off"}`);
      qc.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: (err, change) => {
      setOverrides((prev) => {
        const next = { ...prev };
        delete next[change.key];
        return next;
      });
      toast.error("Could not save preference", {
        description: err instanceof Error ? err.message : undefined,
      });
    },
  });

  function valueFor(row: PrefRow): boolean {
    if (row.key in overrides) return overrides[row.key];
    const raw = preferences[row.key];
    return typeof raw === "boolean" ? raw : row.defaultValue;
  }

  function toggle(row: PrefRow, checked: boolean) {
    setOverrides((prev) => ({ ...prev, [row.key]: checked }));
    save.mutate({ key: row.key, value: checked });
  }

  return (
    <div className="glass rounded-2xl p-5">
      <div className="divide-y divide-border/50">
        {PREF_ROWS.map((row) => {
          const id = `pref-${row.key}`;
          return (
            <div key={row.key} className="flex items-center justify-between gap-4 py-3">
              <div className="min-w-0">
                <Label htmlFor={id} className="text-sm font-medium">
                  {row.label}
                </Label>
                <p className="mt-0.5 text-xs text-muted-foreground">{row.description}</p>
              </div>
              <Switch id={id} checked={valueFor(row)} onCheckedChange={(v) => toggle(row, v)} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
