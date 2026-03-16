#!/usr/bin/env bash
# 检查 Futu OpenD 所需端口是否可用

set -e

# 默认端口
LISTEN_PORT=${1:-11113}
WEBSOCKET_PORT=${2:-33333}

echo "检查端口可用性..."
echo "  API 端口：$LISTEN_PORT"
echo "  WebSocket 端口：$WEBSOCKET_PORT"

# 检查端口是否被占用
check_port() {
    local port=$1
    if command -v netstat &> /dev/null; then
        if netstat -tlnp 2>/dev/null | grep -q ":$port "; then
            echo "[错误] 端口 $port 已被占用"
            return 1
        fi
    elif command -v ss &> /dev/null; then
        if ss -tlnp 2>/dev/null | grep -q ":$port "; then
            echo "[错误] 端口 $port 已被占用"
            return 1
        fi
    elif command -v lsof &> /dev/null; then
        if lsof -i :$port 2>/dev/null | grep -q LISTEN; then
            echo "[错误] 端口 $port 已被占用"
            return 1
        fi
    else
        echo "[警告] 无法检查端口（缺少 netstat/ss/lsof 命令）"
        return 0
    fi
    echo "[OK] 端口 $port 可用"
    return 0
}

# 检查两个端口
FAILED=0
check_port $LISTEN_PORT || FAILED=1
check_port $WEBSOCKET_PORT || FAILED=1

if [ $FAILED -eq 0 ]; then
    echo "[成功] 所有端口均可用"
    exit 0
else
    echo "[失败] 部分端口被占用"
    exit 1
fi
