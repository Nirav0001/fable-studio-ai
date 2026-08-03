// ── Cost estimator ───────────────────────────────────────────────────────────
// Pure arithmetic over shared COST_RATES — used by the generate pipeline and
// the billing module. Sync by design (callers use it inline).

import type { CostEstimate } from "@fable/shared";
import { COST_RATES } from "@fable/shared";

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

export function estimateCost(opts: {
  llmTokens: number;
  ttsChars: number;
  renderMinutes: number;
}): CostEstimate {
  const llmTokens = Math.max(0, Math.round(opts.llmTokens) || 0);
  const ttsChars = Math.max(0, Math.round(opts.ttsChars) || 0);
  const renderMinutes = Math.max(0, Number(opts.renderMinutes) || 0);

  const llmCostGbp = round4((llmTokens / 1000) * COST_RATES.llmPer1kTokensGbp);
  const ttsCostGbp = round4((ttsChars / 1000) * COST_RATES.ttsPer1kCharsGbp);
  const renderCostGbp = round4(renderMinutes * COST_RATES.renderPerMinuteGbp);

  return {
    llmTokens,
    llmCostGbp,
    ttsChars,
    ttsCostGbp,
    renderMinutes: round4(renderMinutes),
    renderCostGbp,
    totalGbp: round4(llmCostGbp + ttsCostGbp + renderCostGbp),
  };
}
