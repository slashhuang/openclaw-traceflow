#!/usr/bin/env bash

set -euo pipefail

APP_NAME="${APP_NAME:-openclaw-traceflow}"
DEFAULT_PORT="${PORT:-3001}"
HOST="${HOST:-0.0.0.0}"

is_port_in_use() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"${port}" -sTCP:LISTEN >/dev/null 2>&1
    return $?
  fi
  return 1
}

port_owner_pid() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    lsof -tiTCP:"${port}" -sTCP:LISTEN 2>/dev/null | head -n 1 || true
    return 0
  fi
  echo ""
}

pm2_pid_for_app() {
  pm2 pid "${APP_NAME}" 2>/dev/null | head -n 1 || true
}

pm2_is_online() {
  pm2 jlist | node -e '
    const fs = require("node:fs");
    const appName = process.argv[1];
    const input = fs.readFileSync(0, "utf8");
    const list = JSON.parse(input || "[]");
    const target = list.find((x) => x?.name === appName);
    if (!target) process.exit(1);
    const status = target?.pm2_env?.status;
    process.exit(status === "online" ? 0 : 1);
  ' "${APP_NAME}"
}

wait_online() {
  local retries=20
  while [ "${retries}" -gt 0 ]; do
    if pm2_is_online; then
      return 0
    fi
    retries=$((retries - 1))
    sleep 1
  done
  return 1
}

wait_health() {
  local port="$1"
  local retries=20
  if ! command -v curl >/dev/null 2>&1; then
    echo "[deploy:pm2] curl not found; skip /api/health check."
    return 0
  fi

  while [ "${retries}" -gt 0 ]; do
    if curl -fsS "http://127.0.0.1:${port}/api/health" >/dev/null 2>&1; then
      return 0
    fi
    retries=$((retries - 1))
    sleep 1
  done
  return 1
}

target_port="${DEFAULT_PORT}"
if is_port_in_use "${target_port}"; then
  port_pid="$(port_owner_pid "${target_port}")"
  app_pid="$(pm2_pid_for_app)"
  if [ -n "${port_pid}" ] && [ "${port_pid}" = "${app_pid}" ]; then
    echo "[deploy:pm2] Port ${target_port} is already used by ${APP_NAME} (pid ${app_pid}), continue deployment."
  else
    echo "[deploy:pm2] Precheck failed: port ${target_port} is occupied by pid ${port_pid:-unknown}."
    echo "[deploy:pm2] Expected fixed port ${target_port} (README default)."
    echo "[deploy:pm2] Please free the port first, e.g. on macOS:"
    echo "  lsof -nP -iTCP:${target_port} -sTCP:LISTEN"
    echo "  kill <PID>"
    exit 1
  fi
fi

export PORT="${target_port}"
export HOST

echo "[deploy:pm2] Installing dependencies..."
pnpm install

echo "[deploy:pm2] Building backend + frontend..."
pnpm run build:all

if pm2 describe "${APP_NAME}" >/dev/null 2>&1; then
  echo "[deploy:pm2] Restarting existing pm2 app ${APP_NAME}..."
  pm2 restart "${APP_NAME}" --update-env
else
  echo "[deploy:pm2] Starting new pm2 app ${APP_NAME}..."
  pm2 start dist/main.js --name "${APP_NAME}" --restart-delay=3000 --max-restarts=10 --update-env
fi

echo "[deploy:pm2] Verifying pm2 status..."
if ! wait_online; then
  echo "[deploy:pm2] ${APP_NAME} is not online after restart."
  pm2 logs "${APP_NAME}" --lines 40
  exit 1
fi

echo "[deploy:pm2] Verifying HTTP health on http://127.0.0.1:${PORT}/api/health ..."
if ! wait_health "${PORT}"; then
  echo "[deploy:pm2] Health check failed for PORT=${PORT}."
  pm2 logs "${APP_NAME}" --lines 60
  exit 1
fi

echo "[deploy:pm2] Success. ${APP_NAME} is online at http://127.0.0.1:${PORT} (HOST=${HOST})."
