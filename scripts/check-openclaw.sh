#!/usr/bin/env bash
# 检查本机是否已安装 openclaw 及版本。见 docs/prd-bootstrap.md §3.4、§6.2。

set -e

if ! command -v openclaw &>/dev/null; then
  echo "未找到 openclaw。请安装：npm i -g openclaw 或 pnpm add -g openclaw" >&2
  exit 1
fi

echo "openclaw: $(openclaw --version 2>/dev/null || echo '已安装，版本未知')"
