# Fable Studio AI — Build Contract (internal)

Binding contract for all module builders. Read this fully, plus:
- `packages/shared/src/types.ts`, `constants.ts`, `utils.ts` (shared domain — import from `@fable/shared`)
- `apps/api/prisma/schema.prisma` (DB — all `*Json` columns are serialized JSON strings)
- `apps/api/src/app.ts` (router registry — implement exactly the routers it imports)
- `apps/web/src/lib/api.ts`, `utils.ts`, `app/(app)/layout.tsx`, `components/layout/*` (web spine)

## Non-negotiable rules
1. **No new dependencies.** Use only what's already in the relevant package.json.
2. **TypeScript strict.** No `any` unless unavoidable; API uses CommonJS-style TS (no import extensions), web uses Next.js App Router conventions.
3. **API responses**: always `ok(res, data)` from `src/lib/respond.ts` → `{ ok: true, data }`. Errors: `throw` helpers from `src/lib/errors.ts`; async handlers wrapped with `handler(fn)`.
4. **Ownership boundaries**: write ONLY the files in your manifest. Never edit spine files.
5. **JSON columns**: parse with `safeJson(raw, fallback)` from `@fable/shared`; stringify on write.
6. **Auth**: `req.user!` is set by `requireAuth` (already mounted before all module routers except auth/oauth). Always scope queries by ownership (`channel.userId === req.user.id` etc.).
7. **Mock-first**: every external integration (AI, YouTube, Stripe, R2, ElevenLabs) MUST work with zero API keys via a deterministic fallback. Check env keys from `src/config/env.ts`. Never use `Math.random()` for mock data — use `seededRandom(fnv1a(someStableId))` from `@fable/shared` so data is stable across refreshes.
8. **Dates**: never mock "now" — use real `new Date()` in the API (allowed there), compute relative dates from it.
9. **Web data fetching**: react-query `useQuery({ queryKey, queryFn: () => api.get<T>("/path") })`. Mutations invalidate affected keys. Poll with `refetchInterval` where live progress matters (jobs: 2000ms, projects while generating: 2000ms).
10. **Visual language**: dark glass. Cards = `<div className="glass rounded-2xl p-5">` or `Card` component. Page headers via `PageHeader`. Framer-motion entrance: `initial={{opacity:0,y:12}} animate={{opacity:1,y:0}}`, stagger lists with 0.04s delay steps. Skeletons while loading (`Skeleton` component). Empty states via `EmptyState`. Toasts via `sonner` `toast.success/error`.
11. **Money is GBP** — format with `formatGbp` from shared.

## Ports & URLs
- web http://localhost:3100 (Next proxies `/api/v1/*` and `/files/*` to the API)
- api http://localhost:4100
- Rendered/uploaded files live under repo `/storage`, served at `/files/<subdir>/<name>` (e.g. `/files/renders/x.mp4`). API code writes into `env.storageDir` subfolders `uploads/`, `renders/`, `thumbnails/`.

## API route contract (all under /api/v1, envelope `{ok,data}`)

### auth (`modules/auth/auth.routes.ts`) — mounted WITHOUT requireAuth
- POST `/auth/register` {email,password,name} → {user} + sets cookie
- POST `/auth/login` {email,password} → {user} + sets `fable_session` httpOnly cookie (use `signSession`, `SESSION_COOKIE` from middleware/auth)
- POST `/auth/logout` → {}
- GET `/auth/me` → {user} (requireAuth inside this route file for just this route)

### oauth (`modules/channels/oauth.routes.ts`) — no requireAuth (Google redirects here)
- GET `/oauth/youtube/callback?code&state` → exchanges code (if env.ytClientId) else mock; marks channel connected; redirect 302 to `${env.appUrl}/channels?connected=1`

### channels (`modules/channels/channels.routes.ts`)
- GET `/channels` → ChannelSummary[] (viewsToday from latest AnalyticsSnapshot, videosReady = count status=ready)
- POST `/channels` {name,handle,type,description?} → channel (seed default branding/schedule/uploadDefaults JSON from shared DEFAULT_WEEKLY_SCHEDULE etc.)
- GET `/channels/:id` → full channel: parsed branding/uploadDefaults/schedule/prompts + recentVideos (5) + nextSlots (5) + automation rule
- PATCH `/channels/:id` {name?,description?,avatarColor?,branding?,uploadDefaults?,schedule?,prompts?} (objects re-stringified)
- DELETE `/channels/:id`
- POST `/channels/:id/connect` → {authUrl} — real Google OAuth consent URL when env keys set (scope youtube.upload + youtube + yt-analytics.readonly, redirect `${env.apiUrl}/api/v1/oauth/youtube/callback`, state=channelId); else mock: set connected=true, youtubeJson={mock:true}, return {authUrl:null, connected:true}
- POST `/channels/:id/disconnect` → {connected:false}

### projects (`modules/projects/projects.routes.ts`)
- GET `/projects?channelId=&status=&type=` → list w/ channelName, viralScore total, clip count
- POST `/projects` {channelId, type: "wyr"|"clips"|"top5", title?, config: WyrConfig|ClipsConfig|Top5Config, sourceUrl?} → creates status="generating", enqueues PROJECT_GENERATE → returns project
- GET `/projects/:id` → parsed: config, script (ScriptPlan), seo (SeoPack), thumbnails (ThumbnailVariant[]), viral (ViralScore), cost (CostEstimate), transcript, clips[], videos[]
- PATCH `/projects/:id` {title?, seo?, script?} — only when not generating/rendering
- POST `/projects/:id/generate` → re-enqueue generation (status→generating, progress 0)
- POST `/projects/:id/render` → status→rendering, enqueue PROJECT_RENDER
- POST `/projects/:id/approve` {schedule?: boolean} → creates Video row(s) (one for wyr/top5; one per kept clip for clips) status "ready", copies seo+viral score; if schedule=true auto-fills next free slots from channel weekly schedule; project status→ready
- DELETE `/projects/:id`
- PATCH `/projects/:id/clips/:clipId` {status: kept|discarded} → toggle clip keep

### ai (`modules/ai/ai.routes.ts`) — use aiLimiter from middleware/rateLimit on all
- POST `/ai/titles` {topic, count?=10, channelType?} → TitleIdea[] ranked desc by score
- POST `/ai/seo` {title, context?, channelType?} → SeoPack
- POST `/ai/hooks` {topic, count?=8} → {hooks: string[]}
- POST `/ai/viral-score` {title, description?, channelType?, durationSec?} → ViralScore
- POST `/ai/wyr-questions` {channelId, theme, difficulty, count} → WyrQuestionT[] (persisted to WyrQuestion table w/ unique hash — NEVER return a pair whose hash already exists for this user's channels; generate more until count met)
- POST `/ai/thumbnails` {title, channelType?, count?=4} → ThumbnailVariant[]
- GET `/ai/trends` → TrendItem[] (8-12 items; AI when key present else curated+seeded rotation by week number)

### videos (`modules/videos/videos.routes.ts`)
- GET `/videos?channelId=&status=` → VideoSummary[] (views = sum of VideoStat.views)
- GET `/videos/:id` → full: parsed tags/hashtags, stats series, latest retention curve, abTests, channelName, project link
- PATCH `/videos/:id` {title?,description?,tags?,hashtags?,visibility?,status?}
- POST `/videos/:id/upload` → validates has filePath or mock; creates/updates ScheduleSlot? No — direct: enqueue VIDEO_UPLOAD now (status→uploading)
- DELETE `/videos/:id` (if published & channel truly connected, attempt YouTube delete; always delete row)
- POST `/videos/:id/abtest` {kind:"thumbnail"|"title", variants: string[]} → AbTest (status running); mock decider picks winner after creation using seeded rand + writes winnerIdx when GET later (decide if createdAt older than 60s — gives live feel)
- POST `/videos/:id/repost` → duplicates video as draft with AI-improved title/description (via ai service), links same file, viralScore recomputed → returns new video

### schedule (`modules/schedule/schedule.routes.ts`)
- GET `/schedule?from=ISO&to=ISO&channelId?` → UpcomingSlot[] (include video summary + channelName)
- POST `/schedule` {channelId, videoId?, scheduledAt} → slot (videoId optional = empty slot); if videoId given set video.status="scheduled"
- PATCH `/schedule/:id` {scheduledAt?, status?, videoId?} — drag-drop reschedule
- DELETE `/schedule/:id` → frees video back to ready
- GET `/schedule/suggestions?channelId` → {bestTimes: {day,hour,score}[] } top 5 from heatmap data
- POST `/schedule/auto-fill` {channelId, days?=7} → fills channel weekly schedule times with ready videos → {created: n}

### analytics (`modules/analytics/analytics.routes.ts`)
- GET `/analytics/overview` → AnalyticsOverviewT (today = latest snapshot day totals across channels; deltas vs previous day; sparklines = last 14 days arrays for views/subs/revenue/ctr; latestUploads 6; upcomingUploads 6; processingQueue = active+queued JobRecords 8; channels = ChannelSummary[])
- GET `/analytics/channels/:id?days=28` → {series: {date,views,watchMinutes,subsGained,revenueGbp,ctr,retention}[], totals, bestVideos: VideoSummary&{views}[] 5, worstVideos 5}
- GET `/analytics/heatmap?channelId?` → HeatmapCell[] (7×24, deterministic from snapshots+seed)
- GET `/analytics/growth?days=90` → {series: {date, subscribers, views}[] } cumulative across channels

### assets (`modules/assets/assets.routes.ts`)
- GET `/assets?kind=` → Asset[] (parsed meta, url = `/files/uploads/<filename>` or stored url)
- POST `/assets` multipart (multer single "file", field "kind", "name") → saves to `env.storageDir/uploads`, records Asset → asset. Limit 200MB. Sanitize filename.
- PATCH `/assets/:id` {name?}
- DELETE `/assets/:id` (unlink file best-effort)

### templates (`modules/templates/templates.routes.ts`) — plain CRUD, config is free-form object
### notifications (`modules/notifications/notifications.routes.ts`)
- GET `/notifications` → latest 50; POST `/notifications/read-all`; PATCH `/notifications/:id` {read}
- ALSO export from `modules/notifications/notify.ts`: `notify(userId, kind, title, body?)` → creates row + fires Discord webhook if env.discordWebhookUrl (fire-and-forget) — processors import this.

### billing (`modules/billing/billing.routes.ts`)
- GET `/billing` → {plan: PlanTier, planStatus, renewsAt, usage: {videosThisMonth, aiTokensK, channels, storageMb}, costEstimate: CostEstimate (this month, from COST_RATES × usage), invoices: mock last 3 if no stripe, plans: PLANS}
- POST `/billing/checkout` {plan} → {url} — Stripe checkout session when key set, else mock: directly set user.plan → {url:null, upgraded:true}
- POST `/billing/portal` → {url} or {url:null}
- POST `/webhooks/stripe` — raw body verify + handle subscription events (already body-mounted raw in app.ts; mounted path is /api/v1/webhooks/stripe — expose this router at `/billing` for the rest, and export a separate `stripeWebhookHandler` used… **simpler**: billing.routes also registers nothing for webhook; instead handle inside billing.routes with `router.post("/webhook")`? NO — final: app.ts mounts `/webhooks/stripe` raw parser only; add to billing.routes: `router.post("/../webhooks/stripe")` is invalid. → The billing module ALSO exports `webhookRouter` mounted… it is NOT mounted in app.ts, so instead: billing.routes.ts default router includes POST `/stripe-webhook` (json body, mock-verify) — good enough for dev; document real path in README.

### settings (`modules/settings/settings.routes.ts`)
- GET `/settings` → {user: {name,email,plan}, preferences (parsed), apiKeys: [{id,name,prefix,lastUsedAt,createdAt}], integrations: HealthReport-ish flags}
- PATCH `/settings` {name?, preferences?}
- POST `/settings/api-keys` {name} → {key: "fable_sk_..."} full key returned ONCE (store hash via bcryptjs, prefix first 12 chars)
- DELETE `/settings/api-keys/:id`

### jobs (`modules/jobs/jobs.routes.ts`)
- GET `/jobs/active` → JobSummary[] (status queued|active, latest 12)
- GET `/jobs/recent` → JobSummary[] (latest 25 any status)

### automation (`modules/automation/automation.routes.ts`)
- GET `/automation` → per-channel rules [{channelId, channelName, enabled, config, lastRunAt}]
- PATCH `/automation/:channelId` {enabled?, config?} (upsert)
- POST `/automation/run/:channelId` → runs one automation cycle NOW: creates a project from rule config, enqueues generation, returns {projectId}

## Queue contract (`src/queue/queue.ts` + `src/queue/workers.ts`)
- `queue.ts` exports:
  - `enqueue(jobName: string, payload: Record<string, unknown>): Promise<string>` (returns JobRecord id). Creates JobRecord (queue="fable", name=jobName, refType/refId derived from payload projectId/videoId/channelId), then dispatches to BullMQ when env.redisUrl reachable else in-memory setImmediate driver.
  - `getQueueDriverName(): "bullmq" | "memory"`
  - `updateJob(id, {status?, progress?, message?, log?})` — appends log line to logsJson.
- `workers.ts` exports `startWorkers(): Promise<void>` — registers processors for QUEUE_JOBS.* names (BullMQ Worker when redis, else the memory driver calls processors directly). Also starts two intervals: every 60s scan due ScheduleSlots (scheduledAt <= now, status scheduled) → enqueue VIDEO_UPLOAD; every 5min automation tick for enabled rules (respect config.videosPerDay vs today's project count).
- Processors in `src/queue/processors/{generate,render,upload}.ts`:
  - **generate.ts** `processGenerate({projectId, jobId})`: loads project+channel, stage/progress updates as it goes (10 "Analyzing source", 25 "Writing script", 45 "Generating SEO", 60 "Scoring virality", 75 "Designing thumbnails", 90 "Estimating cost", 100 done → status "review"). wyr: pull N unique questions (generator service), build ScriptPlan (hook scene → per-question: question scene (timer 5s per config pacing) + reveal scene → CTA scene, fit lengthSec); clips/top5: get transcript (real yt-dlp+whisper when available else mockTranscript(sourceUrl)), detect+score moments, create Clip rows (clips: config.clipCount candidates, keep those >= minScore as "kept"; top5: exactly 5 "kept" ranked), build ScriptPlan for top5 countdown. All types: SeoPack, ThumbnailVariant[4], ViralScore, CostEstimate persisted. Failure → status failed + error + notify.
  - **render.ts** `processRender({projectId, jobId})`: for wyr/top5 renders one video; for clips renders each kept clip (progress across them). Try ffmpeg pipeline (`services/media/ffmpeg.ts`) → real mp4 in storage/renders + thumbnail png in storage/thumbnails; if ffmpeg missing → simulated: still create Video rows with filePath null, thumbnailPath null after 2s delay. On success project status→ready, create Video rows status "ready" (title from seo/clip), viralScore copied, durationSec set, notify user "Render complete".
  - **upload.ts** `processUpload({videoId, slotId?, jobId})`: if channel truly connected (youtubeJson has tokens & env keys) → real resumable upload via services/youtube; else mock: 1.5s wait, set youtubeId `mock-<id>`, status published, publishedAt now, slot uploaded, create first VideoStat row (seeded), notify. Retry logic: on failure attempts+1, if attempts<3 re-enqueue with delay, else slot failed + notify.

## Services contract
- `services/ai/index.ts` exports `aiComplete(opts: {system?: string; prompt: string; json?: boolean; maxTokens?: number}): Promise<string>` — routes to openai/anthropic/gemini via fetch based on resolveAiProvider(); "mock" throws MockRequested → callers catch OR callers check `isMockAi()` export first. Rule: every generator implements `if (isMockAi()) return deterministicResult else try AI, catch → fall back to deterministic`. Track rough token usage: export `addUsage(tokens: number)` accumulating in a module-level counter + `getUsage()` (billing reads it).
- `services/generators/wyr.ts`: `generateWyrQuestions(userId, channelId, theme, difficulty, count)` — bank of 200+ handcrafted-quality pairs across all 13 themes × difficulties, expanded combinatorially with modifier templates ("…but only on weekends", "…for the rest of your life") to 1000+ possibilities; hash-dedupe against DB (wyrHash), persist chosen, mark usedAt when project consumes. AI mode: prompt LLM for fresh pairs, still hash-deduped.
- `services/generators/seo.ts` (SeoPack + TitleIdea[] + hooks), `viral.ts` (ViralScore with weighted breakdown + 3-5 concrete suggestions), `thumbs.ts` (ThumbnailVariant[]), `clipDetect.ts` (score TranscriptSegments → moments w/ ScoreBreakdown; top5 picks funniest 5), `transcript.ts` (`getTranscript(sourceUrl)` → real yt-dlp+whisper if binaries+key present else 40+ segment curated mock stream transcript w/ laughter/shock markers — deterministic per URL via seed), `cost.ts` (CostEstimate from counts × COST_RATES).

### Pinned generator signatures (FINAL AUTHORITY — the queue processors already import these exact names from these exact files)
- `wyr.ts` exports: `generateWyrQuestions(userId: string, channelId: string, theme: string, difficulty: string, count: number): Promise<WyrQuestionT[]>` (returned items include DB `id`), `markQuestionsUsed(ids: string[], projectId: string): Promise<void>`, and RE-EXPORTS `buildWyrScript` from script.ts.
- `seo.ts` exports: `generateSeoPack(opts: {title: string; context?: string; channelType?: string}): Promise<SeoPack>`, `generateTitleIdeas(topic: string, count: number, channelType?: string): Promise<TitleIdea[]>`, `generateHooks(topic: string, count?: number): Promise<string[]>`.
- `viral.ts` exports: `scoreVirality(opts: {title: string; description?: string; channelType?: string; durationSec?: number; sceneCount?: number; avgSceneSec?: number; hasThumbnail?: boolean}): Promise<ViralScore>`.
- `thumbs.ts` exports: `generateThumbnailVariants(opts: {title: string; channelType?: string; count?: number}): Promise<ThumbnailVariant[]>`.
- `transcript.ts` exports: `getTranscript(sourceUrl: string): Promise<TranscriptSegment[]>`.
- `clipDetect.ts` exports: `detectMoments(segments: TranscriptSegment[], opts: {count: number; minScore: number})` and `pickTop5Funniest(segments: TranscriptSegment[])` — moments are `{title, hook, startSec, endSec, score, breakdown: ScoreBreakdown, transcript}` — and RE-EXPORTS `buildTop5Script(moments, config)` + `buildClipEditPlan(moment, config)` from script.ts.
- `cost.ts` exports: `estimateCost(opts: {llmTokens: number; ttsChars: number; renderMinutes: number}): CostEstimate`.
- Builders implementing these must Read `apps/api/src/queue/processors/generate.ts` and `render.ts` (already written) and match their call sites exactly.
- `services/media/ffmpeg.ts`: `renderWyrVideo(project, script, outPath)`, `renderClipVideo(...)`, `renderTop5Video(...)`, plus `renderThumbnail(variant, outPath)` — build 1080×1920 mp4s via child_process spawn of env.ffmpegPath using lavfi color/gradient sources + drawtext (Windows font path `C\\:/Windows/Fonts/arialbd.ttf` — escape properly), question text A/B blocks, timer bar via drawbox enable expressions, ~30fps, h264 yuv420p, faststart, silent or sine-beat audio via lavfi `anoisesrc`/`sine`. Keep each render < 30s wall time (preset ultrafast). Export `hasFfmpegSync` wrapper reusing lib/capabilities. Thumbnails: single-frame drawtext PNG 1280×720.
- `services/youtube/index.ts`: `getAuthUrl(channelId)`, `exchangeCode(code)`, `refreshToken`, `uploadVideo(channel, video)` (resumable upload API via fetch), `deleteVideo`, `syncAnalytics(channel)` — all no-op/mock-safe without keys.
- `services/storage/index.ts`: `saveFile(subdir, filename, buffer|path)` → local always; if R2 keys present also put to R2 and return public URL. `publicUrl(subdir, filename)` → `/files/...` or R2 URL.
- `services/stripe/index.ts`: lazy Stripe client when key; `createCheckout(user, plan)`, `createPortal(user)`, mock variants.

## Web page manifests (all pages "use client" where they fetch; each page dir may add local `components/` folder or use `src/components/features/<area>/`)
Pages must feel ALIVE: entrance animations, skeleton loading, empty states, toasts on every mutation.
- `/dashboard` — stat card grid (Today's uploads, Scheduled, Views today, Subs gained, Revenue est, CTR, Avg watch time, Retention — each w/ delta + sparkline), Latest uploads strip (thumbnail cards w/ status+score), Upcoming uploads list, Processing queue (live, 2s poll, progress bars), Channels overview row, Trends panel (GET /ai/trends).
- `/analytics` — channel selector tabs + range picker (7/28/90), area chart views+watch time, growth chart, CTR/retention line, posting heatmap (7×24 grid), best/worst videos tables, best-time-to-post card (schedule/suggestions).
- `/channels` — grid of channel cards (avatar gradient, type badge, subs, views today, connect status + Connect button → POST connect (opens authUrl if returned), New Channel dialog (3-step: type picker w/ big cards, name/handle, branding colors). `/channels/[id]` — tabs: Overview (mini analytics, recent videos), Branding (colors, fonts, voice preset picker, CTA text, watermark), Schedule (weekly time grid editor), Prompts (per-channel AI prompt overrides textarea), Upload defaults (visibility/category/language selects), Automation (enable switch, videos/day slider, min viral score slider, auto-approve switch).
- `/projects` — filter bar (channel, type, status) + project cards (type emoji, status badge, progress bar when generating (2s poll), viral score dial, clip count) + "New Project" button → `/projects/new` wizard: step 1 pick channel (cards), step 2 type-specific config form (wyr: theme grid, difficulty segmented, length segmented, question count slider; clips: URL input + clip count + min score; top5: URL input), step 3 review + Generate CTA. `/projects/[id]` — header w/ status + progress stages, tabs: Script (scene timeline list w/ per-scene effects chips; wyr shows questions w/ A/B + % + editable), Clips (for clips/top5: sortable score list, keep/discard toggles, transcript preview), SEO (editable title/desc/tags/hashtags chips, pinned comment, community post, copy buttons), Thumbnails (4 variant cards w/ predicted CTR, gradient previews rendered as CSS), Viral Score (radial total + 9-bar breakdown + suggestions list), Cost (estimate table). Action bar: Generate again / Render / Approve (+ auto-schedule switch) / Delete.
- `/uploads` — table/grid of all videos w/ status filter chips, viral score, channel, duration, views (published), row actions: Upload now, Schedule (dialog picks slot), Edit SEO (dialog), A/B test (dialog), Repost improved, Delete. Live status polling while any uploading.
- `/schedule` — week calendar (7 day columns × hour rows 6:00-22:00), colored slot chips per channel, drag-drop (dnd-kit) to reschedule (PATCH), click empty cell → dialog to schedule a ready video, channel filter, Auto-fill week button, legend, suggested best times highlighted (from suggestions endpoint).
- `/assets` — kind filter tabs (music/gif/logo/font/voiceover/video/sfx/thumbnail), upload dropzone (drag+click, apiUpload), asset cards w/ kind icon, size, duration, preview for images/audio (native <audio>), rename inline, delete.
- `/templates` — template gallery grouped by kind, built-in badge, create/edit dialog (name, kind, accent color, JSON-free simple fields), apply hint.
- `/settings` — sections: Profile (name), Integrations (capability matrix from /health w/ green/amber dots + how-to-enable hints), API keys (create → show-once key modal, list, revoke), Notifications prefs (switches saved to preferences), Danger zone.
- `/billing` — current plan card w/ usage meters (videos, AI credits, channels, storage), cost estimator card (this month breakdown), plan comparison table w/ Upgrade buttons (POST checkout; if url → window.location, else toast success + refetch), invoice list.

## UI kit contract (`src/components/ui/*` — shadcn-style, exact filenames)
button, card, badge, input, textarea, label, select, dialog, dropdown-menu, tabs, tooltip, skeleton, progress, switch, slider, separator, scroll-area, avatar, popover, checkbox — standard shadcn API (Radix primitives + cva variants). Plus widgets in `src/components/widgets/`:
- `stat-card.tsx` StatCard {label, value, delta?, icon?: LucideIcon, spark?: number[], hint?}
- `score-dial.tsx` ScoreDial {score, size?} — SVG radial, gradient stroke, animated
- `status-badge.tsx` StatusBadge {status} — uses STATUS_COLORS
- `empty-state.tsx` EmptyState {icon, title, body?, action?: ReactNode}
- `page-header.tsx` PageHeader {title, description?, actions?: ReactNode}
- `progress-stages.tsx` ProgressStages {stage, progress} — animated pipeline stage indicator
- `channel-chip.tsx` ChannelChip {name, color, type}
And charts in `src/components/charts/`: `area-card.tsx` AreaCard {title, data: {x: string, y: number}[], color?, valueFormatter?}, `multi-line.tsx`, `heatmap.tsx` Heatmap {cells: HeatmapCell[]} (CSS grid, violet intensity scale), `retention-curve.tsx` RetentionCurve {points: {pct: number, value: number}[]}, `sparkline.tsx` Sparkline {data: number[], color?} (tiny recharts area, no axes).

## Seed contract (`apps/api/prisma/seed.ts`)
Demo user (DEMO_USER from shared, bcrypt hash), 3 channels (wyr "Brain Battles" @brainbattles violet, clips "StreamGoldClips" @streamgold purple, top5 "Top5Chaos" @top5chaos fuchsia) each with branding/schedule/upload defaults, subscriberCount 12k-260k; 90 days AnalyticsSnapshot per channel (seeded growth curves w/ weekend bumps + occasional viral spikes); ~18 published Videos across channels w/ realistic titles + VideoStat series + retention curves; 6 ready videos; 4 projects in various statuses (one wyr in "review" with full script/seo/thumbs/viral populated via the actual generator services — import and call them; one clips project "ready" with 8 clips scored; one top5 "review"; one generating stuck at draft? no — statuses: review/ready only), schedule slots next 7 days part-filled; 300 WyrQuestions pre-banked (call generator bank), assets (6 music/sfx/gif/logo placeholder files — write tiny real files: 1-2s silent wav via ffmpeg if available else .txt placeholder w/ kind meta, a few SVG logos written as files), 8 built-in templates, notifications (5), one automation rule enabled on wyr channel, JobRecords history (10 completed). Idempotent: upsert by unique keys / deleteMany first. Log summary counts.
