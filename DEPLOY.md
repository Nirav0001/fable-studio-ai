# Deploying Fable Studio AI to Railway

Single-container deploy: one Railway service runs the API + web together, backed
by a Railway Postgres database. ~£4/month on the Hobby plan.

## 1. Push the code to GitHub
Railway deploys from a GitHub repo. Secrets are already git-ignored (`.env`,
tokens, `node_modules`, rendered files) — only source ships.

```bash
git add -A
git commit -m "Fable Studio AI — production ready"
gh repo create fable-studio-ai --private --source=. --push
```

## 2. Create the Railway project
1. [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo** → pick `fable-studio-ai`.
2. Railway detects the `Dockerfile` and starts building (ffmpeg + yt-dlp + fonts bake in — first build ~5 min).
3. **+ New** → **Database** → **Add PostgreSQL**.

## 3. Set environment variables
Service → **Variables** → paste from `.env.production.example`. Required:
- `NODE_ENV=production`, `AUTH_DEV_BYPASS=false`
- `JWT_SECRET` — run `openssl rand -hex 32`
- `DATABASE_URL=${{Postgres.DATABASE_URL}}`
- `OPENAI_API_KEY`, `ELEVENLABS_API_KEY`, `YT_CLIENT_ID`, `YT_CLIENT_SECRET`

## 4. Domain + OAuth
1. Service → **Settings** → **Networking** → **Generate Domain**.
2. Set `APP_URL` and `PUBLIC_URL` to that `https://…` domain, then redeploy.
3. Google Cloud console → OAuth client → add redirect URI:
   `https://<your-domain>/api/v1/oauth/youtube/callback`

## 5. Persist rendered files (optional but recommended)
Service → **Volumes** → mount at `/data`, then set `STORAGE_DIR=/data/storage`.
Without this, cached sources/renders reset on each redeploy (uploads still work —
files only need to exist long enough to reach YouTube).

## Notes
- **Multi-user**: registration is open at `/login` → anyone signs up, gets their
  own dashboard, connects their own YouTube. Data is isolated per user.
- **Queue**: single instance uses the in-process queue — no Redis needed. Only
  add `REDIS_URL` if you scale to multiple instances.
- **Automation runs 24/7** here — no dependency on your PC being on.
- Google OAuth app must be **Published** (not Testing) for other users' tokens
  to survive past 7 days.
