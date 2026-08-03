import React from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  OffthreadVideo,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { z } from "zod";
import { AnimatedCaption } from "../components/AnimatedCaption";

// ─────────────────────────────────────────────────────────────────────────────
// Props schema — caption segments MIRROR TranscriptSegment from @fable/shared
// (startSec/endSec/text), with times RELATIVE to the clip start. Inlined so
// this workspace stays standalone; the API maps Clip + EditPlan data onto
// this shape when invoking the Remotion render path.
// ─────────────────────────────────────────────────────────────────────────────

export const captionSegmentSchema = z.object({
  startSec: z.number().min(0),
  endSec: z.number().min(0),
  text: z.string(),
});

export const clipShortSchema = z.object({
  /** Local path or URL of the source clip. Null → styled gradient stand-in. */
  src: z.string().nullable(),
  title: z.string(),
  hookText: z.string(),
  channelName: z.string(),
  accentColor: z.string(),
  /** Output length in seconds. */
  durationSec: z.number().min(3).max(180),
  /** Seek offset into the source video, seconds. */
  startFromSec: z.number().min(0),
  segments: z.array(captionSegmentSchema),
});
export type ClipShortProps = z.infer<typeof clipShortSchema>;

export const CLIP_FPS = 30;
export const clipShortTotalFrames = (props: ClipShortProps): number =>
  Math.max(1, Math.round(props.durationSec * CLIP_FPS));

const FONT_BLACK = '"Arial Black", "Segoe UI", Roboto, sans-serif';
const FONT_UI = '"Segoe UI", Roboto, sans-serif';

const clampOpts = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/**
 * Build punch-zoom keyframes: every 4s the scale snaps between 1 and 1.13
 * over a 10-frame punch, holding in between — the standard clip-channel
 * "engagement zoom" rhythm.
 */
const buildZoomKeyframes = (
  durationInFrames: number,
  fps: number
): { input: number[]; output: number[] } => {
  const holdFrames = Math.round(4 * fps);
  const punchFrames = 10;
  const input: number[] = [0];
  const output: number[] = [1];
  let level = 1;
  for (let t = holdFrames; t + punchFrames < durationInFrames; t += holdFrames) {
    input.push(t, t + punchFrames);
    output.push(level);
    level = level === 1 ? 1.13 : 1;
    output.push(level);
  }
  if (input.length === 1) {
    input.push(Math.max(1, durationInFrames - 1));
    output.push(1);
  }
  return { input, output };
};

/** Styled gradient stand-in shown when no source video is supplied. */
const VideoStandIn: React.FC<{ accentColor: string }> = ({ accentColor }) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const t = frame / fps;

  const blob1X = Math.sin(t * 0.32) * 150;
  const blob1Y = Math.cos(t * 0.24) * 190;
  const blob2X = Math.cos(t * 0.27) * 170;
  const blob2Y = Math.sin(t * 0.21) * 150;

  // Diagonal sheen sweeping across every ~4s.
  const sheenX = ((frame * 7) % (width + 900)) - 900;

  return (
    <AbsoluteFill
      style={{
        background: "linear-gradient(200deg, #1e1038 0%, #3b0f63 45%, #12071f 100%)",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          width: 900,
          height: 900,
          left: -220 + blob1X,
          top: 120 + blob1Y,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${accentColor}55 0%, transparent 65%)`,
          filter: "blur(60px)",
        }}
      />
      <div
        style={{
          position: "absolute",
          width: 820,
          height: 820,
          right: -260 + blob2X,
          bottom: 160 + blob2Y,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(217,70,239,0.32) 0%, transparent 65%)",
          filter: "blur(60px)",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          width: 340,
          left: sheenX,
          background:
            "linear-gradient(100deg, transparent 0%, rgba(255,255,255,0.07) 50%, transparent 100%)",
          transform: "skewX(-14deg)",
        }}
      />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 34,
        }}
      >
        <div
          style={{
            width: 220,
            height: 220,
            borderRadius: "50%",
            background: "rgba(255,255,255,0.08)",
            border: "4px dashed rgba(255,255,255,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transform: `scale(${1 + 0.04 * Math.sin(t * Math.PI * 2 * 0.5)})`,
          }}
        >
          <div
            style={{
              width: 0,
              height: 0,
              borderTop: "46px solid transparent",
              borderBottom: "46px solid transparent",
              borderLeft: "74px solid rgba(255,255,255,0.85)",
              marginLeft: 18,
            }}
          />
        </div>
        <span
          style={{
            fontFamily: FONT_BLACK,
            fontWeight: 900,
            fontSize: 44,
            letterSpacing: 6,
            color: "rgba(255,255,255,0.8)",
          }}
        >
          SOURCE CLIP
        </span>
        <span
          style={{
            fontFamily: FONT_UI,
            fontWeight: 600,
            fontSize: 30,
            color: "rgba(255,255,255,0.5)",
          }}
        >
          drops in when a src is provided
        </span>
      </div>
    </AbsoluteFill>
  );
};

export const ClipShort: React.FC<ClipShortProps> = ({
  src,
  title,
  hookText,
  channelName,
  accentColor,
  durationSec,
  startFromSec,
  segments,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const durationInFrames = Math.max(1, Math.round(durationSec * fps));

  // Punch-zoom keyframes + slow lateral drift for constant motion.
  const { input, output } = buildZoomKeyframes(durationInFrames, fps);
  const zoom = interpolate(frame, input, output, {
    ...clampOpts,
    easing: Easing.out(Easing.cubic),
  });
  const drift = Math.sin((frame / fps) * Math.PI * 2 * 0.24) * 12;

  // Hook banner: springs in within the first second, slides away at ~2.2s.
  const bannerIn = spring({ frame, fps, config: { damping: 13, stiffness: 150 } });
  const bannerOutStart = Math.round(2.2 * fps);
  const bannerOut = interpolate(frame, [bannerOutStart, bannerOutStart + 12], [0, 1], {
    ...clampOpts,
    easing: Easing.in(Easing.cubic),
  });
  const bannerY = interpolate(bannerIn, [0, 1], [-280, 0]) - bannerOut * 340;
  const bannerOpacity = Math.min(1, bannerIn * 1.6) * (1 - bannerOut);

  // Title strip appears once the hook banner leaves.
  const titleOpacity = interpolate(frame, [bannerOutStart + 10, bannerOutStart + 24], [0, 1], clampOpts);

  const progressPct = Math.min(1, frame / Math.max(1, durationInFrames - 1)) * 100;

  return (
    <AbsoluteFill style={{ background: "#0d0620" }}>
      {/* Video layer inside the zoom container */}
      <AbsoluteFill
        style={{
          transform: `scale(${zoom}) translateX(${drift}px)`,
          transformOrigin: "50% 45%",
        }}
      >
        {src ? (
          <OffthreadVideo
            src={src}
            startFrom={Math.round(startFromSec * fps)}
            style={{ width, height, objectFit: "cover" }}
          />
        ) : (
          <VideoStandIn accentColor={accentColor} />
        )}
      </AbsoluteFill>

      {/* Cinematic vignette for caption legibility */}
      <AbsoluteFill
        style={{
          background:
            "linear-gradient(180deg, rgba(0,0,0,0.42) 0%, transparent 22%, transparent 62%, rgba(0,0,0,0.62) 100%)",
          pointerEvents: "none",
        }}
      />

      {/* Hook banner */}
      <div
        style={{
          position: "absolute",
          top: 150,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
          transform: `translateY(${bannerY}px)`,
          opacity: bannerOpacity,
        }}
      >
        <span
          style={{
            fontFamily: FONT_BLACK,
            fontWeight: 900,
            fontSize: 54,
            lineHeight: 1.2,
            color: "#ffffff",
            background: `linear-gradient(90deg, ${accentColor}ee, #d946efee)`,
            border: "3px solid rgba(255,255,255,0.35)",
            borderRadius: 28,
            padding: "24px 52px",
            maxWidth: 900,
            textAlign: "center",
            boxShadow: `0 18px 50px rgba(0,0,0,0.55), 0 0 50px ${accentColor}77`,
          }}
        >
          {hookText}
        </span>
      </div>

      {/* Title strip (after the hook leaves) */}
      <div
        style={{
          position: "absolute",
          top: 160,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
          opacity: titleOpacity,
        }}
      >
        <span
          style={{
            fontFamily: FONT_UI,
            fontWeight: 800,
            fontSize: 38,
            color: "rgba(255,255,255,0.95)",
            background: "rgba(10,4,24,0.6)",
            border: "2px solid rgba(255,255,255,0.2)",
            borderRadius: 999,
            padding: "14px 40px",
            maxWidth: 880,
            textAlign: "center",
          }}
        >
          {title}
        </span>
      </div>

      {/* Karaoke captions */}
      <AnimatedCaption segments={segments} highlightColor="#facc15" fontSize={68} bottom={340} />

      {/* Channel watermark */}
      <div
        style={{
          position: "absolute",
          right: 44,
          bottom: 150,
          fontFamily: FONT_UI,
          fontWeight: 700,
          fontSize: 30,
          color: "rgba(255,255,255,0.65)",
          background: "rgba(10,4,24,0.45)",
          borderRadius: 999,
          padding: "8px 24px",
          letterSpacing: 1,
        }}
      >
        @{channelName}
      </div>

      {/* Bottom progress hairline */}
      <div
        style={{
          position: "absolute",
          left: 0,
          bottom: 0,
          height: 10,
          width: `${progressPct}%`,
          background: `linear-gradient(90deg, ${accentColor}, #d946ef)`,
          boxShadow: `0 0 16px ${accentColor}`,
        }}
      />
    </AbsoluteFill>
  );
};
