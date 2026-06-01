#!/usr/bin/env bash
#
# Instant rollback for blue-green: bring the previous colour back online and
# flip the nginx upstream to it. No rebuild — the previous colour's dist dir
# (.next-blue / .next-green) is still on disk from before the last deploy.
#
# Only valid until the NEXT deploy overwrites the old colour's dist dir.
#
# Usage: bash scripts/rollback-blue-green.sh
#
set -euo pipefail

APP_DIR="/var/www/homenshop-next"
UPSTREAM_CONF="/etc/nginx/conf.d/00-nextjs-upstream.conf"
STATE_FILE="$APP_DIR/.active-color"
HEALTH_TIMEOUT=40

cd "$APP_DIR"

port_for() { [ "$1" = "blue" ] && echo 3000 || echo 3001; }

CURRENT="$(cat "$STATE_FILE" 2>/dev/null || echo blue)"
[ "$CURRENT" = "green" ] && PREV="blue" || PREV="green"
PREV_PORT="$(port_for "$PREV")"
PREV_DIR=".next-$PREV"

echo "==> Current: $CURRENT   →   rolling back to: $PREV (:$PREV_PORT)"

if [ ! -d "$PREV_DIR/server" ]; then
  echo "!! $PREV_DIR/server missing — no rollback build available. Aborting."
  exit 1
fi

echo "==> boot hns-$PREV"
pm2 delete "hns-$PREV" >/dev/null 2>&1 || true
pm2 start ecosystem.config.cjs --only "hns-$PREV" --update-env

echo "==> health-check :$PREV_PORT"
ok=0
for i in $(seq 1 "$HEALTH_TIMEOUT"); do
  code="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PREV_PORT/" || true)"
  case "$code" in 200|307|308) ok=1; echo "   healthy after ${i}s (HTTP $code)"; break ;; esac
  sleep 1
done
[ "$ok" = "1" ] || { echo "!! rollback colour unhealthy — aborting"; exit 1; }

echo "==> flip nginx upstream → :$PREV_PORT"
cat > "$UPSTREAM_CONF" <<EOF
# Managed by blue-green scripts — DO NOT edit by hand.
# Active colour: $PREV (:$PREV_PORT)  @ $(date -u +%FT%TZ) [rollback]
upstream nextjs {
    server 127.0.0.1:$PREV_PORT;
    keepalive 32;
}
EOF
nginx -t && nginx -s reload

echo "$PREV" > "$STATE_FILE"
sleep 9
pm2 delete "hns-$CURRENT" >/dev/null 2>&1 || true
pm2 save

echo "==> ROLLED BACK. Live: $PREV (:$PREV_PORT)."
