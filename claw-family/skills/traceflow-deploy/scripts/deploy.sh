#!/usr/bin/env bash
set -euo pipefail

log() {
  printf '[traceflow-deploy] %s\n' "$1"
}

fail() {
  printf '[traceflow-deploy] ERROR: %s\n' "$1" >&2
  exit 1
}

require_bin() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLAW_FAMILY_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"
MONOREPO_ROOT="$(cd "$CLAW_FAMILY_DIR/.." && pwd)"
TRACEFLOW_DIR="$MONOREPO_ROOT/openclaw-traceflow"

log "Using monorepo root: $MONOREPO_ROOT"
log "Using traceflow dir: $TRACEFLOW_DIR"

[[ -d "$TRACEFLOW_DIR" ]] || fail "openclaw-traceflow directory not found: $TRACEFLOW_DIR"

require_bin node
require_bin pnpm
require_bin pm2

cd "$TRACEFLOW_DIR"

if [[ ! -d node_modules ]]; then
  log "node_modules missing, running pnpm install..."
  pnpm install
else
  log "node_modules exists, skip pnpm install."
fi

log "Running production deployment via PM2..."
pnpm run deploy:pm2

log "Checking PM2 process status..."
pm2 status openclaw-traceflow || pm2 status

log "Recent logs (50 lines, no stream)..."
pm2 logs openclaw-traceflow --lines 50 --nostream || true

log "Done."
