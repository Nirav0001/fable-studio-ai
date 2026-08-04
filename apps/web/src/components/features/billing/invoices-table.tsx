"use client";

import { format } from "date-fns";
import { motion } from "framer-motion";
import { Receipt } from "lucide-react";
import { EASE_OUT, staggerDelay } from "@/lib/motion";
import { formatGbp } from "@fable/shared";
import { Badge } from "@/components/ui/badge";

export interface InvoiceT {
  id: string;
  date: string;
  description?: string;
  amountGbp: number;
  status: string;
}

interface InvoicesTableProps {
  invoices: InvoiceT[];
}

function statusVariant(status: string): "success" | "destructive" | "secondary" {
  if (status === "paid") return "success";
  if (status === "failed" || status === "void") return "destructive";
  return "secondary";
}

export function InvoicesTable({ invoices }: InvoicesTableProps) {
  if (invoices.length === 0) {
    return (
      <div className="glass flex items-center gap-3 rounded-2xl p-5 text-sm text-muted-foreground">
        <Receipt className="h-4 w-4" />
        No invoices yet — your first one lands after the current billing period.
      </div>
    );
  }

  return (
    <div className="glass overflow-hidden rounded-2xl">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="border-b border-border/60 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="px-5 py-3 font-medium">Invoice</th>
              <th className="px-5 py-3 font-medium">Date</th>
              <th className="px-5 py-3 font-medium">Description</th>
              <th className="px-5 py-3 text-right font-medium">Amount</th>
              <th className="px-5 py-3 text-right font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {invoices.map((invoice, i) => {
              const date = new Date(invoice.date);
              return (
                <motion.tr
                  key={invoice.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, ease: EASE_OUT, delay: staggerDelay(i, 8) }}
                  className="transition-colors hover:bg-accent/20"
                >
                  <td className="px-5 py-3 font-mono text-xs text-muted-foreground">
                    {invoice.id}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3">
                    {Number.isNaN(date.getTime()) ? "—" : format(date, "d MMM yyyy")}
                  </td>
                  <td className="max-w-[280px] truncate px-5 py-3 text-muted-foreground">
                    {invoice.description ?? "—"}
                  </td>
                  <td className="px-5 py-3 text-right font-medium tabular-nums">
                    {formatGbp(invoice.amountGbp)}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Badge variant={statusVariant(invoice.status)} className="capitalize">
                      {invoice.status}
                    </Badge>
                  </td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
