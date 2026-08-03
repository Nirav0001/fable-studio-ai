"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Save, Wand2 } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface PromptOverrides {
  titleStyle: string;
  descriptionStyle: string;
  extraInstructions: string;
}

const FIELDS: {
  key: keyof PromptOverrides;
  label: string;
  hint: string;
  placeholder: string;
  rows: number;
}[] = [
  {
    key: "titleStyle",
    label: "Title style",
    hint: "How the AI should write titles for this channel.",
    placeholder:
      "ALL-CAPS curiosity gap, max 45 characters, always end with one emoji. Example: 99% PICK WRONG 🤯",
    rows: 3,
  },
  {
    key: "descriptionStyle",
    label: "Description style",
    hint: "Tone and structure for video descriptions.",
    placeholder:
      "Two punchy lines, a question that begs a comment, then hashtags on the final line. Never mention AI.",
    rows: 3,
  },
  {
    key: "extraInstructions",
    label: "Extra instructions",
    hint: "Anything else — banned words, running jokes, niche context. Appended to every generation.",
    placeholder:
      "Audience is UK teens. Reference football and school life where natural. Never use the word 'literally'.",
    rows: 5,
  },
];

function normalizePrompts(raw: Record<string, string> | undefined): PromptOverrides {
  return {
    titleStyle: raw?.titleStyle ?? "",
    descriptionStyle: raw?.descriptionStyle ?? "",
    extraInstructions: raw?.extraInstructions ?? "",
  };
}

export function PromptsForm({
  channelId,
  prompts,
}: {
  channelId: string;
  prompts: Record<string, string> | undefined;
}) {
  const qc = useQueryClient();
  const [p, setP] = useState<PromptOverrides>(() => normalizePrompts(prompts));

  const save = useMutation({
    mutationFn: () => api.patch(`/channels/${channelId}`, { prompts: p }),
    onSuccess: () => {
      toast.success("Prompt overrides saved");
      qc.invalidateQueries({ queryKey: ["channel", channelId] });
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Could not save prompts"),
  });

  return (
    <div className="space-y-5">
      <section className="glass rounded-2xl p-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Wand2 className="h-4 w-4 text-primary" /> AI prompt overrides
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          These are merged into every script, SEO and thumbnail generation for this channel. Leave a
          field blank to use the Fable house style.
        </p>

        <div className="mt-5 space-y-5">
          {FIELDS.map((field) => (
            <div key={field.key} className="space-y-1.5">
              <Label htmlFor={`prompt-${field.key}`}>{field.label}</Label>
              <p className="text-[11px] text-muted-foreground">{field.hint}</p>
              <Textarea
                id={`prompt-${field.key}`}
                rows={field.rows}
                placeholder={field.placeholder}
                value={p[field.key]}
                onChange={(e) => setP({ ...p, [field.key]: e.target.value })}
              />
            </div>
          ))}
        </div>
      </section>

      <div className="flex justify-end">
        <Button className="gap-2" disabled={save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save prompts
        </Button>
      </div>
    </div>
  );
}
