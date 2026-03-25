#!/usr/bin/env bash
set -euo pipefail

log() {
  printf '[claw-family-restart] %s\n' "$1"
}

fail() {
  printf '[claw-family-restart] ERROR: %s\n' "$1" >&2
  exit 1
}

require_bin() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLAW_FAMILY_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"

log "Using claw-family dir: $CLAW_FAMILY_DIR"

[[ -d "$CLAW_FAMILY_DIR" ]] || fail "claw-family directory not found: $CLAW_FAMILY_DIR"

require_bin pm2

cd "$CLAW_FAMILY_DIR"

log "Checking PM2 process status..."
if pm2 status claw-gateway >/dev/null 2>&1; then
    log "Gateway 进程已存在，执行 restart..."
    pm2 restart claw-gateway --update-env || fail "Failed to restart claw-gateway"
else
    log "Gateway 进程不存在，执行 start..."
    pm2 start ecosystem.config.cjs || fail "Failed to start claw-gateway"
fi

log "Verifying process healthy..."
sleep 2
pm2 status claw-gateway || pm2 status

log "Recent logs (30 lines, no stream)..."
pm2 logs claw-gateway --lines 30 --nostream || true

log "Done."
