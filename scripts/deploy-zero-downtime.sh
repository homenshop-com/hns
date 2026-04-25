#!/bin/bash
# Blue-green-style deploy for homenshop-next on 167.71.199.28.
#
# Why the rewrite (2026-04-24):
#   The previous version ran `next build` directly into .next/, which
#   mid-rewrites client reference manifests for 60–120s. Any request
#   that hit a page whose manifest was being written during that window
#   got an InvariantError 500 — exactly what surfaced on /admin/orders.
#
# How this one works:
#   1. `NEXT_DIST_DIR=.next-staging next build` writes the new build
#      into a sibling directory. Running workers keep reading .next/
#      the whole time — no mid-build races on manifests.
#   2. On build success, atomic swap:
#        rm -rf .next-prev     (from the previous deploy, if any)
#        mv .next .next-prev   (current → prev, one rename syscall)
#        mv .next-staging .next (new → current, one rename syscall)
#      Two rename()s on the same filesystem = ~ms. Any request during
#      this sliver sees either the old .next/ or the new one, never
#      partial state.
#   3. `pm2 reload homenshop-next --update-env` does a rolling cluster
#      restart — one worker at a time loads the new .next/. Combined
#      with step 2, the vulnerable window shrinks from ~90s to ~0s.
#   4. Health check confirms before exit.
#
# Rollback (manual, if the new build is bad):
#   cd /var/www/homenshop-next
#   mv .next .next-bad
#   mv .next-prev .next
#   pm2 reload homenshop-next --update-env
#
# Requirements (one-time setup):
#   pm2 delete homenshop-next 2>/dev/null || true
#   pm2 start ecosystem.config.cjs
#   pm2 save
#
#   next.config.ts must honor NEXT_DIST_DIR:
#     distDir: process.env.NEXT_DIST_DIR || ".next"

set -euo pipefail

cd "$(dirname "$0")/.."

BLUE="\033[34m"
GREEN="\033[32m"
YELLOW="\033[33m"
RED="\033[31m"
RESET="\033[0m"

STAGING_DIR=".next-staging"
PREV_DIR=".next-prev"
LIVE_DIR=".next"

echo -e "${BLUE}[deploy]${RESET} $(date -Iseconds) starting blue-green deploy"

# 1. Pull latest code
if [ -d .git ]; then
  echo -e "${BLUE}[deploy]${RESET} git pull…"
  git pull --rebase --autostash
fi

# 2. Install deps
echo -e "${BLUE}[deploy]${RESET} npm install (idempotent if no changes)…"
npm install --no-audit --no-fund --prefer-offline

# 3. Prisma client regenerate. Always run — it's idempotent (~1s) and
#    the previous "only on schema change" check using HEAD@{1} silently
#    skipped the regen when reflog moves were quirky (autostash, prior
#    failed deploys, multi-commit pulls). The cost of running every time
#    is negligible; the cost of a stale client is a build failure with
#    cryptic "Object literal may only specify known properties" errors
#    on whatever new column was just added.
echo -e "${BLUE}[deploy]${RESET} prisma generate…"
npx prisma generate

# 4. Clean stale staging from a previous failed deploy
if [ -d "$STAGING_DIR" ]; then
  echo -e "${YELLOW}[deploy]${RESET} removing stale $STAGING_DIR from previous run"
  rm -rf "$STAGING_DIR"
fi

# 4b. Clean stale type dirs in the live .next/. These are compile-time
#     artifacts only (no runtime impact on live workers, which read
#     .next/server/ and .next/static/), but tsconfig.json includes BOTH
#     .next/types and .next/dev/types, so their stale contents collide
#     with the fresh types Next emits into .next-staging/types during
#     build — you get route-union mismatch errors like
#        Type 'import(.../next/dev/types/routes").LayoutRoutes' is not
#        assignable to type 'import(.../next-staging/types/routes")...'
#     Wiping these before staging build avoids the conflict.
rm -rf "$LIVE_DIR/types" "$LIVE_DIR/dev" 2>/dev/null || true

# 5. Build into staging directory — live workers keep serving from .next/
echo -e "${BLUE}[deploy]${RESET} next build → $STAGING_DIR (live workers undisturbed)…"
BUILD_START=$(date +%s)
if ! NEXT_DIST_DIR="$STAGING_DIR" npm run build; then
  echo -e "${RED}[deploy]${RESET} Build failed — no workers touched, no swap. Aborting."
  rm -rf "$STAGING_DIR" 2>/dev/null || true
  exit 1
fi
BUILD_END=$(date +%s)
echo -e "${GREEN}[deploy]${RESET} Build OK in $((BUILD_END - BUILD_START))s"

# Sanity check: the critical manifest dirs must exist. A failed-silently
# build could leave a half-empty .next-staging/ that would swap into
# place and break everything.
if [ ! -d "$STAGING_DIR/server" ] || [ ! -d "$STAGING_DIR/static" ]; then
  echo -e "${RED}[deploy]${RESET} $STAGING_DIR looks incomplete (missing server/ or static/). Aborting."
  rm -rf "$STAGING_DIR"
  exit 1
fi

# 6. Atomic swap: live → prev, staging → live
#    Two rename() syscalls on the same filesystem, total time ~ms.
echo -e "${BLUE}[deploy]${RESET} atomic swap $LIVE_DIR ↔ $STAGING_DIR…"
SWAP_START=$(date +%s%N)
[ -d "$PREV_DIR" ] && rm -rf "$PREV_DIR"
[ -d "$LIVE_DIR" ] && mv "$LIVE_DIR" "$PREV_DIR"
mv "$STAGING_DIR" "$LIVE_DIR"
SWAP_END=$(date +%s%N)
SWAP_MS=$(( (SWAP_END - SWAP_START) / 1000000 ))
echo -e "${GREEN}[deploy]${RESET} swap complete in ${SWAP_MS}ms (prev build retained as $PREV_DIR for rollback)"

# 7. Rolling reload — pm2 cluster mode restarts workers one at a time.
#    Each worker boots fresh and loads the swapped-in .next/.
echo -e "${BLUE}[deploy]${RESET} pm2 reload (rolling, zero-downtime)…"
pm2 reload homenshop-next --update-env

# 8. Health check
echo -e "${BLUE}[deploy]${RESET} waiting for workers to become healthy…"
for i in $(seq 1 30); do
  if curl -s -o /dev/null -w '%{http_code}' -m 3 http://127.0.0.1:3000/ 2>/dev/null | grep -qE '^(200|307|308)$'; then
    echo -e "${GREEN}[deploy]${RESET} healthy — request returned after ${i}s"
    break
  fi
  sleep 1
  if [ "$i" -eq 30 ]; then
    echo -e "${RED}[deploy]${RESET} Workers not responding after 30s — check 'pm2 logs'"
    echo -e "${YELLOW}[deploy]${RESET} To roll back: mv $LIVE_DIR .next-bad && mv $PREV_DIR $LIVE_DIR && pm2 reload homenshop-next"
    pm2 status
    exit 1
  fi
done

# 9. Final status
pm2 status
echo -e "${GREEN}[deploy]${RESET} $(date -Iseconds) done."
