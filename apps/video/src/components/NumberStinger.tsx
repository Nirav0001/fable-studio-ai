import React from "react";
import {
  Easing,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

/**
 * Countdown number stinger: a huge 3D-extruded number slams in with a spring,
 * fires expanding shockwave rings and a decaying screen shake, then zooms
 * past the camera on exit. Designed for ~42-frame sequences between clips.
 */
export interface NumberStingerProps {
  value: number;
  label?: string;
  accentColor?: string;
  /** Length of the hosting sequence — drives the exit animation. */
  durationInFrames?: number;
}

/** Build the stacked text-shadow that fakes a deep 3D extrusion. */
const buildExtrusion = (accent: string): string => {
  const layers: string[] = [];
  for (let d = 1; d <= 14; d++) {
    const t = d / 14;
    const shade = Math.round(46 - t * 34); // darken with depth
    layers.push(`0 ${d * 4}px 0 rgb(${shade}, ${Math.round(shade * 0.55)}, ${Math.round(shade * 1.9)})`);
  }
  layers.push("0 64px 90px rgba(0,0,0,0.65)");
  layers.push(`0 0 110px ${accent}`);
  return layers.join(", ");
};

export const NumberStinger: React.FC<NumberStingerProps> = ({
  value,
  label,
  accentColor = "#a855f7",
  durationInFrames = 42,
}) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();

  const clampOpts = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

  // Slam-in spring: starts huge (past the camera) and settles at 1.
  const spr = spring({
    frame: f,
    fps,
    config: { damping: 11, stiffness: 170, mass: 0.9 },
  });
  const inScale = interpolate(spr, [0, 1], [3.4, 1]);
  const inRotate = interpolate(spr, [0, 1], [-16, 0]);
  const inOpacity = interpolate(f, [0, 4], [0, 1], clampOpts);

  // Impact shake, decaying over ~16 frames after the slam.
  const shakeAmp = interpolate(f, [5, 22], [10, 0], clampOpts);
  const shakeX = Math.sin(f * 2.13) * shakeAmp;
  const shakeY = Math.cos(f * 2.71) * shakeAmp * 0.6;

  // Exit: zoom toward camera + fade during the final 8 frames.
  const exitP = interpolate(f, [durationInFrames - 8, durationInFrames - 1], [0, 1], {
    ...clampOpts,
    easing: Easing.in(Easing.cubic),
  });
  const scale = inScale * (1 + exitP * 0.6);
  const opacity = inOpacity * (1 - exitP);

  // Shockwave rings staggered from the moment of impact.
  const rings = [0, 1, 2].map((k) => {
    const start = 4 + k * 6;
    const rf = f - start;
    const ringScale = interpolate(rf, [0, 26], [0.25, 2.5], {
      ...clampOpts,
      easing: Easing.out(Easing.cubic),
    });
    const ringOpacity = rf < 0 ? 0 : interpolate(rf, [0, 26], [0.7, 0], clampOpts);
    return { k, ringScale, ringOpacity };
  });

  const labelOpacity = interpolate(f, [10, 20], [0, 1], clampOpts) * (1 - exitP);
  const labelY = interpolate(f, [10, 20], [44, 0], {
    ...clampOpts,
    easing: Easing.out(Easing.cubic),
  });

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        opacity,
      }}
    >
      {rings.map((r) => (
        <div
          key={r.k}
          style={{
            position: "absolute",
            width: 560,
            height: 560,
            borderRadius: "50%",
            border: `10px solid ${accentColor}`,
            opacity: r.ringOpacity,
            transform: `scale(${r.ringScale})`,
            boxShadow: `0 0 60px ${accentColor}66, inset 0 0 60px ${accentColor}44`,
          }}
        />
      ))}
      <div
        style={{
          transform: `translate(${shakeX}px, ${shakeY}px) scale(${scale}) rotate(${inRotate}deg)`,
        }}
      >
        <span
          style={{
            fontFamily: '"Arial Black", "Segoe UI", Roboto, sans-serif',
            fontWeight: 900,
            fontSize: 620,
            lineHeight: 1,
            color: "#ffffff",
            textShadow: buildExtrusion(accentColor),
            display: "block",
          }}
        >
          {value}
        </span>
      </div>
      {label ? (
        <div
          style={{
            marginTop: 90,
            opacity: labelOpacity,
            transform: `translateY(${labelY}px)`,
            fontFamily: '"Arial Black", "Segoe UI", Roboto, sans-serif',
            fontWeight: 900,
            fontSize: 58,
            letterSpacing: 4,
            textTransform: "uppercase",
            color: "#ffffff",
            background: `linear-gradient(90deg, ${accentColor}cc, #4c1d95cc)`,
            border: "3px solid rgba(255,255,255,0.25)",
            borderRadius: 999,
            padding: "18px 54px",
            textShadow: "0 4px 12px rgba(0,0,0,0.6)",
          }}
        >
          {label}
        </div>
      ) : null}
    </div>
  );
};
