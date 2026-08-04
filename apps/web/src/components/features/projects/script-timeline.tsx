"use client";

import { motion } from "framer-motion";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowRightLeft,
  Eye,
  Hash,
  HelpCircle,
  Megaphone,
  Mic,
  Music,
  Scissors,
  Sparkles,
  Volume2,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { SceneT, ScriptPlan } from "@fable/shared";
import { formatDuration } from "@fable/shared";
import { api } from "@/lib/api";
import { EASE_OUT } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { WyrQuestionCard } from "./wyr-question-list";

const KIND_META: Record<SceneT["kind"], { icon: LucideIcon; label: string; ring: string; text: string }> = {
  hook: { icon: Zap, label: "Hook", ring: "border-amber-500/50 bg-amber-500/15", text: "text-amber-300" },
  question: { icon: HelpCircle, label: "Question", ring: "border-violet-500/50 bg-violet-500/15", text: "text-violet-300" },
  reveal: { icon: Eye, label: "Reveal", ring: "border-fuchsia-500/50 bg-fuchsia-500/15", text: "text-fuchsia-300" },
  clip: { icon: Scissors, label: "Clip", ring: "border-purple-500/50 bg-purple-500/15", text: "text-purple-300" },
  number: { icon: Hash, label: "Number", ring: "border-sky-500/50 bg-sky-500/15", text: "text-sky-300" },
  transition: { icon: ArrowRightLeft, label: "Transition", ring: "border-zinc-500/50 bg-zinc-500/15", text: "text-zinc-300" },
  cta: { icon: Megaphone, label: "CTA", ring: "border-emerald-500/50 bg-emerald-500/15", text: "text-emerald-300" },
};

interface ScriptTimelineProps {
  projectId: string;
  script: ScriptPlan;
  editable: boolean;
}

/** Vertical scene-by-scene timeline of the AI script plan. */
export function ScriptTimeline({ projectId, script, editable }: ScriptTimelineProps) {
  const qc = useQueryClient();

  const saveQuestion = useMutation({
    mutationFn: (updated: ScriptPlan) => api.patch(`/projects/${projectId}`, { script: updated }),
    onSuccess: () => {
      toast.success("Question updated", { description: "The script will render with your edit." });
      void qc.invalidateQueries({ queryKey: ["project", projectId] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to save question"),
  });

  const handleQuestionSave = (scene: SceneT, patch: { optionA: string; optionB: string }) => {
    const scenes = script.scenes.map((s) =>
      s.index === scene.index && s.question
        ? { ...s, question: { ...s.question, optionA: patch.optionA, optionB: patch.optionB } }
        : s,
    );
    saveQuestion.mutate({ ...script, scenes });
  };

  return (
    <div className="space-y-4">
      {/* ── Plan summary strip ───────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
        <span className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-secondary/50 px-2 py-1">
          <Sparkles className="h-3 w-3 text-violet-300" />
          {script.scenes.length} scenes · {formatDuration(script.totalDurationSec)}
        </span>
        {script.musicStyle && (
          <span className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-secondary/50 px-2 py-1">
            <Music className="h-3 w-3 text-fuchsia-300" />
            {script.musicStyle}
          </span>
        )}
        {script.voiceoverLines.length > 0 && (
          <span className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-secondary/50 px-2 py-1">
            <Mic className="h-3 w-3 text-sky-300" />
            {script.voiceoverLines.length} voiceover lines
          </span>
        )}
        {script.pacingNotes && (
          <span className="basis-full text-[11px] italic text-muted-foreground/80">
            {script.pacingNotes}
          </span>
        )}
      </div>

      {/* ── Timeline ─────────────────────────────────────────────────── */}
      <ol className="relative space-y-4 border-l border-border/60 pl-6">
        {script.scenes.map((scene, i) => {
          const meta = KIND_META[scene.kind] ?? KIND_META.transition;
          const Icon = meta.icon;
          return (
            <motion.li
              key={`${scene.index}-${scene.kind}`}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: EASE_OUT, delay: Math.min(i, 12) * 0.04 }}
              className="relative"
            >
              <span
                className={cn(
                  "absolute -left-[37px] top-1 flex h-6 w-6 items-center justify-center rounded-full border backdrop-blur-sm",
                  meta.ring,
                )}
              >
                <Icon className={cn("h-3 w-3", meta.text)} />
              </span>

              <div className="glass rounded-xl p-4">
                <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                  <span className={cn("text-xs font-semibold", meta.text)}>{meta.label}</span>
                  <span className="rounded-md border border-border/60 bg-secondary/50 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
                    {formatDuration(scene.startSec)} → {formatDuration(scene.startSec + scene.durationSec)}
                  </span>
                  <span className="rounded-md border border-border/60 bg-secondary/50 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
                    {scene.durationSec}s
                  </span>
                  {scene.clipRef && (
                    <span className="rounded-md border border-purple-500/30 bg-purple-500/10 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-purple-300">
                      src {formatDuration(scene.clipRef.startSec)}–{formatDuration(scene.clipRef.endSec)}
                      {scene.clipRef.label ? ` · ${scene.clipRef.label}` : ""}
                    </span>
                  )}
                </div>

                {scene.text && <p className="text-sm leading-relaxed">{scene.text}</p>}

                {scene.question && (
                  <div className="mt-3">
                    <WyrQuestionCard
                      question={scene.question}
                      editable={editable}
                      saving={saveQuestion.isPending}
                      onSave={(patch) => handleQuestionSave(scene, patch)}
                    />
                  </div>
                )}

                {(scene.effects.length > 0 || scene.sfx) && (
                  <div className="mt-2.5 flex flex-wrap items-center gap-1">
                    {scene.effects.map((fx) => (
                      <span
                        key={fx}
                        className="rounded-full border border-violet-500/25 bg-violet-500/10 px-2 py-0.5 text-[10px] font-medium text-violet-300"
                      >
                        {fx}
                      </span>
                    ))}
                    {scene.sfx && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-sky-500/25 bg-sky-500/10 px-2 py-0.5 text-[10px] font-medium text-sky-300">
                        <Volume2 className="h-2.5 w-2.5" />
                        {scene.sfx}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </motion.li>
          );
        })}
      </ol>
    </div>
  );
}
