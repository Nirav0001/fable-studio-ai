"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { motion } from "framer-motion";
import { EASE_OUT } from "@/lib/motion";
import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  body?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon: Icon, title, body, action, className }: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: EASE_OUT }}
      className={cn("flex flex-col items-center justify-center px-6 py-14 text-center", className)}
    >
      <div className="mb-4 flex h-14 w-14 animate-float items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 shadow-lg shadow-primary/10">
        <Icon className="h-6 w-6 text-violet-300" />
      </div>
      <h3 className="font-display text-base font-semibold tracking-tight">{title}</h3>
      {body && (
        <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-muted-foreground">{body}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </motion.div>
  );
}
