import React from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  OffthreadVideo,
  Series,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { z } from "zod";
import { NumberStinger } from "../components/NumberStinger";
import { AnimatedCaption } from "../components/AnimatedCaption";
import { Particles } from "../components/Particles";

// ─────────────────────────────────────────────────────────────────────────────
// Props schema — items MIRROR the Clip rows + ScriptPlan "number"/"clip"
// scenes from @fable/shared (rank/label/startSec/endSec + caption text).
// Inlined so this workspace stays standalone; the API maps its top5 project
// data (5 kept clips, ranked) onto this shape when invoking Remotion.
// ─────────────────────────────────────────────────────────────────────────────

export const topFiveItemSchema = z.object({
  /** 1 = best. Items are played in descending rank order (5 → 1). */
  rank: z.number().int().min(1).max(10),
  label: z.string(),
  /** Cut points into the source video, seconds. */
  startSec: z.number().min(0),
  endSec: z.number().min(0),
  /** Karaoke caption for the moment; falls back to the label. */
  caption: z.string().optional(),
});
export type TopFiveItem = z.infer<typeof topFiveItemSchema>;

export const topFiveSchema = z.object({
  title: z.string(),
  channelName: z.string(),
  accentColor: z.string(),
  /** Local path or URL of the source video. Null → styled stand-ins. */
  src: z.string().nullable(),
  items: z.array(topFiveItemSchema).min(1),
});
export type TopFiveProps = z.infer<typeof topFiveSchema>;

// ── Timing model (30fps) ─────────────────────────────────────────────────────
export const TOP5_FPS = 30;
export const TOP5_INTRO_FRAMES = 72; // 2.4s
export const TOP5_STINGER_FRAMES = 42; // 1.4s
export const TOP5_OUTRO_FRAMES = 90; // 3s

/** Clip play length in frames — clamped to a 2s..12s window per moment. */
export const top5ClipFrames = (item: TopFiveItem): number => {
  const sec = Math.max(2, Math.min(12, item.endSec - item.startSec));
  return Math.round(sec * TOP5_FPS);
};

export const top5TotalFrames = (props: TopFiveProps): number =>
  TOP5_INTRO_FRAMES +
  props.items.reduce((acc, it) => acc + TOP5_STINGER_FRAMES + top5ClipFrames(it), 0) +
  TOP5_OUTRO_FRAMES;

const FONT_BLACK = '"Arial Black", "Segoe UI", Roboto, sans-serif';
const FONT_UI = '"Segoe UI", Roboto, sans-serif';

const clampOpts = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

// Stand-in backgrounds cycled by rank when no src is provided.
const STAND_IN_GRADIENTS = [
  "linear-gradient(210deg, #241040 0%, #4c1d95 55%, #140a26 100%)",
  "linear-gradient(210deg, #2b0d3d 0%, #7e22ce 55%, #170826 100%)",
  "linear-gradient(210deg, #310b33 0%, #a21caf 55%, #1b0722 100%)",
  "linear-gradient(210deg, #101638 0%, #4338ca 55%, #0b0e26 100%)",
  "linear-gradient(210deg, #331004 0%, #c2410c 55%, #200a05 100%)",
];

const DarkBackdrop: React.FC = () => (
  <AbsoluteFill
    style={{
      background: "linear-gradient(165deg, #150829 0%, #2a0f5e 45%, #0d0620 100%)",
    }}
  >
    <Particles count={26} />
  </AbsoluteFill>
);

// ── Intro scene ──────────────────────────────────────────────────────────────
const IntroScene: React.FC<{ title: string; accentColor: string; count: number }> = ({
  title,
  accentColor,
  count,
}) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();

  const topS = spring({ frame: f, fps, config: { damping: 12, stiffness: 150 } });
  const numS = spring({ frame: f - 6, fps, config: { damping: 10, stiffness: 170, mass: 0.9 } });
  const titleOpacity = interpolate(f, [22, 34], [0, 1], clampOpts);
  const titleY = interpolate(f, [22, 34], [40, 0], {
    ...clampOpts,
    easing: Easing.out(Easing.cubic),
  });
  const numGlow = 40 + 30 * (0.5 + 0.5 * Math.sin((f / fps) * Math.PI * 2 * 1.4));

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <DarkBackdrop />
      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span
          style={{
            fontFamily: FONT_BLACK,
            fontWeight: 900,
            fontSize: 150,
            letterSpacing: 14,
            color: "#ffffff",
            transform: `translateY(${interpolate(topS, [0, 1], [-360, 0])}px)`,
            textShadow: "0 10px 0 #3b0764, 0 20px 60px rgba(0,0,0,0.6)",
          }}
        >
          TOP
        </span>
        <span
          style={{
            fontFamily: FONT_BLACK,
            fontWeight: 900,
            fontSize: 460,
            lineHeight: 0.95,
            color: "#ffffff",
            transform: `scale(${interpolate(numS, [0, 1], [3, 1])}) rotate(${interpolate(
              numS,
              [0, 1],
              [12, 0]
            )}deg)`,
            textShadow: `0 14px 0 #3b0764, 0 30px 80px rgba(0,0,0,0.65), 0 0 ${numGlow}px ${accentColor}`,
          }}
        >
          {count}
        </span>
        <span
          style={{
            marginTop: 40,
            fontFamily: FONT_BLACK,
            fontWeight: 900,
            fontSize: 58,
            lineHeight: 1.2,
            textAlign: "center",
            textTransform: "uppercase",
            maxWidth: 880,
            color: "#ffffff",
            opacity: titleOpacity,
            transform: `translateY(${titleY}px)`,
            background: `linear-gradient(90deg, ${accentColor}cc, #d946efcc)`,
            borderRadius: 26,
            border: "3px solid rgba(255,255,255,0.3)",
            padding: "22px 46px",
            boxShadow: `0 16px 46px rgba(0,0,0,0.5), 0 0 44px ${accentColor}66`,
          }}
        >
          {title}
        </span>
      </div>
    </AbsoluteFill>
  );
};

// ── Clip scene (one ranked moment) ───────────────────────────────────────────
const ClipScene: React.FC<{
  item: TopFiveItem;
  src: string | null;
  accentColor: string;
  clipFrames: number;
  playIndex: number;
}> = ({ item, src, accentColor, clipFrames, playIndex }) => {
  const f = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const clipSec = clipFrames / fps;

  // Alternating slow ken-burns per item so back-to-back clips feel different.
  const zoomIn = playIndex % 2 === 0;
  const scale = interpolate(f, [0, clipFrames], zoomIn ? [1, 1.1] : [1.1, 1], {
    ...clampOpts,
    easing: Easing.inOut(Easing.ease),
  });

  // Rank badge slam-in.
  const badgeS = spring({ frame: f - 2, fps, config: { damping: 12, stiffness: 160 } });
  // Label banner rises from the bottom shortly after.
  const labelS = spring({ frame: f - 6, fps, config: { damping: 14, stiffness: 140 } });

  const captionText = item.caption ?? item.label;
  const captionSegments = [
    {
      startSec: Math.min(0.35, clipSec / 4),
      endSec: Math.max(0.6, clipSec - 0.2),
      text: captionText,
    },
  ];

  const gradient = STAND_IN_GRADIENTS[(item.rank - 1) % STAND_IN_GRADIENTS.length];

  return (
    <AbsoluteFill style={{ background: "#0d0620" }}>
      <AbsoluteFill style={{ transform: `scale(${scale})`, transformOrigin: "50% 45%" }}>
        {src ? (
          <OffthreadVideo
            src={src}
            startFrom={Math.round(item.startSec * fps)}
            style={{ width, height, objectFit: "cover" }}
          />
        ) : (
          <AbsoluteFill style={{ background: gradient, alignItems: "center", justifyContent: "center" }}>
            <span
              style={{
                fontSize: 200,
                opacity: 0.9,
                transform: `translateY(${Math.sin((f / fps) * Math.PI * 2 * 0.6) * 14}px)`,
              }}
            >
              {["😂", "🤣", "💀", "😜", "🤯"][(item.rank - 1) % 5]}
            </span>
            <span
              style={{
                marginTop: 26,
                fontFamily: FONT_BLACK,
                fontWeight: 900,
                fontSize: 40,
                letterSpacing: 5,
                color: "rgba(255,255,255,0.7)",
              }}
            >
              MOMENT #{item.rank}
            </span>
          </AbsoluteFill>
        )}
      </AbsoluteFill>

      {/* Legibility vignette */}
      <AbsoluteFill
        style={{
          background:
            "linear-gradient(180deg, rgba(0,0,0,0.45) 0%, transparent 24%, transparent 60%, rgba(0,0,0,0.62) 100%)",
          pointerEvents: "none",
        }}
      />

      {/* Rank badge */}
      <div
        style={{
          position: "absolute",
          top: 130,
          left: 60,
          transform: `scale(${badgeS}) rotate(${interpolate(badgeS, [0, 1], [-18, -4])}deg)`,
          fontFamily: FONT_BLACK,
          fontWeight: 900,
          fontSize: 74,
          color: "#ffffff",
          background: `linear-gradient(135deg, ${accentColor}, #d946ef)`,
          border: "4px solid rgba(255,255,255,0.4)",
          borderRadius: 30,
          padding: "16px 40px",
          boxShadow: `0 16px 40px rgba(0,0,0,0.55), 0 0 44px ${accentColor}88`,
        }}
      >
        #{item.rank}
      </div>

      {/* Ranked label banner */}
      <div
        style={{
          position: "absolute",
          top: 152,
          right: 60,
          maxWidth: 620,
          transform: `translateY(${interpolate(labelS, [0, 1], [-200, 0])}px)`,
          opacity: Math.min(1, labelS * 1.4),
          fontFamily: FONT_UI,
          fontWeight: 800,
          fontSize: 40,
          lineHeight: 1.2,
          color: "#ffffff",
          background: "rgba(10,4,24,0.62)",
          border: "2px solid rgba(255,255,255,0.22)",
          borderRadius: 24,
          padding: "18px 34px",
          textAlign: "right",
        }}
      >
        {item.label}
      </div>

      {/* Karaoke caption */}
      <AnimatedCaption segments={captionSegments} highlightColor="#facc15" fontSize={64} bottom={330} />
    </AbsoluteFill>
  );
};

// ── Outro scene ──────────────────────────────────────────────────────────────
const OutroScene: React.FC<{ channelName: string; accentColor: string }> = ({
  channelName,
  accentColor,
}) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();

  const headS = spring({ frame: f, fps, config: { damping: 12, stiffness: 150 } });
  const btnS = spring({ frame: f - 10, fps, config: { damping: 11, stiffness: 150 } });
  const pulse = 1 + 0.055 * Math.sin((f / fps) * Math.PI * 2 * 1.15);
  const rf = f % fps;
  const rippleScale = interpolate(rf, [0, fps - 1], [1, 1.55], clampOpts);
  const rippleOpacity = interpolate(rf, [0, fps - 1], [0.5, 0], clampOpts);
  const commentBob = Math.sin((f / fps) * Math.PI * 2 * 0.9) * 10;

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <DarkBackdrop />
      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 48,
        }}
      >
        <span
          style={{
            fontFamily: FONT_BLACK,
            fontWeight: 900,
            fontSize: 76,
            lineHeight: 1.15,
            textAlign: "center",
            maxWidth: 880,
            color: "#ffffff",
            transform: `scale(${headS})`,
            textShadow: "0 8px 0 #3b0764, 0 20px 60px rgba(0,0,0,0.6)",
          }}
        >
          WHICH ONE WAS YOUR FAVOURITE?
        </span>
        <span style={{ fontSize: 110, transform: `translateY(${commentBob}px)` }}>💬</span>
        <div style={{ position: "relative", transform: `scale(${btnS})` }}>
          <div
            style={{
              position: "absolute",
              inset: -8,
              borderRadius: 999,
              border: "4px solid #ff0033",
              opacity: rippleOpacity,
              transform: `scale(${rippleScale})`,
            }}
          />
          <div
            style={{
              transform: `scale(${pulse})`,
              background: "linear-gradient(180deg, #ff2d55, #d90429)",
              borderRadius: 999,
              padding: "28px 78px",
              boxShadow: "0 0 46px rgba(255,0,51,0.7), 0 18px 40px rgba(0,0,0,0.5)",
              fontFamily: FONT_BLACK,
              fontWeight: 900,
              fontSize: 52,
              letterSpacing: 3,
              color: "#ffffff",
            }}
          >
            SUBSCRIBE 🔔
          </div>
        </div>
        <span
          style={{
            fontFamily: FONT_UI,
            fontWeight: 700,
            fontSize: 36,
            color: "rgba(255,255,255,0.7)",
            opacity: interpolate(f, [16, 28], [0, 1], clampOpts),
          }}
        >
          @{channelName} — new countdowns daily
        </span>
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "40%",
            width: 0,
            height: 0,
            boxShadow: `0 0 220px 90px ${accentColor}33`,
          }}
        />
      </div>
    </AbsoluteFill>
  );
};

// ── Main composition ─────────────────────────────────────────────────────────
export const TopFive: React.FC<TopFiveProps> = ({
  title,
  channelName,
  accentColor,
  src,
  items,
}) => {
  // Play in countdown order: highest rank number first, #1 last.
  const ordered = [...items].sort((a, b) => b.rank - a.rank);

  return (
    <AbsoluteFill style={{ background: "#0d0620" }}>
      <Series>
        <Series.Sequence durationInFrames={TOP5_INTRO_FRAMES}>
          <IntroScene title={title} accentColor={accentColor} count={items.length} />
        </Series.Sequence>
        {ordered.flatMap((item, playIndex) => {
          const clipFrames = top5ClipFrames(item);
          return [
            <Series.Sequence
              key={`stinger-${item.rank}-${item.startSec}`}
              durationInFrames={TOP5_STINGER_FRAMES}
            >
              <AbsoluteFill>
                <DarkBackdrop />
                <NumberStinger
                  value={item.rank}
                  label={item.rank === 1 ? "THE #1 MOMENT" : "NEXT UP"}
                  accentColor={accentColor}
                  durationInFrames={TOP5_STINGER_FRAMES}
                />
              </AbsoluteFill>
            </Series.Sequence>,
            <Series.Sequence
              key={`clip-${item.rank}-${item.startSec}`}
              durationInFrames={clipFrames}
            >
              <ClipScene
                item={item}
                src={src}
                accentColor={accentColor}
                clipFrames={clipFrames}
                playIndex={playIndex}
              />
            </Series.Sequence>,
          ];
        })}
        <Series.Sequence durationInFrames={TOP5_OUTRO_FRAMES}>
          <OutroScene channelName={channelName} accentColor={accentColor} />
        </Series.Sequence>
      </Series>
    </AbsoluteFill>
  );
};
