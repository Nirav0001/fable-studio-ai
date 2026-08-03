#!/usr/bin/env bash
# Boot both services in one container. API on 4100 (internal), web on $PORT.
set -euo pipefail

export API_PORT=4100
export API_URL=http://localhost:4100

echo "→ Applying database schema (prisma db push)…"
npx prisma db push --schema apps/api/prisma/schema.prisma --skip-generate --accept-data-loss

echo "→ Starting API on :4100…"
( cd apps/api && npx tsx src/index.ts ) &
API_PID=$!

# If the API process dies, bring the whole container down so Railway restarts it.
( wait "$API_PID"; echo "✖ API exited — stopping container"; kill -TERM 0 ) &

echo "→ Starting web on :${PORT:-3100}…"
cd apps/web
exec npx next start -p "${PORT:-3100}"
