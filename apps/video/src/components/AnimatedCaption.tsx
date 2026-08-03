import React from "react";
import { Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";

/**
 * Karaoke caption renderer. Segments carry sentence-level timings (relative to
 * the hosting sequence); word timings are derived proportionally from word
 * length, so the highlight sweeps through the sentence at speech-like pace.
 * The active word pops with a scale bounce, past words stay bright, future
 * words are dimmed — the classic Shorts karaoke style.
 */

// Mirrors TranscriptSegment from @fable/shared (startSec/endSec/text) — kept
// inline so this workspace stays standalone with zero cross-package imports.
export interface CaptionSegmentT {
  startSec: number;
  endSec: number;
  text: string;
}

export interface AnimatedCaptionProps {
  segments: CaptionSegmentT[];
  highlightColor?: string;
  fontSize?: number;
  /** Distance of the caption block from the bottom edge, px. */
  bottom?: number;
  maxWidth?: number;
}

const OUTLINE =
  "-4px -4px 0 rgba(0,0,0,0.9), 4px -4px 0 rgba(0,0,0,0.9), -4px 4px 0 rgba(0,0,0,0.9), 4px 4px 0 rgba(0,0,0,0.9), 0 -5px 0 rgba(0,0,0,0.9), 0 5px 0 rgba(0,0,0,0.9), -5px 0 0 rgba(0,0,0,0.9), 5px 0 0 rgba(0,0,0,0.9), 0 10px 26px rgba(0,0,0,0.7)";

export const AnimatedCaption: React.FC<AnimatedCaptionProps> = ({
  segments,
  highlightColor = "#facc15",
  fontSize = 68,
  bottom = 360,
  maxWidth = 900,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;

  const seg = segments.find((s) => t >= s.startSec && t < s.endSec);
  if (!seg) return null;

  const segDur = Math.max(0.001, seg.endSec - seg.startSec);
  const words = seg.text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;

  // Word start times proportional to word length (+1 for the gap).
  const weights = words.map((w) => w.length + 1);
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  let acc = 0;
  const starts = weights.map((w) => {
    const start = seg.startSec + (acc / totalWeight) * segDur;
    acc += w;
    return start;
  });

  let activeIdx = 0;
  for (let k = 0; k < starts.length; k++) {
    if (t >= starts[k]) activeIdx = k;
  }

  const clampOpts = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

  // Whole-block entrance at the start of each segment.
  const bf = (t - seg.startSec) * fps;
  const blockScale = interpolate(bf, [0, 5], [0.82, 1], {
    ...clampOpts,
    easing: Easing.out(Easing.back(1.6)),
  });
  const blockOpacity = interpolate(bf, [0, 4], [0, 1], clampOpts);

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom,
        display: "flex",
        justifyContent: "center",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          maxWidth,
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          columnGap: fontSize * 0.32,
          rowGap: fontSize * 0.18,
          transform: `scale(${blockScale})`,
          opacity: blockOpacity,
        }}
      >
        {words.map((word, k) => {
          const isActive = k === activeIdx;
          const isFuture = k > activeIdx;
          const wf = (t - starts[k]) * fps;
          const pop = isActive
            ? interpolate(wf, [0, 4, 9], [0.85, 1.18, 1.06], clampOpts)
            : 1;
          const lift = isActive
            ? interpolate(wf, [0, 4, 9], [6, -8, 0], clampOpts)
            : 0;
          return (
            <span
              key={`${seg.startSec}-${k}`}
              style={{
                fontFamily: '"Arial Black", "Segoe UI", Roboto, sans-serif',
                fontWeight: 900,
                fontSize,
                lineHeight: 1.18,
                textTransform: "uppercase",
                color: isActive ? highlightColor : "#ffffff",
                opacity: isFuture ? 0.38 : 1,
                textShadow: OUTLINE,
                transform: `scale(${pop}) translateY(${lift}px)`,
                display: "inline-block",
              }}
            >
              {word}
            </span>
          );
        })}
      </div>
    </div>
  );
};
