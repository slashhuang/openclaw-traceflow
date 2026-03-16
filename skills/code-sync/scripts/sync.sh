#!/usr/bin/env bash
# 代码同步并重启 Gateway（等同于 ./bootstrap.sh 的核心逻辑）
# 见 docs/prd-bootstrap.md §3.2

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
cd "$REPO_ROOT"

echo "[code-sync] 开始同步代码..."

# 1. 代码同步
if git rev-parse --is-inside-work-tree &>/dev/null; then
  echo "[code-sync] 同步代码..."
  git pull --ff-only || true
  CURRENT_COMMIT=$(git rev-parse HEAD)
else
  echo "[code-sync] 非 git 仓库，跳过代码同步"
  CURRENT_COMMIT="unknown"
fi

# 2. 检查 pm2
if ! command -v pm2 &>/dev/null; then
  echo "[code-sync] 错误：未找到 pm2。请安装：npm i -g pm2" >&2
  exit 1
fi

# 3. 重启/启动 gateway
if pm2 describe claw-gateway &>/dev/null; then
  echo "[code-sync] 重启 claw-gateway..."
  pm2 restart claw-gateway
  ACTION="restart"
else
  echo "[code-sync] 启动 claw-gateway..."
  pm2 start ecosystem.config.cjs
  ACTION="start"
fi

# 等待 PM2 启动完成
sleep 3

# 4. 检查启动状态
if pm2 describe claw-gateway | grep -q "online"; then
  echo "[code-sync] 完成。Gateway 已${ACTION}。"
  echo "[code-sync] 当前 commit: ${CURRENT_COMMIT}"
  echo "[code-sync] 维护命令：pm2 status | pm2 logs claw-gateway | pm2 restart claw-gateway"
  exit 0
else
  echo "[code-sync] 警告：Gateway 可能未正常启动，请检查 pm2 logs claw-gateway" >&2
  exit 1
fi
