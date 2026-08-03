# @fable/video — Remotion compositions

Broadcast-quality 1080x1920 @ 30fps Shorts compositions for Fable Studio AI.
This is a **standalone workspace** — it is deliberately *not* part of the npm
workspaces in the repo root, has zero imports from `@fable/shared`, and is
entirely optional. When installed, the render pipeline can use these
compositions instead of the raw ffmpeg fallback in
`apps/api/src/services/media/ffmpeg.ts`.

## Install (optional)

```bash
cd apps/video
npm install
```

Nothing else in the monorepo depends on this install. If it is missing, the
API silently keeps using its ffmpeg pipeline.

## Preview in Remotion Studio

```bash
cd apps/video
npm run dev          # opens Remotion Studio with all three compositions
```

## Compositions

| ID              | Format                        | Duration                                                        |
| --------------- | ----------------------------- | --------------------------------------------------------------- |
| `WouldYouRather`| A/B question countdown Shorts | `66 + N × (24 + timerSec×30 + 84) + 96` frames (from props)     |
| `ClipShort`     | Captioned clip w/ punch zooms | `durationSec × 30` frames                                       |
| `TopFive`       | Ranked countdown compilation  | `72 + Σ(42 + clipLen×30) + 90` frames                           |

Durations are computed from props via `calculateMetadata`, so passing more
questions or longer clips resizes the timeline automatically — no CLI flags
needed.

All prop shapes **mirror the domain types in `packages/shared/src/types.ts`**
(`WyrQuestionT`, `TranscriptSegment`, `Clip`/`ScriptPlan` scenes) but are
re-declared inline as zod schemas inside each composition file so this
workspace installs without any cross-package wiring. If the shared types
change shape, update the schemas in `src/compositions/*.tsx` to match.

Every animation is deterministic: particle fields, emoji bursts and caption
timing derive from index math and frame counters (never `Math.random`), so a
given props payload always renders the identical video.

## Render from the CLI

```bash
cd apps/video

# Would You Rather — inline props
npx remotion render WouldYouRather out/wyr.mp4 --props='{"channelName":"Brain Battles","hookText":"These get IMPOSSIBLE by the end","ctaText":"Follow for daily impossible choices!","accentColor":"#8b5cf6","timerSec":5,"questions":[{"theme":"food","difficulty":"easy","optionA":"Only eat pizza for a year","optionB":"Never eat pizza again","percentA":68}]}'

# Clip Short — props from a file (recommended; what the API does)
npx remotion render ClipShort out/clip.mp4 --props=./props/clip-cml9x2.json

# Top5 — with a real source video
npx remotion render TopFive out/top5.mp4 --props='{"title":"Funniest Stream Fails This Week","channelName":"top5chaos","accentColor":"#d946ef","src":"C:/path/to/source.mp4","items":[{"rank":5,"label":"The chair betrayal","startSec":12,"endSec":16.5},{"rank":4,"label":"Mic left on","startSec":44,"endSec":49},{"rank":3,"label":"Jumpscare","startSec":71,"endSec":76},{"rank":2,"label":"Duo disaster","startSec":103,"endSec":108.5},{"rank":1,"label":"1HP victory scream","startSec":131,"endSec":137}]}'
```

On Windows PowerShell, prefer `--props=./file.json` over inline JSON to avoid
quoting issues. Output codec/pixel format (h264 / yuv420p, JPEG frames) is
pinned in `remotion.config.ts` to match the ffmpeg fallback's output contract.

## How the API pipeline calls this

`apps/api`'s render processor (`src/queue/processors/render.ts`) treats this
workspace as an optional upgrade path:

1. **Capability check** — Remotion is considered available when
   `apps/video/node_modules/.bin/remotion` exists (i.e. someone ran
   `npm install` here). Otherwise the processor uses its ffmpeg/simulated
   pipeline and nothing here is touched.
2. **Props mapping** — the API maps its DB/domain data onto the composition
   props:
   - *wyr project* → `ScriptPlan` question/reveal scenes + `WyrQuestionT[]`
     → `WouldYouRather` props (`questions`, `timerSec` from config pacing,
     branding colors → `accentColor`, CTA text from channel branding).
   - *clips project* → kept `Clip` row + its transcript segments (times
     rebased to the clip start) → `ClipShort` props.
   - *top5 project* → the 5 kept clips ranked → `TopFive` items.
3. **Invoke** — the API writes the props to a temp JSON file and spawns, with
   `cwd` set to `apps/video`:

   ```
   npx remotion render <CompositionId> <repo>/storage/renders/<id>.mp4 --props=<tmp>/props-<id>.json
   ```

4. **Result** — the MP4 lands in `storage/renders/` and is served at
   `/files/renders/<name>.mp4`, exactly like ffmpeg output. Thumbnails still
   come from the API's thumbnail renderer.

## Scripts

| Script              | What it does                          |
| ------------------- | ------------------------------------- |
| `npm run dev`       | Remotion Studio (interactive preview) |
| `npm run render`    | `remotion render` passthrough         |
| `npm run compositions` | List composition IDs               |
| `npm run typecheck` | `tsc --noEmit` (strict)               |
