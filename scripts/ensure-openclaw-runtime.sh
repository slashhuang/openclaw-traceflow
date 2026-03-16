#!/usr/bin/env bash
# 根据 config/openclaw.partial.json 与 bot.dev.json/bot.prod.json/bot.local.json 生成运行时配置。
# 接受 --env dev|prod|local（默认 prod），输出到 openClawRuntime/openclaw.generated.json。
# 由 start-openclaw.sh 调用或单独执行。见 docs/prd-bootstrap.md §6.2。

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PARTIAL="${REPO_ROOT}/config/openclaw.partial.json"
SKILLS_ABSOLUTE="${REPO_ROOT}/skills"

# 解析 --env（与 start-openclaw.sh 一致）
OPENCLAW_ENV="${OPENCLAW_ENV:-production}"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --env)
      OPENCLAW_ENV="$2"
      shift 2
      ;;
    --env=*)
      OPENCLAW_ENV="${1#--env=}"
      shift
      ;;
    *)
      shift
      ;;
  esac
done
export OPENCLAW_ENV

# 输出路径：默认 openClawRuntime/openclaw.generated.json（PRD §4）
RUNTIME_CONFIG="${OPENCLAW_CONFIG_PATH:-${REPO_ROOT}/openClawRuntime/openclaw.generated.json}"
if [[ "$RUNTIME_CONFIG" != /* ]]; then
  RUNTIME_CONFIG="${REPO_ROOT}/${RUNTIME_CONFIG}"
fi
RUNTIME_ROOT="$(dirname "$RUNTIME_CONFIG")"

# 选择 bot 文件
case "$OPENCLAW_ENV" in
  dev)
    BOT_FILE="${REPO_ROOT}/bot.dev.json"
    ;;
  local)
    BOT_FILE="${REPO_ROOT}/bot.local.json"
    ;;
  *)
    BOT_FILE="${REPO_ROOT}/bot.prod.json"
    ;;
esac

# 加载 openclaw.env.json（仅用于 OPENCLAW_WORKSPACE_DIR 默认值）
if [[ -f "$REPO_ROOT/config/openclaw.env.json" ]] && command -v jq &>/dev/null; then
  while IFS= read -r line; do
    [[ -n "$line" ]] && eval "export $line"
  done < <(jq -r 'to_entries[] | "\(.key)=\(.value | @sh)"' "$REPO_ROOT/config/openclaw.env.json")
fi
if [[ -f "$REPO_ROOT/openclaw.env.json" ]] && command -v jq &>/dev/null; then
  while IFS= read -r line; do
    [[ -n "$line" ]] && eval "export $line"
  done < <(jq -r 'to_entries[] | "\(.key)=\(.value | @sh)"' "$REPO_ROOT/openclaw.env.json")
fi

# workspace 绝对路径：相对路径按 openClawRuntime 解析（PRD §6.1）
WORKSPACE_REL="${OPENCLAW_WORKSPACE_DIR:-.workspace}"
if [[ "$WORKSPACE_REL" == /* ]]; then
  WORKSPACE_ABS="$WORKSPACE_REL"
else
  WORKSPACE_ABS="${RUNTIME_ROOT}/${WORKSPACE_REL}"
fi

if [[ ! -f "$PARTIAL" ]]; then
  echo "跳过：无 $PARTIAL" >&2
  exit 0
fi
if [[ ! -d "$SKILLS_ABSOLUTE" ]]; then
  echo "跳过：无 skills 目录" >&2
  exit 0
fi
if ! command -v jq &>/dev/null; then
  echo "跳过：未找到 jq" >&2
  exit 0
fi
if [[ ! -f "$BOT_FILE" ]]; then
  echo "跳过：无 $BOT_FILE" >&2
  exit 0
fi

# 仓库级 hooks 与 workspace-defaults 路径（PRD workspace-defaults-bootstrap-hook）
HOOKS_ABSOLUTE="${REPO_ROOT}/hooks"
WORKSPACE_DEFAULTS_ABSOLUTE="${REPO_ROOT}/workspace-defaults"

# 跨平台：动态检测 Chrome 可执行文件路径（macOS vs Linux）
# Linux 服务器环境直接禁用 browser，仅 macOS 启用
detect_chrome_path() {
  local os_type
  os_type="$(uname -s)"

  if [[ "$os_type" == "Linux" ]]; then
    # Linux 服务器环境：禁用 browser
    echo ""
    return 0
  fi

  if [[ "$os_type" == "Darwin" ]]; then
    # macOS: 检测 Google Chrome 或 Chromium
    if [[ -f "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" ]]; then
      echo "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    elif [[ -f "/Applications/Chromium.app/Contents/MacOS/Chromium" ]]; then
      echo "/Applications/Chromium.app/Contents/MacOS/Chromium"
    else
      echo ""  # 未找到，让 OpenClaw 自行处理
    fi
  else
    echo ""  # 其他系统，不指定
  fi
}

CHROME_PATH="$(detect_chrome_path)"

# Linux 环境禁用 browser，macOS 且检测到 Chrome 时启用
if [[ "$(uname -s)" == "Linux" ]]; then
  BROWSER_ENABLED="false"
elif [[ -n "$CHROME_PATH" ]]; then
  BROWSER_ENABLED="true"
else
  BROWSER_ENABLED="false"
fi

# 合并：partial + bot 的 feishu + 注入 skills、workspace、hooks + 动态 browser 配置
TMP_CONFIG="${RUNTIME_CONFIG}.tmp.$$"
trap 'rm -f "$TMP_CONFIG"' EXIT

jq -n \
  --slurpfile partial "$PARTIAL" \
  --slurpfile bot "$BOT_FILE" \
  --arg skills "$SKILLS_ABSOLUTE" \
  --arg workspace "$WORKSPACE_ABS" \
  --arg hooksDir "$HOOKS_ABSOLUTE" \
  --arg workspaceDefaults "$WORKSPACE_DEFAULTS_ABSOLUTE" \
  --arg chromePath "$CHROME_PATH" \
  --arg browserEnabled "$BROWSER_ENABLED" \
  '
    ($partial[0]) |
    .channels.feishu = ($bot[0].feishu) |
    .skills = ((.skills // {}) | .load = ((.load // {}) | .extraDirs = [$skills])) |
    .agents = ((.agents // {}) | .defaults = ((.defaults // {}) | .workspace = $workspace)) |
    .hooks = ((.hooks // {}) | .internal = ((.internal // {}) |
      (.load = ((.load // {}) | .extraDirs = ((.extraDirs // []) + [$hooksDir]))) |
      (.entries = ((.entries // {}) | .["agent-workspace-defaults"] = ({ enabled: true, options: { workspaceDefaultsPath: $workspaceDefaults } })))
    )) |
    # 跨平台：Linux 禁用 browser，macOS 检测到 Chrome 时启用
    .browser = (if ($browserEnabled == "true") then { enabled: true, executablePath: $chromePath } else { enabled: false } end)
  ' > "$TMP_CONFIG"

mkdir -p "$(dirname "$RUNTIME_CONFIG")"
mv "$TMP_CONFIG" "$RUNTIME_CONFIG"
echo "已生成：$RUNTIME_CONFIG (OPENCLAW_ENV=${OPENCLAW_ENV})"
