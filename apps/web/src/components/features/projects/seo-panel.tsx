"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Copy,
  Hash,
  Loader2,
  Newspaper,
  Pin,
  Plus,
  Save,
  Sparkles,
  Tag,
  X,
  type LucideIcon,
} from "lucide-react";
import type { SeoPack, TitleIdea } from "@fable/shared";
import { api } from "@/lib/api";
import { cn, scoreColor } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";

/* ── Chip editor ───────────────────────────────────────────────────────────── */

function ChipEditor({
  label,
  icon: Icon,
  values,
  onChange,
  placeholder,
  prefix = "",
  disabled,
}: {
  label: string;
  icon: LucideIcon;
  values: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  prefix?: string;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState("");

  const commit = () => {
    const raw = draft.trim().replace(/,+$/, "");
    if (!raw) return;
    const value = prefix && !raw.startsWith(prefix) ? `${prefix}${raw}` : raw;
    if (!values.includes(value)) onChange([...values, value]);
    setDraft("");
  };

  return (
    <div className="space-y-1.5">
      <Label className="inline-flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5" /> {label}
      </Label>
      <div
        className={cn(
          "flex min-h-[42px] flex-wrap items-center gap-1.5 rounded-xl border border-border/70 bg-secondary/40 px-2.5 py-2",
          disabled && "opacity-60",
        )}
      >
        {values.map((v) => (
          <span
            key={v}
            className="inline-flex items-center gap-1 rounded-full border border-violet-500/25 bg-violet-500/10 px-2 py-0.5 text-[11px] font-medium text-violet-300"
          >
            {v}
            {!disabled && (
              <button
                type="button"
                aria-label={`Remove ${v}`}
                onClick={() => onChange(values.filter((x) => x !== v))}
                className="text-violet-300/70 transition-colors hover:text-red-300"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </span>
        ))}
        {!disabled && (
          <input
            value={draft}
            onChange={(e) => {
              if (e.target.value.endsWith(",")) {
                setDraft(e.target.value.slice(0, -1));
                commit();
              } else {
                setDraft(e.target.value);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commit();
              } else if (e.key === "Backspace" && draft === "" && values.length > 0) {
                onChange(values.slice(0, -1));
              }
            }}
            onBlur={commit}
            placeholder={values.length === 0 ? placeholder : ""}
            className="min-w-[110px] flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
          />
        )}
        {!disabled && draft.trim() && (
          <button
            type="button"
            onClick={commit}
            className="text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Add"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">Press Enter or comma to add.</p>
    </div>
  );
}

/* ── Copyable text card ────────────────────────────────────────────────────── */

function CopyCard({
  title,
  icon: Icon,
  text,
}: {
  title: string;
  icon: LucideIcon;
  text: string;
}) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied to clipboard", { description: title });
    } catch {
      toast.error("Couldn't access the clipboard");
    }
  };

  return (
    <div className="glass flex h-full flex-col rounded-2xl p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold">
          <Icon className="h-3.5 w-3.5 text-violet-300" /> {title}
        </span>
        <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-[11px]" onClick={copy}>
          <Copy className="h-3 w-3" /> Copy
        </Button>
      </div>
      <p className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">{text}</p>
    </div>
  );
}

/* ── SEO panel ─────────────────────────────────────────────────────────────── */

interface SeoPanelProps {
  projectId: string;
  seo: SeoPack;
  channelType?: string;
  disabled?: boolean;
}

export function SeoPanel({ projectId, seo, channelType, disabled = false }: SeoPanelProps) {
  const qc = useQueryClient();
  const [title, setTitle] = useState(seo.title);
  const [description, setDescription] = useState(seo.description);
  const [tags, setTags] = useState<string[]>(seo.tags ?? []);
  const [hashtags, setHashtags] = useState<string[]>(seo.hashtags ?? []);
  const [ideasOpen, setIdeasOpen] = useState(false);
  const [ideas, setIdeas] = useState<TitleIdea[]>([]);

  // Re-sync local state when the server copy actually changes (e.g. after
  // regenerate or save) — keyed on content, not array identity, so background
  // refetches never clobber in-progress edits.
  const tagsKey = (seo.tags ?? []).join("\t");
  const hashtagsKey = (seo.hashtags ?? []).join("\t");
  useEffect(() => {
    setTitle(seo.title);
    setDescription(seo.description);
    setTags(tagsKey ? tagsKey.split("\t") : []);
    setHashtags(hashtagsKey ? hashtagsKey.split("\t") : []);
  }, [seo.title, seo.description, tagsKey, hashtagsKey]);

  const dirty = useMemo(
    () =>
      title !== seo.title ||
      description !== seo.description ||
      JSON.stringify(tags) !== JSON.stringify(seo.tags ?? []) ||
      JSON.stringify(hashtags) !== JSON.stringify(seo.hashtags ?? []),
    [title, description, tags, hashtags, seo],
  );

  const generateTitles = useMutation({
    mutationFn: () =>
      api.post<TitleIdea[]>("/ai/titles", {
        topic: title.trim() || seo.title,
        count: 50,
        channelType,
      }),
    onSuccess: (list) => {
      setIdeas([...list].sort((a, b) => b.score - a.score));
      setIdeasOpen(true);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Title generation failed"),
  });

  const save = useMutation({
    mutationFn: () =>
      api.patch(`/projects/${projectId}`, {
        seo: {
          ...seo,
          title: title.trim(),
          description,
          tags,
          hashtags,
          keywords: seo.keywords ?? [],
        } satisfies SeoPack,
      }),
    onSuccess: () => {
      toast.success("SEO pack saved");
      void qc.invalidateQueries({ queryKey: ["project", projectId] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to save SEO"),
  });

  return (
    <div className="space-y-5">
      <div className="glass space-y-5 rounded-2xl p-5">
        {/* ── Title + generator ────────────────────────────────────── */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="seo-title">Title</Label>
            <Button
              variant="secondary"
              size="sm"
              className="h-7 gap-1.5 px-2.5 text-[11px]"
              disabled={disabled || generateTitles.isPending}
              onClick={() => generateTitles.mutate()}
            >
              {generateTitles.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Sparkles className="h-3 w-3" />
              )}
              Generate 50 titles
            </Button>
          </div>
          <Input
            id="seo-title"
            value={title}
            maxLength={100}
            disabled={disabled}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Attention-grabbing title"
          />
          <p className="text-right text-[11px] tabular-nums text-muted-foreground">
            {title.length}/100
          </p>
        </div>

        {/* ── Description ──────────────────────────────────────────── */}
        <div className="space-y-1.5">
          <Label htmlFor="seo-description">Description</Label>
          <Textarea
            id="seo-description"
            value={description}
            rows={5}
            disabled={disabled}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Keyword-rich description with links and CTAs"
          />
        </div>

        {/* ── Tags + hashtags ──────────────────────────────────────── */}
        <div className="grid gap-5 lg:grid-cols-2">
          <ChipEditor
            label="Tags"
            icon={Tag}
            values={tags}
            onChange={setTags}
            placeholder="shorts, would you rather…"
            disabled={disabled}
          />
          <ChipEditor
            label="Hashtags"
            icon={Hash}
            values={hashtags}
            onChange={setHashtags}
            placeholder="shorts, quiz…"
            prefix="#"
            disabled={disabled}
          />
        </div>

        <div className="flex justify-end">
          <Button
            className="gap-1.5"
            disabled={disabled || !dirty || !title.trim() || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save SEO pack
          </Button>
        </div>
      </div>

      {/* ── Pinned comment + community post ────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        {seo.pinnedComment && (
          <CopyCard title="Pinned comment" icon={Pin} text={seo.pinnedComment} />
        )}
        {seo.communityPost && (
          <CopyCard title="Community post" icon={Newspaper} text={seo.communityPost} />
        )}
      </div>

      {/* ── Ranked title ideas modal ───────────────────────────────── */}
      <Dialog open={ideasOpen} onOpenChange={setIdeasOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>50 AI title ideas</DialogTitle>
            <DialogDescription>
              Ranked by predicted click-through — click one to use it.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="h-[420px] pr-3">
            <div className="space-y-1.5">
              {ideas.map((idea, i) => (
                <motion.button
                  key={`${idea.title}-${i}`}
                  type="button"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: Math.min(i, 15) * 0.02 }}
                  onClick={() => {
                    setTitle(idea.title.slice(0, 100));
                    setIdeasOpen(false);
                    toast.success("Title applied", { description: "Hit Save SEO pack to persist it." });
                  }}
                  className="flex w-full items-start gap-3 rounded-xl border border-border/60 bg-secondary/30 p-3 text-left transition-all hover:border-primary/40 hover:bg-accent/40"
                >
                  <span
                    className={cn(
                      "flex h-8 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary/70 text-xs font-bold tabular-nums",
                      scoreColor(idea.score),
                    )}
                  >
                    {Math.round(idea.score)}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium leading-snug">{idea.title}</span>
                    {idea.reasons.length > 0 && (
                      <span className="mt-0.5 block text-[11px] text-muted-foreground">
                        {idea.reasons.join(" · ")}
                      </span>
                    )}
                  </span>
                </motion.button>
              ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
