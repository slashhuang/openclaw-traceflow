#!/usr/bin/env bash
# 启动富途 OpenD（仅 Linux，由 PM2 守护）
# 参考：https://openapi.futunn.com/futu-api-doc/opend/opend-cmd.html

set -e

REPO_ROOT="${REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
OPEND_DIR="$REPO_ROOT/macAppAndCentOsFutu/Futu_OpenD_Centos7"

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "[futu-opend] 仅支持 Linux，当前为 $(uname -s)，跳过"
  exit 0
fi

if [[ ! -x "$OPEND_DIR/FutuOpenD" ]]; then
  echo "[futu-opend] 未找到可执行文件 $OPEND_DIR/FutuOpenD" >&2
  exit 1
fi
if [[ ! -f "$OPEND_DIR/FutuOpenD.xml" ]]; then
  echo "[futu-opend] 未找到配置文件 $OPEND_DIR/FutuOpenD.xml" >&2
  exit 1
fi
if [[ ! -f "$OPEND_DIR/AppData.dat" ]]; then
  echo "[futu-opend] 未找到数据文件 $OPEND_DIR/AppData.dat，OpenD 可能无法正常启动" >&2
fi

cd "$OPEND_DIR"

# 检查是否已有 FutuOpenD 进程在运行
EXISTING_PID=$(pgrep -f "FutuOpenD" | head -1)
if [[ -n "$EXISTING_PID" ]]; then
  echo "[futu-opend] FutuOpenD 已在运行中 (PID: $EXISTING_PID)，保持监控"
  # 持续监控进程，PM2 需要进程持续运行
  # 如果进程退出，PM2 会重启这个脚本
  while kill -0 $EXISTING_PID 2>/dev/null; do
    sleep 5
  done
  echo "[futu-opend] FutuOpenD 进程已退出"
  exit 0
fi

echo "[futu-opend] 启动 FutuOpenD（api_port=11113, websocket_port=33333）..."

# 前台启动 FutuOpenD（& 后台运行 + wait 等待）
./FutuOpenD -cfg_file="$OPEND_DIR/FutuOpenD.xml" -console=0 &
FUTU_PID=$!

# 等待进程启动
sleep 2

# 检查进程是否正常运行
if kill -0 $FUTU_PID 2>/dev/null; then
  echo "[futu-opend] FutuOpenD 已启动 (PID: $FUTU_PID)"
  # 等待子进程结束，保持 PM2 状态
  wait $FUTU_PID
else
  echo "[futu-opend] FutuOpenD 启动失败"
  exit 1
fi
