#!/usr/bin/env bash
# 从 abu.jpg 生成 macOS 应用图标 icon.icns（需在 macOS 上执行，依赖 sips、iconutil）

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
SRC="${1:-abu.jpg}"
ICONSET="icon.iconset"
OUT="icon.icns"
TMP_PNG=".icon_1024.png"

[[ -f "$SRC" ]] || { echo "错误：找不到 $SRC"; exit 1; }

# 先转为 1024x1024 PNG，再基于 PNG 生成各尺寸（避免 iconutil 对 JPG 转换结果报错）
sips -s format png -z 1024 1024 "$SRC" --out "$TMP_PNG"
rm -rf "$ICONSET"
mkdir -p "$ICONSET"

# macOS .iconset 必须的 10 个文件（见 man iconutil）
sips -z 16 16 "$TMP_PNG" --out "$ICONSET/icon_16x16.png"
sips -z 32 32 "$TMP_PNG" --out "$ICONSET/icon_16x16@2x.png"
sips -z 32 32 "$TMP_PNG" --out "$ICONSET/icon_32x32.png"
sips -z 64 64 "$TMP_PNG" --out "$ICONSET/icon_32x32@2x.png"
sips -z 128 128 "$TMP_PNG" --out "$ICONSET/icon_128x128.png"
sips -z 256 256 "$TMP_PNG" --out "$ICONSET/icon_128x128@2x.png"
sips -z 256 256 "$TMP_PNG" --out "$ICONSET/icon_256x256.png"
sips -z 512 512 "$TMP_PNG" --out "$ICONSET/icon_256x256@2x.png"
sips -z 512 512 "$TMP_PNG" --out "$ICONSET/icon_512x512.png"
sips -z 1024 1024 "$TMP_PNG" --out "$ICONSET/icon_512x512@2x.png"

iconutil -c icns "$ICONSET" -o "$OUT"
rm -rf "$ICONSET" "$TMP_PNG"
echo "已生成 $OUT"
