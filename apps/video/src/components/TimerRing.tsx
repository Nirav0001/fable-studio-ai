import React from "react";
import {
  Easing,
  interpolate,
  interpolateColors,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

/**
 * Animated countdown ring. The stroke depletes clockwise over the countdown,
 * the colour shifts green → amber → red as time runs out, and the centre
 * number pulses on every second tick.
 */
export interface TimerRingProps {
  /** Countdown length in frames (e.g. 5s at 30fps = 150). */
  durationInFrames: number;
  /** Frame (relative to the parent sequence) at which the countdown starts. */
  startFrame?: number;
  /** Outer diameter in px. */
  size?: number;
  strokeWidth?: number;
}

export const TimerRing: React.FC<TimerRingProps> = ({
  durationInFrames,
  startFrame = 0,
  size = 260,
  strokeWidth = 16,
}) => {
  const raw = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Pop-in over the 12 frames before the countdown starts.
  const appear = interpolate(raw, [startFrame - 12, startFrame], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.back(1.8)),
  });

  const f = Math.max(0, raw - startFrame);
  const progress = Math.min(1, f / durationInFrames);
  const remaining = Math.max(0, Math.ceil((durationInFrames - f) / fps));

  const ringColor = interpolateColors(
    progress,
    [0, 0.5, 0.8, 1],
    ["#22c55e", "#a3e635", "#f59e0b", "#ef4444"]
  );

  // Pulse the number at the top of every second.
  const secFrame = ((f % fps) + fps) % fps;
  const numberScale = interpolate(secFrame, [0, 5, fps - 1], [1.28, 1, 1], {
    extrapolateRight: "clamp",
  });

  // Urgency shake in the final second.
  const finalSecond = progress > (durationInFrames - fps) / durationInFrames;
  const shake = finalSecond ? Math.sin(f * 2.4) * 4 : 0;

  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const dashOffset = circumference * progress;

  return (
    <div
      style={{
        width: size,
        height: size,
        position: "relative",
        transform: `scale(${appear}) translateX(${shake}px)`,
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ transform: "rotate(-90deg)", filter: `drop-shadow(0 0 18px ${ringColor})` }}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="rgba(10, 4, 24, 0.72)"
          stroke="rgba(255, 255, 255, 0.14)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={ringColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
        />
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span
          style={{
            fontFamily: '"Arial Black", "Segoe UI", Roboto, sans-serif',
            fontWeight: 900,
            fontSize: size * 0.42,
            color: "#ffffff",
            textShadow: `0 0 24px ${ringColor}, 0 4px 10px rgba(0,0,0,0.6)`,
            transform: `scale(${numberScale})`,
            lineHeight: 1,
          }}
        >
          {remaining}
        </span>
      </div>
    </div>
  );
};
