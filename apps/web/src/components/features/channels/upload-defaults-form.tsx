"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Baby, Bell, Globe2, Loader2, Save, UploadCloud } from "lucide-react";
import type { UploadDefaults } from "@fable/shared";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const VISIBILITIES: { value: UploadDefaults["visibility"]; label: string; hint: string }[] = [
  { value: "public", label: "Public", hint: "Everyone can watch" },
  { value: "unlisted", label: "Unlisted", hint: "Only people with the link" },
  { value: "private", label: "Private", hint: "Only you" },
];

const CATEGORIES = [
  "Entertainment",
  "Comedy",
  "Gaming",
  "Education",
  "People & Blogs",
  "Music",
  "Science & Technology",
  "Sports",
  "Howto & Style",
];

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "en-GB", label: "English (UK)" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "pt", label: "Portuguese" },
  { value: "hi", label: "Hindi" },
  { value: "ja", label: "Japanese" },
];

function normalizeDefaults(raw: Partial<UploadDefaults> | undefined): UploadDefaults {
  return {
    visibility: raw?.visibility ?? "public",
    category: raw?.category ?? "Entertainment",
    language: raw?.language ?? "en",
    madeForKids: raw?.madeForKids ?? false,
    notifySubscribers: raw?.notifySubscribers ?? true,
  };
}

export function UploadDefaultsForm({
  channelId,
  defaults,
}: {
  channelId: string;
  defaults: Partial<UploadDefaults> | undefined;
}) {
  const qc = useQueryClient();
  const [d, setD] = useState<UploadDefaults>(() => normalizeDefaults(defaults));

  const save = useMutation({
    mutationFn: () => api.patch(`/channels/${channelId}`, { uploadDefaults: d }),
    onSuccess: () => {
      toast.success("Upload defaults saved");
      qc.invalidateQueries({ queryKey: ["channel", channelId] });
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Could not save upload defaults"),
  });

  return (
    <div className="space-y-5">
      <section className="glass rounded-2xl p-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <UploadCloud className="h-4 w-4 text-primary" /> Publishing defaults
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Applied to every Short this channel uploads — override per video from Uploads.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Visibility</Label>
            <Select
              value={d.visibility}
              onValueChange={(v) => setD({ ...d, visibility: v as UploadDefaults["visibility"] })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VISIBILITIES.map((v) => (
                  <SelectItem key={v.value} value={v.value}>
                    <span className="flex flex-col text-left">
                      <span>{v.label}</span>
                      <span className="text-[11px] text-muted-foreground">{v.hint}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select value={d.category} onValueChange={(v) => setD({ ...d, category: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              <Globe2 className="h-3.5 w-3.5 text-muted-foreground" /> Language
            </Label>
            <Select value={d.language} onValueChange={(v) => setD({ ...d, language: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGES.map((l) => (
                  <SelectItem key={l.value} value={l.value}>
                    {l.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      <section className="glass rounded-2xl p-5">
        <h3 className="text-sm font-semibold">Audience & notifications</h3>
        <div className="mt-4 space-y-4">
          <div className="flex items-center justify-between gap-4 rounded-xl border border-border/60 bg-secondary/30 p-4">
            <div className="flex items-start gap-3">
              <Baby className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div>
                <p className="text-sm font-medium">Made for kids</p>
                <p className="text-xs text-muted-foreground">
                  Marks uploads as child-directed (disables personalised ads & comments).
                </p>
              </div>
            </div>
            <Switch
              checked={d.madeForKids}
              onCheckedChange={(checked) => setD({ ...d, madeForKids: checked })}
              aria-label="Made for kids"
            />
          </div>

          <div className="flex items-center justify-between gap-4 rounded-xl border border-border/60 bg-secondary/30 p-4">
            <div className="flex items-start gap-3">
              <Bell className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div>
                <p className="text-sm font-medium">Notify subscribers</p>
                <p className="text-xs text-muted-foreground">
                  Ping the subscriber bell on every upload from this channel.
                </p>
              </div>
            </div>
            <Switch
              checked={d.notifySubscribers}
              onCheckedChange={(checked) => setD({ ...d, notifySubscribers: checked })}
              aria-label="Notify subscribers"
            />
          </div>
        </div>
      </section>

      <div className="flex justify-end">
        <Button className="gap-2" disabled={save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save defaults
        </Button>
      </div>
    </div>
  );
}
