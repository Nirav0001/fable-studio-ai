"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { clamp } from "@fable/shared";
import { cn, scoreColor } from "@/lib/utils";

export interface ScoreDialProps {
  score: number;
  /** Outer diameter in px (default 64). */
  size?: number;
  className?: string;
}

/** Animated radial viral-score dial with a violet→fuchsia gradient stroke. */
export function ScoreDial({ score, size = 64, className }: ScoreDialProps) {
  const reactId = React.useId();
  const gradId = `dial-${reactId.replace(/[^a-zA-Z0-9]/g, "")}`;
  const value = clamp(Math.round(score), 0, 100);
  const stroke = Math.max(3, Math.round(size / 14));
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - value / 100);

  return (
    <span
      className={cn("relative inline-flex shrink-0 items-center justify-center", className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`Viral score ${value} out of 100`}
      title={`Viral score ${value}/100`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#8b5cf6" />
            <stop offset="55%" stopColor="#a78bfa" />
            <stop offset="100%" stopColor="#e879f9" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="hsl(258 25% 15%)"
          strokeWidth={stroke}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#${gradId})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.9, ease: "easeOut" }}
        />
      </svg>
      <span
        className={cn(
          "absolute inset-0 flex items-center justify-center font-display font-bold tabular-nums",
          scoreColor(value),
        )}
        style={{ fontSize: Math.max(10, Math.round(size * 0.3)) }}
      >
        {value}
      </span>
    </span>
  );
}
