"use client";

import { motion } from "framer-motion";
import { Check, LinkIcon, Loader2, Sparkles, Tv } from "lucide-react";
import type { ChannelSummary, ChannelType, WyrDifficulty } from "@fable/shared";
import {
  CAPTION_STYLES,
  CLIP_COUNTS,
  SHORT_LENGTHS,
  WYR_DIFFICULTIES,
  WYR_THEMES,
  formatCompact,
} from "@fable/shared";
import { cn, CHANNEL_TYPE_META } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { EmptyState } from "@/components/widgets/empty-state";
import {
  CAPTION_STYLE_LABELS,
  DIFFICULTY_LABELS,
  THEME_EMOJI,
  isValidHttpUrl,
} from "./types";

/* ── Wizard state ──────────────────────────────────────────────────────────── */

export interface WizardState {
  channelId: string | null;
  type: ChannelType | null;
  title: string;
  // wyr
  theme: string;
  difficulty: WyrDifficulty;
  lengthSec: (typeof SHORT_LENGTHS)[number];
  questionCount: number;
  // clips / top5
  sourceUrl: string;
  clipCount: (typeof CLIP_COUNTS)[number];
  minScore: number;
  captionStyle: string;
  addMemes: boolean;
}

export const INITIAL_WIZARD_STATE: WizardState = {
  channelId: null,
  type: null,
  title: "",
  theme: "random",
  difficulty: "medium",
  lengthSec: 30,
  questionCount: 6,
  sourceUrl: "",
  clipCount: 10,
  minScore: 70,
  captionStyle: "beast",
  addMemes: true,
};

export const WIZARD_STEP_LABELS = ["Channel", "Configure", "Review"] as const;

/* ── Progress dots ─────────────────────────────────────────────────────────── */

export function WizardDots({
  step,
  onStepClick,
}: {
  step: number;
  onStepClick: (target: number) => void;
}) {
  return (
    <div className="flex items-center justify-center gap-0">
      {WIZARD_STEP_LABELS.map((label, i) => {
        const done = i < step;
        const active = i === step;
        return (
          <div key={label} className="flex items-center">
            {i > 0 && (
              <div
                className={cn(
                  "mx-2 h-px w-10 transition-colors sm:w-16",
                  done || active ? "bg-primary/60" : "bg-border",
                )}
              />
            )}
            <button
              type="button"
              disabled={i >= step}
              onClick={() => onStepClick(i)}
              className={cn(
                "group flex flex-col items-center gap-1.5 outline-none",
                i < step ? "cursor-pointer" : "cursor-default",
              )}
            >
              <span
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full border text-xs font-semibold transition-all",
                  active &&
                    "gradient-primary border-transparent text-white shadow-lg shadow-primary/30",
                  done && "border-primary/50 bg-primary/15 text-violet-300",
                  !active && !done && "border-border bg-secondary/40 text-muted-foreground",
                )}
              >
                {done ? <Check className="h-4 w-4" /> : i + 1}
              </span>
              <span
                className={cn(
                  "text-[11px] font-medium",
                  active ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {label}
              </span>
            </button>
          </div>
        );
      })}
    </div>
  );
}

/* ── Segmented control ─────────────────────────────────────────────────────── */

function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  format,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  format?: (v: T) => string;
}) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-xl border border-border/60 bg-secondary/40 p-1">
      {options.map((opt) => {
        const active = opt === value;
        return (
          <button
            key={String(opt)}
            type="button"
            onClick={() => onChange(opt)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition-all",
              active
                ? "gradient-primary text-white shadow-md shadow-primary/25"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
            )}
          >
            {format ? format(opt) : String(opt)}
          </button>
        );
      })}
    </div>
  );
}

/* ── Step 1 — pick a channel ───────────────────────────────────────────────── */

export function StepChannel({
  channels,
  loading,
  selectedId,
  onSelect,
}: {
  channels?: ChannelSummary[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (channel: ChannelSummary) => void;
}) {
  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-36 rounded-2xl" />
        ))}
      </div>
    );
  }

  if (!channels || channels.length === 0) {
    return (
      <EmptyState
        icon={Tv}
        title="No channels yet"
        body="Create a channel first — every AI project belongs to one faceless channel."
        action={
          <Button asChild>
            <a href="/channels">Create a channel</a>
          </Button>
        }
      />
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {channels.map((c, i) => {
        const meta = CHANNEL_TYPE_META[c.type] ?? CHANNEL_TYPE_META.wyr;
        const active = selectedId === c.id;
        return (
          <motion.button
            key={c.id}
            type="button"
            onClick={() => onSelect(c)}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: i * 0.04 }}
            className={cn(
              "glass glass-hover relative flex flex-col items-start gap-3 rounded-2xl p-5 text-left transition-all",
              active && "border-primary/60 ring-2 ring-primary/50",
            )}
          >
            {active && (
              <span className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full gradient-primary text-white shadow-md">
                <Check className="h-3.5 w-3.5" />
              </span>
            )}
            <span
              className={cn(
                "flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br text-xl shadow-lg",
                meta.gradient,
              )}
            >
              {meta.emoji}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{c.name}</p>
              <p className="truncate text-xs text-muted-foreground">@{c.handle.replace(/^@/, "")}</p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="rounded-full border border-border/60 bg-secondary/50 px-2 py-0.5 font-medium">
                {meta.label}
              </span>
              <span className="rounded-full border border-border/60 bg-secondary/50 px-2 py-0.5 font-medium tabular-nums">
                {formatCompact(c.subscriberCount)} subs
              </span>
            </div>
          </motion.button>
        );
      })}
    </div>
  );
}

/* ── Step 2 — per-type configuration ───────────────────────────────────────── */

function UrlField({
  value,
  onChange,
  label,
  hint,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  hint: string;
}) {
  const invalid = value.length > 0 && !isValidHttpUrl(value);
  return (
    <div className="space-y-1.5">
      <Label htmlFor="wizard-source-url" className="inline-flex items-center gap-1.5">
        <LinkIcon className="h-3.5 w-3.5" /> {label}
      </Label>
      <Input
        id="wizard-source-url"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="https://youtube.com/watch?v=…"
        className={cn(invalid && "border-red-500/60 focus-visible:ring-red-500/40")}
      />
      <p className={cn("text-[11px]", invalid ? "text-red-400" : "text-muted-foreground")}>
        {invalid ? "That doesn't look like a valid URL — include https://" : hint}
      </p>
    </div>
  );
}

function CaptionStyleSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label>Caption style</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-full sm:w-72">
          <SelectValue placeholder="Pick a caption style" />
        </SelectTrigger>
        <SelectContent>
          {CAPTION_STYLES.map((s) => (
            <SelectItem key={s} value={s}>
              {CAPTION_STYLE_LABELS[s] ?? s}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function StepConfig({
  type,
  state,
  patch,
}: {
  type: ChannelType;
  state: WizardState;
  patch: (p: Partial<WizardState>) => void;
}) {
  if (type === "wyr") {
    const perQuestion = state.lengthSec / Math.max(1, state.questionCount);
    return (
      <div className="space-y-7">
        <div className="space-y-2.5">
          <Label>Theme</Label>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
            {WYR_THEMES.map((theme) => {
              const active = state.theme === theme;
              return (
                <button
                  key={theme}
                  type="button"
                  onClick={() => patch({ theme })}
                  className={cn(
                    "glass glass-hover flex flex-col items-center gap-1.5 rounded-xl px-2 py-3 transition-all",
                    active && "border-primary/60 ring-2 ring-primary/50",
                  )}
                >
                  <span className="text-2xl">{THEME_EMOJI[theme] ?? "❓"}</span>
                  <span
                    className={cn(
                      "text-[11px] font-medium capitalize",
                      active ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {theme}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-2.5">
          <Label>Difficulty</Label>
          <div>
            <Segmented
              options={WYR_DIFFICULTIES}
              value={state.difficulty}
              onChange={(difficulty) => patch({ difficulty })}
              format={(d) => DIFFICULTY_LABELS[d] ?? d}
            />
          </div>
        </div>

        <div className="space-y-2.5">
          <Label>Video length</Label>
          <div>
            <Segmented
              options={SHORT_LENGTHS}
              value={state.lengthSec}
              onChange={(lengthSec) => patch({ lengthSec })}
              format={(s) => `${s}s`}
            />
          </div>
        </div>

        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <Label>Questions</Label>
            <span className="text-sm font-semibold tabular-nums text-violet-300">
              {state.questionCount}
            </span>
          </div>
          <Slider
            min={3}
            max={12}
            step={1}
            value={[state.questionCount]}
            onValueChange={([v]) => patch({ questionCount: v })}
            className="max-w-md"
          />
          <p className="text-[11px] text-muted-foreground">
            ~{perQuestion.toFixed(1)}s per question
            {perQuestion < 3.5
              ? " — very fast pacing, great for retention"
              : perQuestion > 7
                ? " — relaxed pacing, viewers get time to decide"
                : " — the sweet spot for Shorts"}
          </p>
        </div>
      </div>
    );
  }

  if (type === "clips") {
    return (
      <div className="space-y-7">
        <UrlField
          value={state.sourceUrl}
          onChange={(sourceUrl) => patch({ sourceUrl })}
          label="Source video URL"
          hint="A long-form video or stream VOD — the AI finds the most viral moments."
        />

        <div className="space-y-2.5">
          <Label>Clips to generate</Label>
          <div>
            <Segmented
              options={CLIP_COUNTS}
              value={state.clipCount}
              onChange={(clipCount) => patch({ clipCount })}
              format={(n) => `${n} clips`}
            />
          </div>
        </div>

        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <Label>Minimum viral score</Label>
            <span className="text-sm font-semibold tabular-nums text-violet-300">
              {state.minScore}
            </span>
          </div>
          <Slider
            min={50}
            max={90}
            step={1}
            value={[state.minScore]}
            onValueChange={([v]) => patch({ minScore: v })}
            className="max-w-md"
          />
          <p className="text-[11px] text-muted-foreground">
            Only clips scoring ≥ {state.minScore} are auto-kept — you can rescue the rest in review.
          </p>
        </div>

        <CaptionStyleSelect
          value={state.captionStyle}
          onChange={(captionStyle) => patch({ captionStyle })}
        />

        <div className="flex items-center justify-between rounded-xl border border-border/60 bg-secondary/30 px-4 py-3 sm:max-w-md">
          <div>
            <p className="text-sm font-medium">Meme overlays</p>
            <p className="text-[11px] text-muted-foreground">
              Drop reaction GIFs and memes on top of big moments.
            </p>
          </div>
          <Switch checked={state.addMemes} onCheckedChange={(addMemes) => patch({ addMemes })} />
        </div>
      </div>
    );
  }

  // top5
  return (
    <div className="space-y-7">
      <UrlField
        value={state.sourceUrl}
        onChange={(sourceUrl) => patch({ sourceUrl })}
        label="Source video URL"
        hint="The AI picks the 5 funniest moments and builds a countdown Short."
      />
      <CaptionStyleSelect
        value={state.captionStyle}
        onChange={(captionStyle) => patch({ captionStyle })}
      />
      <div className="rounded-xl border border-border/60 bg-secondary/30 px-4 py-3 text-[12px] text-muted-foreground sm:max-w-md">
        Countdown runs <span className="font-semibold text-foreground">5 → 1</span> with number
        stingers, punch-in zooms and an engagement CTA at the end.
      </div>
    </div>
  );
}

/* ── Step 3 — review + generate ────────────────────────────────────────────── */

function ReviewRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-right text-sm font-medium">{value}</span>
    </div>
  );
}

export function StepReview({
  channel,
  type,
  state,
  patch,
  onGenerate,
  generating,
}: {
  channel?: ChannelSummary;
  type: ChannelType;
  state: WizardState;
  patch: (p: Partial<WizardState>) => void;
  onGenerate: () => void;
  generating: boolean;
}) {
  const meta = CHANNEL_TYPE_META[type] ?? CHANNEL_TYPE_META.wyr;

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <div className="glass rounded-2xl p-5">
        <div className="mb-2 flex items-center gap-3">
          <span
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br text-lg shadow-lg",
              meta.gradient,
            )}
          >
            {meta.emoji}
          </span>
          <div>
            <p className="text-sm font-semibold">{meta.label}</p>
            <p className="text-xs text-muted-foreground">
              {channel ? `${channel.name} · @${channel.handle.replace(/^@/, "")}` : "—"}
            </p>
          </div>
        </div>

        <div className="divide-y divide-border/60">
          {type === "wyr" ? (
            <>
              <ReviewRow
                label="Theme"
                value={
                  <span className="capitalize">
                    {THEME_EMOJI[state.theme] ?? "❓"} {state.theme}
                  </span>
                }
              />
              <ReviewRow
                label="Difficulty"
                value={DIFFICULTY_LABELS[state.difficulty] ?? state.difficulty}
              />
              <ReviewRow label="Length" value={`${state.lengthSec}s`} />
              <ReviewRow
                label="Questions"
                value={`${state.questionCount} (~${(state.lengthSec / Math.max(1, state.questionCount)).toFixed(1)}s each)`}
              />
            </>
          ) : (
            <>
              <ReviewRow
                label="Source"
                value={
                  <span className="block max-w-[260px] truncate" title={state.sourceUrl}>
                    {state.sourceUrl || "—"}
                  </span>
                }
              />
              {type === "clips" && (
                <>
                  <ReviewRow label="Clips" value={`${state.clipCount} candidates`} />
                  <ReviewRow label="Min score" value={`${state.minScore} / 100`} />
                  <ReviewRow label="Memes" value={state.addMemes ? "On" : "Off"} />
                </>
              )}
              {type === "top5" && <ReviewRow label="Countdown" value="Top 5 → 1" />}
              <ReviewRow
                label="Captions"
                value={CAPTION_STYLE_LABELS[state.captionStyle] ?? state.captionStyle}
              />
            </>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="wizard-title">Project title (optional)</Label>
        <Input
          id="wizard-title"
          value={state.title}
          maxLength={100}
          onChange={(e) => patch({ title: e.target.value })}
          placeholder="Leave blank and the AI names it"
        />
      </div>

      <Button
        size="lg"
        className="w-full gap-2 py-6 text-base"
        onClick={onGenerate}
        disabled={generating}
      >
        {generating ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <Sparkles className="h-5 w-5" />
        )}
        {generating ? "Kicking off the pipeline…" : "Generate with AI"}
      </Button>
      <p className="text-center text-[11px] text-muted-foreground">
        Script, SEO pack, thumbnails, viral score and cost estimate — usually under a minute.
      </p>
    </div>
  );
}
