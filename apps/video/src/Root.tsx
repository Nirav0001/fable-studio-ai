import React from "react";
import { Composition } from "remotion";
import {
  WouldYouRather,
  wouldYouRatherSchema,
  wyrTotalFrames,
  WYR_FPS,
  type WouldYouRatherProps,
} from "./compositions/WouldYouRather";
import {
  ClipShort,
  clipShortSchema,
  clipShortTotalFrames,
  CLIP_FPS,
  type ClipShortProps,
} from "./compositions/ClipShort";
import {
  TopFive,
  topFiveSchema,
  top5TotalFrames,
  TOP5_FPS,
  type TopFiveProps,
} from "./compositions/TopFive";

// ─────────────────────────────────────────────────────────────────────────────
// Fable Studio AI — Remotion root. Three broadcast-quality 1080x1920 @ 30fps
// Shorts compositions. Prop shapes deliberately mirror @fable/shared domain
// types (WyrQuestionT, TranscriptSegment, Clip/ScriptPlan scenes) but are
// inlined via zod schemas in each composition file so this workspace has zero
// cross-package imports and installs standalone.
//
// Durations are derived from props via calculateMetadata, so the API can pass
// any question count / clip length and the timeline resizes automatically.
// ─────────────────────────────────────────────────────────────────────────────

const wyrDefaults: WouldYouRatherProps = {
  channelName: "Brain Battles",
  hookText: "These get IMPOSSIBLE by the end 🤯",
  ctaText: "Follow for daily impossible choices!",
  accentColor: "#8b5cf6",
  timerSec: 5,
  questions: [
    {
      theme: "food",
      difficulty: "easy",
      optionA: "Only eat pizza for a whole year",
      optionB: "Never eat pizza again",
      percentA: 68,
      factoid: "Most people cave on 'never again' within a month.",
    },
    {
      theme: "superpowers",
      difficulty: "medium",
      optionA: "Read minds but can't turn it off",
      optionB: "Fly but only one metre high",
      percentA: 41,
    },
    {
      theme: "money",
      difficulty: "hard",
      optionA: "Take £1,000,000 right now",
      optionB: "Get £10,000 every month for life",
      percentA: 33,
      factoid: "The monthly option overtakes the lump sum after year 9.",
    },
  ],
};

const clipDefaults: ClipShortProps = {
  src: null,
  title: "He did NOT just say that…",
  hookText: "Wait for the ending 💀",
  channelName: "streamgoldclips",
  accentColor: "#a855f7",
  durationSec: 18,
  startFromSec: 0,
  segments: [
    { startSec: 0.4, endSec: 3.2, text: "So chat asked me to try this" },
    { startSec: 3.2, endSec: 6.4, text: "and I said there is no way" },
    { startSec: 6.4, endSec: 9.2, text: "absolutely no way it works" },
    { startSec: 9.2, endSec: 12.4, text: "and then THIS happened" },
    { startSec: 12.4, endSec: 15.2, text: "I still cannot believe it" },
    { startSec: 15.2, endSec: 17.6, text: "clip it and ship it 💀" },
  ],
};

const topFiveDefaults: TopFiveProps = {
  title: "Funniest Stream Fails This Week",
  channelName: "top5chaos",
  accentColor: "#d946ef",
  src: null,
  items: [
    { rank: 5, label: "The chair betrayal", startSec: 12, endSec: 16.5, caption: "The chair had other plans" },
    { rank: 4, label: "Mic left on during rage", startSec: 44, endSec: 49, caption: "He forgot the mic was HOT" },
    { rank: 3, label: "Jumpscare into desk slam", startSec: 71, endSec: 76, caption: "The desk did not survive" },
    { rank: 2, label: "Duo queue disaster", startSec: 103, endSec: 108.5, caption: "His duo watched it ALL happen" },
    { rank: 1, label: "The 1HP victory scream", startSec: 131, endSec: 137, caption: "ONE HP and he SCREAMED" },
  ],
};

export const Root: React.FC = () => {
  return (
    <>
      <Composition
        id="WouldYouRather"
        component={WouldYouRather}
        schema={wouldYouRatherSchema}
        defaultProps={wyrDefaults}
        width={1080}
        height={1920}
        fps={WYR_FPS}
        durationInFrames={wyrTotalFrames(wyrDefaults)}
        calculateMetadata={({ props }) => ({
          durationInFrames: wyrTotalFrames(props),
        })}
      />
      <Composition
        id="ClipShort"
        component={ClipShort}
        schema={clipShortSchema}
        defaultProps={clipDefaults}
        width={1080}
        height={1920}
        fps={CLIP_FPS}
        durationInFrames={clipShortTotalFrames(clipDefaults)}
        calculateMetadata={({ props }) => ({
          durationInFrames: clipShortTotalFrames(props),
        })}
      />
      <Composition
        id="TopFive"
        component={TopFive}
        schema={topFiveSchema}
        defaultProps={topFiveDefaults}
        width={1080}
        height={1920}
        fps={TOP5_FPS}
        durationInFrames={top5TotalFrames(topFiveDefaults)}
        calculateMetadata={({ props }) => ({
          durationInFrames: top5TotalFrames(props),
        })}
      />
    </>
  );
};
