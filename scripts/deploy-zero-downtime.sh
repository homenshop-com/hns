#!/bin/bash
# Zero-downtime deploy for homenshop-next on 167.71.199.28.
#
# Requirements (one-time setup):
#   pm2 delete homenshop-next 2>/dev/null || true
#   pm2 start ecosystem.config.cjs
#   pm2 save
#
# Then every deploy is just:
#   bash scripts/deploy-zero-downtime.sh
#
# How it works:
#   1. `next build` writes the new .next/ in place — old processes keep
#      serving from their warmed-up module cache (v8 holds the code in
#      RAM, not re-reading disk for each request).
#   2. `pm2 reload` restarts workers ONE AT A TIME:
#        · worker A dies, worker B serves all traffic
#        · worker A starts fresh, binds to port 3000 via cluster, loads
#          new .next/ into its module cache, becomes live
#        · worker B dies, worker A serves all traffic (fully warm now)
#        · worker B starts fresh → both workers on the new build
#   3. In the window where one worker is mid-restart, the other handles
#      every request. No 502 Bad Gateway.
#
# Worst case: nginx's proxy_next_upstream can be configured to try the
# next upstream on error, but since both workers share the same port
# via Node's cluster, we don't need that.

set -euo pipefail

cd "$(dirname "$0")/.."

BLUE="\033[34m"
GREEN="\033[32m"
YELLOW="\033[33m"
RED="\033[31m"
RESET="\033[0m"

echo -e "${BLUE}[deploy]${RESET} $(date -Iseconds) starting zero-downtime deploy"

# 1. Pull latest code (optional — comment out if deploying from local scp)
if [ -d .git ]; then
  echo -e "${BLUE}[deploy]${RESET} git pull…"
  git pull --rebase --autostash
fi

# 2. Install deps (only changes if package-lock changed)
echo -e "${BLUE}[deploy]${RESET} npm install (idempotent if no changes)…"
npm install --no-audit --no-fund --prefer-offline

# 3. Prisma client regenerate if schema changed
if git diff --name-only HEAD@{1} HEAD 2>/dev/null | grep -q "prisma/schema.prisma"; then
  echo -e "${YELLOW}[deploy]${RESET} Prisma schema changed — regenerating client"
  npx prisma generate
fi

# 4. Build — writes into .next/ in place. Duration ~60–120s. During
#    this window, the running workers continue to serve from their
#    v8 module cache unaffected.
echo -e "${BLUE}[deploy]${RESET} next build…"
BUILD_START=$(date +%s)
if ! npm run build; then
  echo -e "${RED}[deploy]${RESET} Build failed — no workers restarted. Aborting."
  exit 1
fi
BUILD_END=$(date +%s)
echo -e "${GREEN}[deploy]${RESET} Build OK in $((BUILD_END - BUILD_START))s"

# 5. Rolling reload — pm2 cluster mode restarts workers one at a time.
#    `--update-env` picks up any new env vars from .env.local.
echo -e "${BLUE}[deploy]${RESET} pm2 reload (rolling, zero-downtime)…"
pm2 reload homenshop-next --update-env

# 6. Health check — wait for at least one worker to respond 200 on / and
#    confirm before exiting.
echo -e "${BLUE}[deploy]${RESET} waiting for workers to become healthy…"
for i in $(seq 1 30); do
  if curl -s -o /dev/null -w '%{http_code}' -m 3 http://127.0.0.1:3000/ 2>/dev/null | grep -qE '^(200|307|308)$'; then
    echo -e "${GREEN}[deploy]${RESET} healthy — request returned after ${i}s"
    break
  fi
  sleep 1
  if [ "$i" -eq 30 ]; then
    echo -e "${RED}[deploy]${RESET} Workers not responding after 30s — check 'pm2 logs'"
    pm2 status
    exit 1
  fi
done

# 7. Final status
pm2 status
echo -e "${GREEN}[deploy]${RESET} $(date -Iseconds) done."
