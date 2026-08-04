"use client";

import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { EASE_OUT, staggerDelay } from "@/lib/motion";
import type { CostEstimate, PlanTier } from "@fable/shared";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/widgets/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { PlanHero, type BillingUsage } from "@/components/features/billing/plan-hero";
import { CostEstimator } from "@/components/features/billing/cost-estimator";
import { PlanGrid } from "@/components/features/billing/plan-grid";
import { InvoicesTable, type InvoiceT } from "@/components/features/billing/invoices-table";

interface BillingData {
  plan: PlanTier;
  planStatus: string;
  renewsAt: string;
  usage: BillingUsage;
  costEstimate: CostEstimate;
  invoices: InvoiceT[];
}

export default function BillingPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["billing"],
    queryFn: () => api.get<BillingData>("/billing"),
  });

  return (
    <div className="space-y-8">
      <PageHeader
        title="Billing"
        description="Your plan, this month's usage and estimated spend."
      />

      {isLoading && (
        <div className="space-y-8">
          <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
            <Skeleton className="h-56 rounded-2xl" />
            <Skeleton className="h-56 rounded-2xl" />
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-80 rounded-2xl" />
            ))}
          </div>
          <Skeleton className="h-48 rounded-2xl" />
        </div>
      )}

      {!isLoading && data && (
        <>
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: EASE_OUT }}
            className="grid gap-4 xl:grid-cols-[2fr_1fr]"
          >
            <PlanHero
              plan={data.plan}
              planStatus={data.planStatus}
              renewsAt={data.renewsAt}
              usage={data.usage}
            />
            <CostEstimator estimate={data.costEstimate} />
          </motion.div>

          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: EASE_OUT, delay: staggerDelay(1) }}
            className="space-y-3"
          >
            <div>
              <h2 className="font-display text-base font-semibold tracking-tight">Plans</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Switch any time — changes apply immediately and billing is prorated.
              </p>
            </div>
            <PlanGrid currentPlan={data.plan} />
          </motion.section>

          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: EASE_OUT, delay: staggerDelay(2) }}
            className="space-y-3"
          >
            <div>
              <h2 className="font-display text-base font-semibold tracking-tight">Invoices</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Receipts for past billing periods.
              </p>
            </div>
            <InvoicesTable invoices={data.invoices} />
          </motion.section>
        </>
      )}
    </div>
  );
}
