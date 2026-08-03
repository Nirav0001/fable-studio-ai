"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** Normalised template shape used across the templates page. */
export interface TemplateT {
  id: string;
  name: string;
  kind: string;
  description: string;
  accent: string;
  builtIn: boolean;
  config: Record<string, unknown>;
  createdAt: string;
}

export const TEMPLATE_KINDS: { value: string; label: string; blurb: string }[] = [
  { value: "wyr", label: "Would You Rather", blurb: "Question pacing, timers and reveal styling" },
  { value: "clips", label: "AI Clips", blurb: "Caption styles, zooms and meme overlays" },
  { value: "top5", label: "Top 5 Countdown", blurb: "Countdown cards and number stingers" },
  { value: "caption", label: "Captions", blurb: "Word-by-word caption presets" },
  { value: "thumbnail", label: "Thumbnails", blurb: "Headline layouts and colour ways" },
];

export const ACCENT_SWATCHES = [
  "#8b5cf6",
  "#a855f7",
  "#d946ef",
  "#ec4899",
  "#f43f5e",
  "#f59e0b",
  "#10b981",
  "#0ea5e9",
];

const STYLE_OPTIONS = ["punchy", "clean", "chaotic"] as const;
const PACE_OPTIONS = ["slow", "medium", "fast", "rapid"] as const;

interface FormState {
  name: string;
  kind: string;
  description: string;
  accent: string;
  style: string;
  pace: string;
  cta: string;
}

function initialForm(template: TemplateT | null): FormState {
  return {
    name: template?.name ?? "",
    kind: template?.kind ?? "wyr",
    description: template?.description ?? "",
    accent: template?.accent ?? ACCENT_SWATCHES[0],
    style: typeof template?.config.style === "string" ? template.config.style : "punchy",
    pace: typeof template?.config.pace === "string" ? template.config.pace : "fast",
    cta: typeof template?.config.cta === "string" ? template.config.cta : "Follow for part 2!",
  };
}

interface TemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pass an existing template to edit, or null to create. */
  template: TemplateT | null;
}

export function TemplateDialog({ open, onOpenChange, template }: TemplateDialogProps) {
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>(() => initialForm(template));

  useEffect(() => {
    if (open) setForm(initialForm(template));
  }, [open, template]);

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: form.name.trim(),
        kind: form.kind,
        description: form.description.trim(),
        accent: form.accent,
        config: {
          ...(template?.config ?? {}),
          style: form.style,
          pace: form.pace,
          cta: form.cta.trim(),
        },
      };
      return template
        ? api.patch<TemplateT>(`/templates/${template.id}`, body)
        : api.post<TemplateT>("/templates", body);
    },
    onSuccess: () => {
      toast.success(template ? "Template updated" : "Template created");
      qc.invalidateQueries({ queryKey: ["templates"] });
      onOpenChange(false);
    },
    onError: (err) =>
      toast.error("Could not save template", {
        description: err instanceof Error ? err.message : undefined,
      }),
  });

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{template ? "Edit template" : "New template"}</DialogTitle>
          <DialogDescription>
            Styling presets applied when generating projects of this kind.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="template-name">Name</Label>
              <Input
                id="template-name"
                value={form.name}
                placeholder="Neon Chaos"
                onChange={(e) => set("name", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Kind</Label>
              <Select value={form.kind} onValueChange={(v) => set("kind", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick a kind" />
                </SelectTrigger>
                <SelectContent>
                  {TEMPLATE_KINDS.map((k) => (
                    <SelectItem key={k.value} value={k.value}>
                      {k.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="template-description">Description</Label>
            <Textarea
              id="template-description"
              rows={2}
              value={form.description}
              placeholder="High-energy look with heavy shake and emoji rain"
              onChange={(e) => set("description", e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Accent colour</Label>
            <div className="flex flex-wrap gap-2">
              {ACCENT_SWATCHES.map((color) => (
                <button
                  key={color}
                  type="button"
                  aria-label={`Accent ${color}`}
                  onClick={() => set("accent", color)}
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full transition-transform hover:scale-110",
                    form.accent === color && "ring-2 ring-foreground/70 ring-offset-2 ring-offset-background",
                  )}
                  style={{ backgroundColor: color }}
                >
                  {form.accent === color && <Check className="h-4 w-4 text-white" />}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Style</Label>
              <Select value={form.style} onValueChange={(v) => set("style", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STYLE_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s} className="capitalize">
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Pace</Label>
              <Select value={form.pace} onValueChange={(v) => set("pace", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PACE_OPTIONS.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p.charAt(0).toUpperCase() + p.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="template-cta">CTA text</Label>
            <Input
              id="template-cta"
              value={form.cta}
              placeholder="Follow for part 2!"
              onChange={(e) => set("cta", e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!form.name.trim() || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? "Saving…" : template ? "Save changes" : "Create template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
