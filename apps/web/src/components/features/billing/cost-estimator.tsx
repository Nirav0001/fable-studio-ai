"use client";

import { Info } from "lucide-react";
import type { CostEstimate } from "@fable/shared";
import { formatGbp } from "@fable/shared";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface CostRowProps {
  label: string;
  detail: string;
  amountGbp: number;
}

function CostRow({ label, detail, amountGbp }: CostRowProps) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div>
        <p className="text-sm">{label}</p>
        <p className="text-[11px] text-muted-foreground">{detail}</p>
      </div>
      <span className="text-sm font-medium tabular-nums">{formatGbp(amountGbp)}</span>
    </div>
  );
}

interface CostEstimatorProps {
  estimate: CostEstimate;
}

export function CostEstimator({ estimate }: CostEstimatorProps) {
  return (
    <div className="glass flex h-full flex-col rounded-2xl p-5">
      <div className="flex items-center gap-1.5">
        <h3 className="text-sm font-semibold">Cost estimate</h3>
        <TooltipProvider delayDuration={150}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="About this estimate"
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                <Info className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Estimated API + render spend this month</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <div className="mt-2 divide-y divide-border/40">
        <CostRow
          label="AI writing"
          detail={`${estimate.llmTokens.toLocaleString("en-GB")} LLM tokens`}
          amountGbp={estimate.llmCostGbp}
        />
        <CostRow
          label="Voiceover TTS"
          detail={`${estimate.ttsChars.toLocaleString("en-GB")} characters`}
          amountGbp={estimate.ttsCostGbp}
        />
        <CostRow
          label="Video rendering"
          detail={`${estimate.renderMinutes.toLocaleString("en-GB")} minutes`}
          amountGbp={estimate.renderCostGbp}
        />
      </div>

      <Separator className="my-2" />

      <div className="mt-auto flex items-center justify-between gap-3 pt-1">
        <span className="text-sm font-medium">Total this month</span>
        <span className="font-display text-lg font-bold tabular-nums gradient-text">
          {formatGbp(estimate.totalGbp)}
        </span>
      </div>
    </div>
  );
}
