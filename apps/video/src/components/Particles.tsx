import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";

/**
 * Floating ambient particle field. Every attribute of every particle is a pure
 * function of its index (golden-ratio hashing) and the current frame — fully
 * deterministic, no Math.random, identical on every render pass.
 */

const frac = (n: number): number => n - Math.floor(n);

export interface ParticlesProps {
  /** Number of particles in the field. */
  count?: number;
  /** Palette cycled/hashed by particle index. */
  colors?: string[];
  /** Global opacity multiplier 0..1. */
  opacity?: number;
  /** Upward drift speed multiplier. */
  speed?: number;
}

export const Particles: React.FC<ParticlesProps> = ({
  count = 28,
  colors = ["#a78bfa", "#8b5cf6", "#6d28d9", "#c4b5fd", "#f0abfc"],
  opacity = 1,
  speed = 1,
}) => {
  const frame = useCurrentFrame();
  const { fps, height } = useVideoConfig();

  const particles = new Array(count).fill(0).map((_, i) => {
    // Deterministic per-particle attributes from index hashing.
    const xPct = frac(i * 0.618033988749) * 100; // golden-ratio spread
    const yBase = frac(i * 0.754877666247) * 120;
    const size = 5 + frac(i * 0.318309886184) * 17;
    const drift = (0.045 + frac(i * 0.87654321) * 0.11) * speed; // % of height per frame
    const swayAmp = 8 + frac(i * 0.53101) * 26; // px
    const swayFreq = 0.12 + frac(i * 0.27182) * 0.22; // Hz
    const twinkleFreq = 0.03 + frac(i * 0.11317) * 0.05;
    const color = colors[i % colors.length];

    // Upward drift with wrap-around (range -10%..110% so particles enter/exit offscreen).
    const yRaw = yBase - frame * drift;
    const yPct = ((yRaw % 120) + 120) % 120 - 10;

    const swayPx = Math.sin((frame / fps) * swayFreq * Math.PI * 2 + i * 2.399) * swayAmp;
    const twinkle = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(frame * twinkleFreq + i * 1.7));

    return { i, xPct, yPct, size, swayPx, twinkle, color };
  });

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {particles.map((p) => (
        <div
          key={p.i}
          style={{
            position: "absolute",
            left: `${p.xPct}%`,
            top: `${(p.yPct / 100) * height}px`,
            width: p.size,
            height: p.size,
            borderRadius: "50%",
            backgroundColor: p.color,
            opacity: p.twinkle * opacity * 0.55,
            transform: `translateX(${p.swayPx}px)`,
            filter: `blur(${p.size > 14 ? 3 : 1}px)`,
            boxShadow: `0 0 ${p.size * 1.5}px ${p.color}`,
          }}
        />
      ))}
    </AbsoluteFill>
  );
};
