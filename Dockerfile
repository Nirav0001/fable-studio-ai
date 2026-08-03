# Fable Studio AI — single-container production image (Railway-ready).
# Runs the Express API (internal :4100) + Next.js web (public $PORT) together;
# the web app proxies /api/v1 and /files to the API over localhost.
FROM node:20-bookworm-slim

# ── System deps: ffmpeg (render), yt-dlp (ingest), fonts (the WYR look) ──────
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg curl ca-certificates fontconfig \
      fonts-dejavu-core fonts-liberation \
    && curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux \
      -o /usr/local/bin/yt-dlp && chmod a+rx /usr/local/bin/yt-dlp \
    && mkdir -p /usr/share/fonts/truetype/comic-neue \
    && curl -fsSL https://github.com/google/fonts/raw/main/ofl/comicneue/ComicNeue-Bold.ttf \
      -o /usr/share/fonts/truetype/comic-neue/ComicNeue-Bold.ttf \
    && fc-cache -f \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ── Install workspace deps (cached on package.json changes) ─────────────────
COPY package.json package-lock.json* ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN npm install --no-audit --no-fund

# ── App source + build ──────────────────────────────────────────────────────
COPY . .
# Switch Prisma to PostgreSQL, generate the client, and build the web app.
RUN npx tsx apps/api/scripts/use-postgres.ts \
    && npm run db:generate -w apps/api \
    && npm run build -w apps/web

ENV NODE_ENV=production \
    API_PORT=4100 \
    API_URL=http://localhost:4100 \
    YTDLP_PATH=/usr/local/bin/yt-dlp \
    FFMPEG_PATH=ffmpeg

CMD ["bash", "docker-start.sh"]
