"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { ENTER_FAST } from "@/lib/motion";
import { cn } from "@/lib/utils";

export interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...ENTER_FAST }}
      className={cn("mb-6 flex flex-wrap items-end justify-between gap-3", className)}
    >
      <div className="min-w-0">
        <h1 className="gradient-text font-display text-2xl font-bold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </motion.div>
  );
}
