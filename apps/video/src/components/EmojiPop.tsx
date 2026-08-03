import React from "react";
import { Easing, interpolate, useCurrentFrame } from "remotion";

/**
 * Celebration burst: a central emoji pops in while a ring of smaller copies
 * flies outward, rotating and fading. Runs over ~48 frames from `startFrame`.
 * All trajectories are deterministic functions of particle index.
 */

const frac = (n: number): number => n - Math.floor(n);

export interface EmojiPopProps {
  emoji: string;
  /** Frame (relative to the parent sequence) at which the burst starts. */
  startFrame?: number;
  /** Number of burst particles around the centre. */
  count?: number;
  /** Max flight radius in px. */
  radius?: number;
  /** Font size of the central emoji in px. */
  size?: number;
}

export const EmojiPop: React.FC<EmojiPopProps> = ({
  emoji,
  startFrame = 0,
  count = 10,
  radius = 260,
  size = 120,
}) => {
  const frame = useCurrentFrame();
  const f = frame - startFrame;
  if (f < 0 || f > 54) return null;

  const clampOpts = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

  // Central emoji: overshoot pop then settle, fade out at the end.
  const centerScale = interpolate(f, [0, 6, 14, 40, 50], [0, 1.55, 1.12, 1.12, 0], {
    ...clampOpts,
    easing: Easing.out(Easing.cubic),
  });
  const centerOpacity = interpolate(f, [0, 3, 40, 50], [0, 1, 1, 0], clampOpts);

  const particles = new Array(count).fill(0).map((_, i) => {
    const angle = (i / count) * Math.PI * 2 - Math.PI / 2 + (frac(i * 0.618034) - 0.5) * 0.55;
    const maxDist = radius * (0.72 + frac(i * 0.37151) * 0.55);
    const dist = interpolate(f, [0, 18, 48], [8, maxDist * 0.85, maxDist], {
      ...clampOpts,
      easing: Easing.out(Easing.cubic),
    });
    const scale = interpolate(
      f,
      [0, 6, 38, 50],
      [0, 0.85 + frac(i * 0.7071) * 0.5, 0.75, 0],
      clampOpts
    );
    const rotate = (frac(i * 0.53101) - 0.5) * f * 9;
    const opacity = interpolate(f, [0, 4, 34, 50], [0, 1, 1, 0], clampOpts);
    // Slight gravity droop late in flight.
    const droop = Math.max(0, f - 24) * 2.2 * (0.5 + frac(i * 0.291));
    const x = Math.cos(angle) * dist;
    const y = Math.sin(angle) * dist + droop;
    return { i, x, y, scale, rotate, opacity };
  });

  return (
    <div style={{ position: "absolute", width: 0, height: 0 }}>
      {particles.map((p) => (
        <span
          key={p.i}
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            fontSize: size * 0.42,
            opacity: p.opacity,
            transform: `translate(-50%, -50%) translate(${p.x}px, ${p.y}px) scale(${p.scale}) rotate(${p.rotate}deg)`,
          }}
        >
          {emoji}
        </span>
      ))}
      <span
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          fontSize: size,
          opacity: centerOpacity,
          transform: `translate(-50%, -50%) scale(${centerScale})`,
          filter: "drop-shadow(0 8px 24px rgba(0,0,0,0.5))",
        }}
      >
        {emoji}
      </span>
    </div>
  );
};
