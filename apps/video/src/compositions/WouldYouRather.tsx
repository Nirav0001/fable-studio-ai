import React from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  Series,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { z } from "zod";
import { Particles } from "../components/Particles";
import { TimerRing } from "../components/TimerRing";
import { ProgressBar } from "../components/ProgressBar";
import { EmojiPop } from "../components/EmojiPop";

// ─────────────────────────────────────────────────────────────────────────────
// Props schema — deliberately MIRRORS WyrQuestionT from @fable/shared
// (theme/difficulty/optionA/optionB/percentA/factoid) plus render-only emoji
// fields. Inlined so this workspace stays standalone (no cross-package deps);
// the API maps its ScriptPlan/WyrQuestionT data onto this shape 1:1.
// ─────────────────────────────────────────────────────────────────────────────

export const wyrQuestionSchema = z.object({
  theme: z.string(),
  difficulty: z.enum(["easy", "medium", "hard", "impossible"]),
  optionA: z.string(),
  optionB: z.string(),
  /** % of viewers who pick option A — drives the reveal bars. */
  percentA: z.number().min(0).max(100),
  factoid: z.string().optional(),
  emojiA: z.string().optional(),
  emojiB: z.string().optional(),
});
export type WyrQuestionProps = z.infer<typeof wyrQuestionSchema>;

export const wouldYouRatherSchema = z.object({
  channelName: z.string(),
  hookText: z.string(),
  ctaText: z.string(),
  accentColor: z.string(),
  /** Countdown length per question in seconds (config pacing; default 5). */
  timerSec: z.number().min(2).max(10),
  questions: z.array(wyrQuestionSchema).min(1),
});
export type WouldYouRatherProps = z.infer<typeof wouldYouRatherSchema>;

// ── Timing model (30fps) ─────────────────────────────────────────────────────
export const WYR_FPS = 30;
export const WYR_HOOK_FRAMES = 66; // 2.2s
export const WYR_INTRO_FRAMES = 24; // cards slide in before the timer starts
export const WYR_REVEAL_FRAMES = 84; // 2.8s
export const WYR_CTA_FRAMES = 96; // 3.2s

export const wyrQuestionFrames = (timerSec: number): number =>
  WYR_INTRO_FRAMES + Math.round(timerSec * WYR_FPS);

export const wyrTotalFrames = (props: WouldYouRatherProps): number =>
  WYR_HOOK_FRAMES +
  props.questions.length * (wyrQuestionFrames(props.timerSec) + WYR_REVEAL_FRAMES) +
  WYR_CTA_FRAMES;

// ── Deterministic emoji fallback (FNV-1a, mirrored from @fable/shared) ───────
const hash32 = (input: string): number => {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
};

const THEME_EMOJI: Record<string, string[]> = {
  food: ["🍕", "🍔", "🌮", "🍩", "🍦", "🥑"],
  animals: ["🐶", "🐱", "🦁", "🐬", "🦖", "🦄"],
  money: ["💰", "💸", "🤑", "💎", "🏦", "🪙"],
  superpowers: ["⚡", "🦸", "🧠", "🌀", "🔥", "🫥"],
  movies: ["🎬", "🍿", "🎥", "🌟", "🎭", "👽"],
  gaming: ["🎮", "🕹️", "👾", "🏆", "⚔️", "🧩"],
  sports: ["⚽", "🏀", "🏎️", "🥊", "🏄", "🎾"],
  school: ["📚", "✏️", "🎒", "🧪", "🧮", "🏫"],
  travel: ["✈️", "🏝️", "🗺️", "🚀", "🏔️", "🎡"],
  luxury: ["🛥️", "🏰", "💎", "🥂", "🚁", "⌚"],
  general: ["🤔", "😮", "🎯", "✨", "🌟", "💫"],
  funny: ["😂", "🤣", "🤪", "😜", "🙃", "💀"],
  random: ["🎲", "❓", "🌈", "🌀", "🎁", "🫠"],
};

const emojiFor = (theme: string, text: string): string => {
  const bank = THEME_EMOJI[theme] ?? THEME_EMOJI.general;
  return bank[hash32(text) % bank.length];
};

const FONT_BLACK = '"Arial Black", "Segoe UI", Roboto, sans-serif';
const FONT_UI = '"Segoe UI", Roboto, sans-serif';

const clampOpts = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

// ── Background ───────────────────────────────────────────────────────────────
const Background: React.FC = () => (
  <AbsoluteFill
    style={{
      background:
        "linear-gradient(165deg, #150829 0%, #2a0f5e 42%, #3b1078 62%, #0d0620 100%)",
    }}
  >
    <div
      style={{
        position: "absolute",
        width: 1200,
        height: 1200,
        left: -420,
        top: -380,
        borderRadius: "50%",
        background: "radial-gradient(circle, rgba(139,92,246,0.35) 0%, transparent 65%)",
      }}
    />
    <div
      style={{
        position: "absolute",
        width: 1100,
        height: 1100,
        right: -420,
        bottom: -320,
        borderRadius: "50%",
        background: "radial-gradient(circle, rgba(217,70,239,0.24) 0%, transparent 65%)",
      }}
    />
    <Particles count={30} />
  </AbsoluteFill>
);

// ── Hook scene ───────────────────────────────────────────────────────────────
const HookScene: React.FC<{ hookText: string; accentColor: string; questionCount: number }> = ({
  hookText,
  accentColor,
  questionCount,
}) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const lines = ["WOULD", "YOU", "RATHER"];

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
        {lines.map((line, i) => {
          const s = spring({
            frame: f - i * 5,
            fps,
            config: { damping: 12, stiffness: 150, mass: 0.9 },
          });
          const x = interpolate(s, [0, 1], [i % 2 === 0 ? -700 : 700, 0]);
          const rot = interpolate(s, [0, 1], [i % 2 === 0 ? -8 : 8, 0]);
          return (
            <span
              key={line}
              style={{
                fontFamily: FONT_BLACK,
                fontWeight: 900,
                fontSize: 172,
                lineHeight: 1.02,
                color: "#ffffff",
                letterSpacing: 4,
                transform: `translateX(${x}px) rotate(${rot}deg)`,
                textShadow: `0 10px 0 #3b0764, 0 20px 60px rgba(0,0,0,0.6), 0 0 80px ${accentColor}88`,
              }}
            >
              {line}
            </span>
          );
        })}
        <div style={{ position: "relative", height: 0 }}>
          <EmojiPop emoji="🤯" startFrame={22} count={8} radius={300} size={140} />
        </div>
        <div
          style={{
            marginTop: 90,
            opacity: interpolate(f, [24, 34], [0, 1], clampOpts),
            transform: `translateY(${interpolate(f, [24, 34], [40, 0], {
              ...clampOpts,
              easing: Easing.out(Easing.cubic),
            })}px)`,
            fontFamily: FONT_UI,
            fontWeight: 800,
            fontSize: 52,
            color: "#ffffff",
            background: "rgba(10,4,24,0.55)",
            border: `3px solid ${accentColor}`,
            borderRadius: 999,
            padding: "20px 54px",
            boxShadow: `0 0 40px ${accentColor}66`,
          }}
        >
          {hookText}
        </div>
        <div
          style={{
            marginTop: 30,
            opacity: interpolate(f, [34, 44], [0, 1], clampOpts),
            fontFamily: FONT_UI,
            fontWeight: 700,
            fontSize: 38,
            color: "rgba(255,255,255,0.75)",
            letterSpacing: 2,
          }}
        >
          🔥 {questionCount} IMPOSSIBLE CHOICES
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ── Option card ──────────────────────────────────────────────────────────────
const OptionCard: React.FC<{
  side: "A" | "B";
  emoji: string;
  text: string;
  percent: number;
  translateX: number;
  revealP: number; // 0..1 clamped reveal spring
  isWinner: boolean;
  bobPhase: number;
  frame: number;
  fps: number;
  top: number;
}> = ({ side, emoji, text, percent, translateX, revealP, isWinner, bobPhase, frame, fps, top }) => {
  const winScale = 1 + (isWinner ? 0.05 : 0) * revealP;
  const loseFade = isWinner ? 1 : 1 - 0.4 * revealP;
  const bob = Math.sin((frame / fps) * Math.PI * 2 * 0.55 + bobPhase) * 7;
  const gradient =
    side === "A"
      ? "linear-gradient(135deg, rgba(124,58,237,0.82), rgba(67,26,144,0.92))"
      : "linear-gradient(135deg, rgba(219,39,119,0.72), rgba(112,26,117,0.9))";
  const barColor = side === "A" ? "#a78bfa" : "#f0abfc";
  const pct = Math.round(percent * revealP);

  return (
    <div
      style={{
        position: "absolute",
        left: 70,
        right: 70,
        top,
        height: 480,
        transform: `translateX(${translateX}px) scale(${winScale})`,
        opacity: loseFade,
        filter: isWinner ? "none" : `grayscale(${0.5 * revealP})`,
        background: gradient,
        border: `3px solid ${isWinner && revealP > 0.2 ? "#facc15" : "rgba(255,255,255,0.2)"}`,
        borderRadius: 40,
        boxShadow:
          isWinner && revealP > 0.2
            ? "0 30px 70px rgba(0,0,0,0.5), 0 0 60px rgba(250,204,21,0.35)"
            : "0 30px 70px rgba(0,0,0,0.5)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 56px 120px",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 26,
          left: 30,
          width: 76,
          height: 76,
          borderRadius: "50%",
          background: "rgba(10,4,24,0.55)",
          border: "3px solid rgba(255,255,255,0.35)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: FONT_BLACK,
          fontWeight: 900,
          fontSize: 40,
          color: "#ffffff",
        }}
      >
        {side}
      </div>
      <span style={{ fontSize: 128, transform: `translateY(${bob}px)`, lineHeight: 1 }}>
        {emoji}
      </span>
      <span
        style={{
          marginTop: 22,
          fontFamily: FONT_BLACK,
          fontWeight: 900,
          fontSize: 54,
          lineHeight: 1.15,
          color: "#ffffff",
          textAlign: "center",
          textShadow: "0 4px 14px rgba(0,0,0,0.55)",
        }}
      >
        {text}
      </span>
      {/* Reveal bar — fills to this option's percentage with a count-up label */}
      <div
        style={{
          position: "absolute",
          left: 26,
          right: 26,
          bottom: 24,
          height: 64,
          borderRadius: 999,
          background: "rgba(0,0,0,0.4)",
          opacity: Math.min(1, revealP * 2),
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${percent * revealP}%`,
            height: "100%",
            borderRadius: 999,
            background: `linear-gradient(90deg, ${barColor}, #ffffff)`,
            boxShadow: `0 0 24px ${barColor}`,
          }}
        />
        <span
          style={{
            position: "absolute",
            right: 26,
            top: "50%",
            transform: "translateY(-50%)",
            fontFamily: FONT_BLACK,
            fontWeight: 900,
            fontSize: 40,
            color: "#ffffff",
            textShadow: "0 2px 8px rgba(0,0,0,0.8)",
          }}
        >
          {pct}%
        </span>
      </div>
    </div>
  );
};

// ── Question scene (question phase + reveal phase in one sequence) ───────────
const QuestionScene: React.FC<{
  question: WyrQuestionProps;
  index: number;
  timerFrames: number;
  accentColor: string;
}> = ({ question, index, timerFrames, accentColor }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const revealStart = WYR_INTRO_FRAMES + timerFrames;
  const revealF = f - revealStart;
  const inReveal = revealF >= 0;

  const emojiA = question.emojiA ?? emojiFor(question.theme, question.optionA);
  const emojiB = question.emojiB ?? emojiFor(question.theme, `${question.optionB}~b`);

  // Entrances: A from the left, B from the right, staggered.
  const enterA = spring({ frame: f - 2, fps, config: { damping: 14, stiffness: 130, mass: 0.9 } });
  const enterB = spring({ frame: f - 8, fps, config: { damping: 14, stiffness: 130, mass: 0.9 } });
  const xA = interpolate(enterA, [0, 1], [-1200, 0]);
  const xB = interpolate(enterB, [0, 1], [1200, 0]);

  // Header drop-in.
  const headS = spring({ frame: f, fps, config: { damping: 13, stiffness: 160 } });
  const headY = interpolate(headS, [0, 1], [-220, 0]);

  // Reveal spring (clamped so the count-up never overshoots the true %).
  const revealSpring = inReveal
    ? spring({ frame: revealF, fps, config: { damping: 16, stiffness: 90 } })
    : 0;
  const revealP = Math.min(1, revealSpring);
  const aWins = question.percentA >= 50;

  // Timer fades/scales away as the reveal takes over.
  const timerOut = inReveal ? interpolate(revealF, [0, 8], [1, 0], clampOpts) : 1;

  const factoidOpacity = inReveal ? interpolate(revealF, [22, 34], [0, 1], clampOpts) : 0;

  return (
    <AbsoluteFill>
      {/* Header */}
      <div
        style={{
          position: "absolute",
          top: 130,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
          gap: 18,
          transform: `translateY(${headY}px)`,
        }}
      >
        <span
          style={{
            fontFamily: FONT_BLACK,
            fontWeight: 900,
            fontSize: 44,
            letterSpacing: 3,
            color: "#ffffff",
            background: "rgba(10,4,24,0.6)",
            border: `3px solid ${accentColor}`,
            borderRadius: 999,
            padding: "14px 40px",
            textShadow: "0 3px 10px rgba(0,0,0,0.6)",
          }}
        >
          WOULD YOU RATHER…
        </span>
        <span
          style={{
            fontFamily: FONT_UI,
            fontWeight: 700,
            fontSize: 34,
            color: "rgba(255,255,255,0.85)",
            background: "rgba(255,255,255,0.1)",
            border: "2px solid rgba(255,255,255,0.2)",
            borderRadius: 999,
            padding: "16px 30px",
            textTransform: "uppercase",
            letterSpacing: 2,
            alignSelf: "center",
          }}
        >
          {question.difficulty}
        </span>
      </div>

      <OptionCard
        side="A"
        emoji={emojiA}
        text={question.optionA}
        percent={question.percentA}
        translateX={xA}
        revealP={revealP}
        isWinner={aWins}
        bobPhase={index * 1.3}
        frame={f}
        fps={fps}
        top={330}
      />
      <OptionCard
        side="B"
        emoji={emojiB}
        text={question.optionB}
        percent={100 - question.percentA}
        translateX={xB}
        revealP={revealP}
        isWinner={!aWins}
        bobPhase={index * 1.3 + 2.1}
        frame={f}
        fps={fps}
        top={1100}
      />

      {/* Centre: countdown ring during the question, swap point of the layout */}
      {revealF < 10 ? (
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: 955,
            transform: `translate(-50%, -50%) scale(${timerOut})`,
            opacity: timerOut,
          }}
        >
          <TimerRing durationInFrames={timerFrames} startFrame={WYR_INTRO_FRAMES} size={260} strokeWidth={16} />
        </div>
      ) : null}

      {/* Winner celebration burst */}
      {inReveal ? (
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: aWins ? 570 : 1340,
          }}
        >
          <EmojiPop emoji={aWins ? emojiA : emojiB} startFrame={revealStart + 6} count={12} radius={330} size={130} />
        </div>
      ) : null}

      {/* Factoid */}
      {question.factoid ? (
        <div
          style={{
            position: "absolute",
            left: 110,
            right: 110,
            top: 1620,
            opacity: factoidOpacity,
            display: "flex",
            justifyContent: "center",
          }}
        >
          <span
            style={{
              fontFamily: FONT_UI,
              fontWeight: 600,
              fontSize: 34,
              lineHeight: 1.35,
              color: "rgba(255,255,255,0.88)",
              background: "rgba(10,4,24,0.6)",
              border: "2px solid rgba(255,255,255,0.18)",
              borderRadius: 24,
              padding: "18px 34px",
              textAlign: "center",
            }}
          >
            💡 {question.factoid}
          </span>
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

// ── CTA end card ─────────────────────────────────────────────────────────────
const CtaScene: React.FC<{ channelName: string; ctaText: string; accentColor: string }> = ({
  channelName,
  ctaText,
  accentColor,
}) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();

  const avatarS = spring({ frame: f, fps, config: { damping: 12, stiffness: 140 } });
  const textS = spring({ frame: f - 6, fps, config: { damping: 13, stiffness: 130 } });
  const btnS = spring({ frame: f - 12, fps, config: { damping: 11, stiffness: 150 } });

  // Heartbeat pulse + glow on the subscribe button.
  const pulse = 1 + 0.055 * Math.sin((f / fps) * Math.PI * 2 * 1.15);
  const glow = 30 + 26 * (0.5 + 0.5 * Math.sin((f / fps) * Math.PI * 2 * 1.15));

  // Ripple ring emitted once per second.
  const rf = f % fps;
  const rippleScale = interpolate(rf, [0, fps - 1], [1, 1.55], clampOpts);
  const rippleOpacity = interpolate(rf, [0, fps - 1], [0.5, 0], clampOpts);

  const bellRotate = Math.sin((f / fps) * Math.PI * 2 * 2) * 14;

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 44 }}>
        <div
          style={{
            width: 210,
            height: 210,
            borderRadius: "50%",
            transform: `scale(${avatarS})`,
            background: `linear-gradient(135deg, ${accentColor}, #d946ef)`,
            border: "5px solid rgba(255,255,255,0.35)",
            boxShadow: `0 0 70px ${accentColor}99`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: FONT_BLACK,
            fontWeight: 900,
            fontSize: 96,
            color: "#ffffff",
          }}
        >
          {channelName.charAt(0).toUpperCase()}
        </div>
        <span
          style={{
            fontFamily: FONT_BLACK,
            fontWeight: 900,
            fontSize: 56,
            color: "#ffffff",
            transform: `scale(${textS})`,
            textShadow: "0 6px 20px rgba(0,0,0,0.6)",
          }}
        >
          {channelName}
        </span>
        <span
          style={{
            fontFamily: FONT_UI,
            fontWeight: 700,
            fontSize: 44,
            color: "rgba(255,255,255,0.9)",
            textAlign: "center",
            maxWidth: 800,
            lineHeight: 1.3,
            opacity: Math.min(1, textS),
          }}
        >
          {ctaText}
        </span>
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
              padding: "30px 84px",
              display: "flex",
              alignItems: "center",
              gap: 24,
              boxShadow: `0 0 ${glow}px rgba(255, 0, 51, 0.75), 0 18px 40px rgba(0,0,0,0.5)`,
            }}
          >
            <span
              style={{
                fontFamily: FONT_BLACK,
                fontWeight: 900,
                fontSize: 56,
                letterSpacing: 3,
                color: "#ffffff",
              }}
            >
              SUBSCRIBE
            </span>
            <span style={{ fontSize: 56, transform: `rotate(${bellRotate}deg)`, display: "inline-block" }}>
              🔔
            </span>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ── Main composition ─────────────────────────────────────────────────────────
export const WouldYouRather: React.FC<WouldYouRatherProps> = (props) => {
  const { questions, timerSec, accentColor, hookText, ctaText, channelName } = props;
  const frame = useCurrentFrame();

  const timerFrames = Math.round(timerSec * WYR_FPS);
  const qFrames = wyrQuestionFrames(timerSec);
  const perQuestion = qFrames + WYR_REVEAL_FRAMES;

  // Progress overlay math (global frame → active question + inner progress).
  const inQuestions = frame - WYR_HOOK_FRAMES;
  const questionSpan = questions.length * perQuestion;
  const activeIdx = Math.min(
    questions.length - 1,
    Math.max(0, Math.floor(inQuestions / perQuestion))
  );
  const inner = Math.min(1, Math.max(0, (inQuestions - activeIdx * perQuestion) / perQuestion));
  const showProgress = inQuestions >= 0 && inQuestions < questionSpan;

  return (
    <AbsoluteFill>
      <Background />
      <Series>
        <Series.Sequence durationInFrames={WYR_HOOK_FRAMES}>
          <HookScene hookText={hookText} accentColor={accentColor} questionCount={questions.length} />
        </Series.Sequence>
        {questions.map((q, i) => (
          <Series.Sequence key={`${q.optionA}-${i}`} durationInFrames={perQuestion}>
            <QuestionScene question={q} index={i} timerFrames={timerFrames} accentColor={accentColor} />
          </Series.Sequence>
        ))}
        <Series.Sequence durationInFrames={WYR_CTA_FRAMES}>
          <CtaScene channelName={channelName} ctaText={ctaText} accentColor={accentColor} />
        </Series.Sequence>
      </Series>
      {showProgress ? (
        <ProgressBar
          current={activeIdx + 1}
          total={questions.length}
          segmentProgress={inner}
          accentColor={accentColor}
        />
      ) : null}
    </AbsoluteFill>
  );
};
