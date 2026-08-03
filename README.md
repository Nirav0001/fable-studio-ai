# Fable Studio AI

**The faceless YouTube Shorts studio that runs itself.** Generate, edit, score, schedule and upload AI-made Shorts across multiple channels — Would-You-Rather quizzes, auto-clipped stream highlights, and Top-5 countdown compilations — from one dark, glassy, Linear-grade dashboard.

> OpusClip × VidIQ × CapCut AI × Hootsuite, in one product.

---

## Quick start (zero external services needed)

```bash
npm install
cp .env.example apps/api/.env     # Windows: copy .env.example apps\api\.env
npm run db:push
npm run db:seed
npm run dev
```

Open **http://localhost:3100** → you land in a fully-populated demo workspace
(3 channels, 90 days of analytics, projects, scheduled uploads, question bank).

- Web (Next.js): `http://localhost:3100`
- API (Express): `http://localhost:4100` — health/capability matrix at `/api/v1/health`
- Demo login: `demo@fablestudio.ai` / `fable-demo-2026` (dev auto-login is on by default via `AUTH_DEV_BYPASS`)

**Everything degrades gracefully.** With zero API keys the entire product works using
deterministic mock AI, a mock YouTube uploader, mock billing and an in-memory job queue.
Add real keys and each subsystem switches to the real integration automatically — the
Settings page shows a live capability matrix of what's real vs. mocked.

## Tech stack

| Layer | Tech |
| --- | --- |
| Frontend | Next.js 14 (App Router), React 18, TypeScript, TailwindCSS, shadcn/ui-style kit, Framer Motion, TanStack Query, Recharts, dnd-kit, cmdk |
| Backend | Node.js, Express, TypeScript, Zod validation, JWT session cookies |
| Database | Prisma ORM — SQLite out-of-the-box, PostgreSQL for production (`npm run db:use:postgres` + `docker compose up -d`) |
| Queue | BullMQ + Redis when `REDIS_URL` is set; built-in in-memory driver otherwise |
| AI | OpenAI / Anthropic Claude / Google Gemini (auto-selected from keys) with a deterministic mock provider fallback |
| Video | FFmpeg render pipeline (real 1080×1920 MP4s) + optional Remotion compositions (`apps/video`), Whisper transcription hook, yt-dlp ingest hook |
| Storage | Local `/storage` served at `/files/*`; Cloudflare R2 (S3 API) when keys present |
| Payments | Stripe-ready (checkout, portal, webhook) with mock plan switching in dev |
| Uploads | YouTube Data API v3 OAuth + resumable uploads; mock publisher in dev |

## Monorepo layout

```
apps/
  api/        Express API + Prisma + queue workers + render pipeline
    src/modules/     auth, channels, projects, ai, videos, schedule, analytics,
                     assets, templates, notifications, billing, settings, jobs, automation
    src/services/    ai providers, generators (wyr/seo/viral/thumbs/clips/transcript),
                     media (ffmpeg), youtube, storage (R2/local), stripe
    src/queue/       queue driver (BullMQ ⇄ memory) + generate/render/upload processors
    prisma/          schema + rich demo seed
  web/        Next.js dashboard (dark glass theme)
    src/app/(app)/   dashboard, channels, projects, uploads, schedule, analytics,
                     assets, templates, settings, billing
    src/components/  ui kit, widgets, charts, layout, feature components
  video/      Standalone Remotion project (optional, `cd apps/video && npm i`)
packages/
  shared/     Domain types, constants, pure utils shared by all apps
storage/      uploads / renders / thumbnails (served at /files/*)
```

## The three channel engines

1. **Would You Rather** — a 1000+-combination question engine with a per-user
   uniqueness guarantee (content-hash dedupe in the DB — questions never repeat),
   difficulty/theme/length controls, viral pacing (timer scenes, reveals, CTA),
   full SEO pack, 4 thumbnail variants, viral score, and a real FFmpeg-rendered MP4.
2. **AI Clip Generator** — paste a YouTube/livestream URL → transcription (Whisper
   when keys present, curated mock stream otherwise) → moment detection scored on
   humor/shock/drama/emotion/energy → keeps the top clips (5/10/20) each with hook,
   edit plan (zooms, captions, overlays, SFX) and its own SEO + schedule.
3. **Top 5 Funniest** — same ingestion, ranks the five funniest moments and builds a
   countdown Short (number stingers 5→1, transitions, captions, CTA).

## Feature highlights

- **Overview dashboard** — today's uploads, scheduled, views, subs, revenue estimate,
  CTR, watch time, retention (all with deltas + sparklines), latest/upcoming uploads,
  live processing queue, AI trend discovery panel.
- **Drag-and-drop schedule** — weekly calendar per channel, auto-fill from each
  channel's posting times, AI best-time suggestions, due-slot scanner auto-uploads,
  retry with backoff on failure.
- **Viral score before you render** — 0–100 with a 9-part breakdown (hook, editing,
  pacing, SEO, thumbnail, retention, topic, trending, psychology) + concrete fixes.
- **SEO engine** — 50 ranked titles with CTR reasoning, keyword-rich descriptions,
  tags, hashtags, pinned comment, community post.
- **Automation pilot** — per-channel rules (videos/day, min viral score, auto-approve)
  that generate → score → render → schedule → upload with zero clicks.
- **A/B testing** (thumbnails/titles), **repost-improved** for underperformers,
  **cost estimator** (LLM/TTS/render spend), **API keys + Discord notifications**,
  command palette (⌘K), keyboard-first navigation, skeleton loaders everywhere.

## Environment variables

See `.env.example` (copy to `apps/api/.env`). Everything is optional; the app boots
with none set. Notable:

| Var | Effect when set |
| --- | --- |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` | Real AI generation (first found wins; force with `AI_PROVIDER`) |
| `REDIS_URL` | BullMQ + Redis queue instead of in-memory |
| `YT_CLIENT_ID` + `YT_CLIENT_SECRET` | Real YouTube OAuth + uploads (redirect: `http://localhost:4100/api/v1/oauth/youtube/callback`) |
| `STRIPE_SECRET_KEY` (+ prices) | Real Stripe checkout/portal |
| `R2_*` | Cloudflare R2 storage instead of local disk |
| `ELEVENLABS_API_KEY` | ElevenLabs voiceover provider |
| `DISCORD_WEBHOOK_URL` | Render/upload notifications to Discord |
| `AUTH_DEV_BYPASS=false` | Require real login |

## PostgreSQL (production)

```bash
docker compose up -d            # postgres :5433 + redis :6379
npm run db:use:postgres         # swaps Prisma provider
# set DATABASE_URL=postgresql://fable:fable@localhost:5433/fable_studio in apps/api/.env
npm run db:push && npm run db:seed
```

## Testing

```bash
npm test        # vitest — generator engines: question uniqueness, viral score bounds,
                # SEO pack shape, clip detection, title ranking
```

## API

REST under `/api/v1`, JSON envelope `{ ok, data } | { ok, error }`, session cookie
auth, rate-limited (600/min global, 60/min AI, 30/15min auth). Full route reference
in [CONTRACTS.md](CONTRACTS.md). Highlights:

```
POST /projects                  create + auto-generate (wyr | clips | top5)
POST /projects/:id/render       render pipeline (FFmpeg → /files/renders/*.mp4)
POST /projects/:id/approve      → videos (+ optional auto-schedule)
POST /ai/titles|seo|hooks|viral-score|wyr-questions|thumbnails
GET  /ai/trends                 daily trend discovery
GET  /analytics/overview|heatmap|channels/:id|growth
POST /schedule/auto-fill        fill a week from channel posting times
POST /automation/run/:channelId one-click full pipeline
GET  /health                    live capability matrix
```

## Deployment

- **Railway/Render**: deploy `apps/api` (start: `npm run start -w apps/api`) with
  Postgres + Redis add-ons; deploy `apps/web` to Vercel with `API_URL` env pointing
  at the API. `docker-compose.yml` covers self-hosting the data layer.
- Set `NODE_ENV=production`, a real `JWT_SECRET`, and `AUTH_DEV_BYPASS=false`.
