"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Check, Lightbulb, Loader2, PenLine, X } from "lucide-react";
import type { WyrQuestionT } from "@fable/shared";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DIFFICULTY_LABELS, THEME_EMOJI } from "./types";

interface WyrQuestionCardProps {
  question: WyrQuestionT;
  editable?: boolean;
  saving?: boolean;
  onSave?: (patch: { optionA: string; optionB: string }) => void;
}

/** A vs B split card with the audience % reveal bar and factoid. */
export function WyrQuestionCard({ question, editable = false, saving = false, onSave }: WyrQuestionCardProps) {
  const [editing, setEditing] = useState(false);
  const [optionA, setOptionA] = useState(question.optionA);
  const [optionB, setOptionB] = useState(question.optionB);

  // When the server copy changes (save landed), sync + exit edit mode.
  useEffect(() => {
    setOptionA(question.optionA);
    setOptionB(question.optionB);
    setEditing(false);
  }, [question.optionA, question.optionB]);

  const pctA = Math.round(question.percentA);
  const pctB = 100 - pctA;
  const canSave = optionA.trim().length > 0 && optionB.trim().length > 0;

  return (
    <div className="overflow-hidden rounded-xl border border-border/60 bg-secondary/25">
      {/* ── A vs B split ─────────────────────────────────────────────── */}
      <div className="relative grid grid-cols-2">
        <div className="flex min-h-[92px] flex-col justify-center gap-1 bg-gradient-to-br from-violet-600/25 to-violet-900/10 p-4 pr-7">
          <span className="text-[10px] font-bold uppercase tracking-widest text-violet-300">
            Option A
          </span>
          {editing ? (
            <Input
              value={optionA}
              onChange={(e) => setOptionA(e.target.value)}
              maxLength={120}
              className="h-8 bg-background/60 text-xs"
              placeholder="Option A"
            />
          ) : (
            <p className="text-sm font-semibold leading-snug">{question.optionA}</p>
          )}
        </div>
        <div className="flex min-h-[92px] flex-col justify-center gap-1 bg-gradient-to-bl from-fuchsia-600/25 to-fuchsia-900/10 p-4 pl-7 text-right">
          <span className="text-[10px] font-bold uppercase tracking-widest text-fuchsia-300">
            Option B
          </span>
          {editing ? (
            <Input
              value={optionB}
              onChange={(e) => setOptionB(e.target.value)}
              maxLength={120}
              className="h-8 bg-background/60 text-xs"
              placeholder="Option B"
            />
          ) : (
            <p className="text-sm font-semibold leading-snug">{question.optionB}</p>
          )}
        </div>
        <span className="absolute left-1/2 top-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-border/70 bg-background/90 text-[10px] font-black tracking-wide text-muted-foreground shadow-lg backdrop-blur-sm">
          OR
        </span>
      </div>

      {/* ── Audience split bar ───────────────────────────────────────── */}
      <div className="space-y-1.5 border-t border-border/50 p-3">
        <div className="flex h-2 w-full overflow-hidden rounded-full bg-secondary/70">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${pctA}%` }}
            transition={{ duration: 0.7, ease: "easeOut" }}
            className="h-full bg-gradient-to-r from-violet-500 to-violet-400"
          />
          <div className="h-full flex-1 bg-gradient-to-r from-fuchsia-500/70 to-fuchsia-400/70" />
        </div>
        <div className="flex items-center justify-between text-[11px] font-medium tabular-nums">
          <span className="text-violet-300">{pctA}% pick A</span>
          <span className="text-fuchsia-300">{pctB}% pick B</span>
        </div>

        {question.factoid && (
          <p className="flex items-start gap-1.5 pt-0.5 text-[11px] leading-relaxed text-muted-foreground">
            <Lightbulb className="mt-0.5 h-3 w-3 shrink-0 text-amber-400" />
            {question.factoid}
          </p>
        )}

        {/* ── Meta + edit controls ───────────────────────────────────── */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <span className="rounded-full border border-border/60 bg-secondary/50 px-1.5 py-0.5 capitalize">
              {THEME_EMOJI[question.theme] ?? "❓"} {question.theme}
            </span>
            <span className="rounded-full border border-border/60 bg-secondary/50 px-1.5 py-0.5">
              {DIFFICULTY_LABELS[question.difficulty] ?? question.difficulty}
            </span>
          </div>

          {editable && !editing && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-[11px]"
              onClick={() => setEditing(true)}
            >
              <PenLine className="h-3 w-3" /> Edit
            </Button>
          )}
          {editable && editing && (
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-[11px]"
                disabled={saving}
                onClick={() => {
                  setOptionA(question.optionA);
                  setOptionB(question.optionB);
                  setEditing(false);
                }}
              >
                <X className="h-3 w-3" /> Cancel
              </Button>
              <Button
                size="sm"
                className="h-7 gap-1 px-2.5 text-[11px]"
                disabled={!canSave || saving}
                onClick={() => onSave?.({ optionA: optionA.trim(), optionB: optionB.trim() })}
              >
                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                Save
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Plain stacked list of question cards (read-only convenience wrapper). */
export function WyrQuestionList({ questions, className }: { questions: WyrQuestionT[]; className?: string }) {
  return (
    <div className={cn("space-y-3", className)}>
      {questions.map((q, i) => (
        <motion.div
          key={`${q.id ?? i}-${q.optionA}`}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: i * 0.04 }}
        >
          <WyrQuestionCard question={q} />
        </motion.div>
      ))}
    </div>
  );
}
