#!/usr/bin/env bash
# 通过 Telnet 输入富途 OpenD 验证码
# 用法：./scripts/input-verify-code.sh <验证码>

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ -z "$1" ]]; then
  echo "用法：$0 <验证码>"
  echo "示例：$0 123456"
  exit 1
fi

VERIFY_CODE="$1"
TELNET_HOST="${FUTU_TELNET_HOST:-127.0.0.1}"
TELNET_PORT="${FUTU_TELNET_PORT:-22222}"

echo "[futu-opend] 正在通过 Telnet 输入验证码..."
echo "[futu-opend] Host: $TELNET_HOST, Port: $TELNET_PORT"

# 使用 expect 脚本输入验证码
"$SCRIPT_DIR/input-verify-code.exp" "$TELNET_HOST" "$TELNET_PORT" "$VERIFY_CODE"
