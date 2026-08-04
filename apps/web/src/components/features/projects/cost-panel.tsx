"use client";

import { motion } from "framer-motion";
import { BrainCircuit, Clapperboard, Mic, Wallet, type LucideIcon } from "lucide-react";
import type { CostEstimate } from "@fable/shared";
import { formatCompact, formatGbp } from "@fable/shared";
import { EASE_OUT, staggerDelay } from "@/lib/motion";

interface CostRow {
  icon: LucideIcon;
  label: string;
  detail: string;
  costGbp: number;
}

interface CostPanelProps {
  cost: CostEstimate;
}

/** Line-item cost estimate for generating + rendering this project. */
export function CostPanel({ cost }: CostPanelProps) {
  const rows: CostRow[] = [
    {
      icon: BrainCircuit,
      label: "AI generation (LLM)",
      detail: `${formatCompact(cost.llmTokens)} tokens`,
      costGbp: cost.llmCostGbp,
    },
    {
      icon: Mic,
      label: "Voiceover (TTS)",
      detail: `${formatCompact(cost.ttsChars)} characters`,
      costGbp: cost.ttsCostGbp,
    },
    {
      icon: Clapperboard,
      label: "Rendering",
      detail: `${cost.renderMinutes.toFixed(1)} min of render time`,
      costGbp: cost.renderCostGbp,
    },
  ];

  const total = cost.totalGbp;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="glass overflow-hidden rounded-2xl">
        <div className="divide-y divide-border/60">
          {rows.map((row, i) => {
            const share = total > 0 ? Math.max(2, (row.costGbp / total) * 100) : 0;
            const Icon = row.icon;
            return (
              <motion.div
                key={row.label}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease: EASE_OUT, delay: staggerDelay(i) }}
                className="flex items-center gap-4 p-4"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-violet-500/25 bg-violet-500/10">
                  <Icon className="h-4 w-4 text-violet-300" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium">{row.label}</p>
                    <p className="text-sm font-semibold tabular-nums">{formatGbp(row.costGbp)}</p>
                  </div>
                  <p className="text-[11px] text-muted-foreground">{row.detail}</p>
                  <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-secondary/70">
                    <motion.div
                      initial={{ transform: "scaleX(0)" }}
                      animate={{ transform: `scaleX(${share / 100})` }}
                      transition={{ duration: 0.35, delay: staggerDelay(i), ease: EASE_OUT }}
                      className="gradient-primary h-full w-full origin-left rounded-full"
                    />
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* ── Total ────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-4 border-t border-primary/25 bg-primary/[0.07] p-4">
          <span className="inline-flex items-center gap-2 text-sm font-semibold">
            <Wallet className="h-4 w-4 text-violet-300" />
            Estimated total
          </span>
          <span className="gradient-text text-xl font-bold tabular-nums">{formatGbp(total)}</span>
        </div>
      </div>

      <p className="text-center text-[11px] text-muted-foreground">
        Estimates use current per-unit rates — actual usage is tracked on the Billing page.
      </p>
    </div>
  );
}
