#!/usr/bin/env bash
# 启动富途 OpenD（仅 Linux，支持验证码输入）
# 参考：https://openapi.futumm.com/futu-api-doc/opend/opend-cmd.html

set -e

REPO_ROOT="${REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 可能的 OpenD 目录列表（按优先级）
find_opend_dir() {
  local possible_dirs=(
    "$REPO_ROOT/Futu_OpenD_Centos7"
    "$REPO_ROOT/Futu_OpenD"
    "$REPO_ROOT/Futu_OpenD_Linux"
    "$REPO_ROOT/opend"
    "$HOME/Futu_OpenD"
    "/opt/Futu_OpenD"
    "/usr/local/Futu_OpenD"
  )

  for dir in "${possible_dirs[@]}"; do
    if [[ -x "$dir/FutuOpenD" ]] && [[ -f "$dir/FutuOpenD.xml" ]]; then
      echo "$dir"
      return 0
    fi
  done

  return 1
}

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "[futu-opend] 仅支持 Linux，当前为 $(uname -s)，跳过"
  exit 0
fi

# 查找 OpenD 目录
OPEND_DIR=$(find_opend_dir)
if [[ $? -ne 0 ]]; then
  echo "[futu-opend] 未找到 OpenD 安装目录" >&2
  echo "[futu-opend] 请先安装 OpenD 到以下目录之一:" >&2
  echo "  - $REPO_ROOT/Futu_OpenD_Centos7 (推荐)" >&2
  echo "  - $REPO_ROOT/Futu_OpenD" >&2
  echo "  - $REPO_ROOT/Futu_OpenD_Linux" >&2
  echo "  - ~/Futu_OpenD" >&2
  echo "  - /opt/Futu_OpenD" >&2
  exit 1
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
  echo "[futu-opend] 警告：未找到数据文件 $OPEND_DIR/AppData.dat，首次启动可能需要验证码" >&2
fi

cd "$OPEND_DIR"

# 检查是否已有 FutuOpenD 进程在运行
EXISTING_PID=$(pgrep -f "FutuOpenD" | head -1)
if [[ -n "$EXISTING_PID" ]]; then
  echo "[futu-opend] FutuOpenD 已在运行中 (PID: $EXISTING_PID)"
  echo "[futu-opend] 如需输入验证码，运行：$SCRIPT_DIR/input-verify-code.sh <验证码>"
  # 持续监控进程
  while kill -0 $EXISTING_PID 2>/dev/null; do
    sleep 5
  done
  echo "[futu-opend] FutuOpenD 进程已退出"
  exit 0
fi

echo "[futu-opend] 启动 FutuOpenD（api_port=11113, telnet_port=22222）..."

# 前台启动 FutuOpenD（& 后台运行 + wait 等待）
./FutuOpenD -cfg_file="$OPEND_DIR/FutuOpenD.xml" -console=0 &
FUTU_PID=$!

# 等待进程启动
sleep 3

# 检查进程是否正常运行
if kill -0 $FUTU_PID 2>/dev/null; then
  echo "[futu-opend] FutuOpenD 已启动 (PID: $FUTU_PID)"
  echo "[futu-opend] 如需输入验证码，运行：$SCRIPT_DIR/input-verify-code.sh <验证码>"
  echo "[futu-opend] 或使用 telnet: telnet 127.0.0.1 22222"
  echo "[futu-opend] 命令：input_phone_verify_code -code=<验证码>"

  # 等待子进程结束，保持 PM2 状态
  wait $FUTU_PID
else
  echo "[futu-opend] FutuOpenD 启动失败" >&2
  exit 1
fi
