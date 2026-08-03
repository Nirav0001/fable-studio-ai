"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { PlanTier } from "@fable/shared";
import { PLANS, formatGbp } from "@fable/shared";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const TIER_ORDER: PlanTier[] = ["starter", "studio", "agency"];

interface CheckoutResponse {
  url: string | null;
  upgraded?: boolean;
  plan?: PlanTier;
}

interface PlanGridProps {
  currentPlan: PlanTier;
}

export function PlanGrid({ currentPlan }: PlanGridProps) {
  const qc = useQueryClient();
  const [pendingPlan, setPendingPlan] = useState<PlanTier | null>(null);

  const checkout = useMutation({
    mutationFn: (plan: PlanTier) => api.post<CheckoutResponse>("/billing/checkout", { plan }),
    onMutate: (plan) => setPendingPlan(plan),
    onSuccess: (data, plan) => {
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      setPendingPlan(null);
      toast.success(`Plan changed to ${PLANS[plan].name}`, {
        description: "Your new limits are live immediately.",
      });
      qc.invalidateQueries({ queryKey: ["billing"] });
      qc.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: (err) => {
      setPendingPlan(null);
      toast.error("Checkout failed", {
        description: err instanceof Error ? err.message : undefined,
      });
    },
  });

  const currentIdx = TIER_ORDER.indexOf(currentPlan);

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {TIER_ORDER.map((tier, i) => {
        const meta = PLANS[tier];
        const isCurrent = tier === currentPlan;
        const isUpgrade = i > currentIdx;
        const isPending = pendingPlan === tier && checkout.isPending;

        return (
          <motion.div
            key={tier}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: i * 0.06 }}
            className={cn(
              "glass relative flex flex-col rounded-2xl p-5",
              isCurrent && "border-primary/50 ring-1 ring-primary/40",
            )}
          >
            {tier === "studio" && !isCurrent && (
              <span className="gradient-primary absolute -top-2.5 right-4 rounded-full px-2.5 py-0.5 text-[10px] font-semibold text-white shadow-lg shadow-primary/30">
                Most popular
              </span>
            )}

            <div className="flex items-center justify-between gap-2">
              <h3 className="font-display text-base font-semibold tracking-tight">{meta.name}</h3>
              {isCurrent && <Badge>Current plan</Badge>}
            </div>

            <p className="mt-2">
              <span className="font-display text-3xl font-bold tabular-nums">
                {formatGbp(meta.priceGbp)}
              </span>
              <span className="text-sm text-muted-foreground"> / month</span>
            </p>

            <ul className="mt-4 flex-1 space-y-2">
              {meta.features.map((feature) => (
                <li key={feature} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                  {feature}
                </li>
              ))}
            </ul>

            <Button
              className="mt-5 w-full"
              variant={isCurrent ? "outline" : isUpgrade ? "default" : "secondary"}
              disabled={isCurrent || checkout.isPending}
              onClick={() => checkout.mutate(tier)}
            >
              {isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {isCurrent
                ? "Current plan"
                : isPending
                  ? "Redirecting…"
                  : isUpgrade
                    ? `Upgrade to ${meta.name}`
                    : `Downgrade to ${meta.name}`}
            </Button>
          </motion.div>
        );
      })}
    </div>
  );
}
