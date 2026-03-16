#!/usr/bin/env bash
# OpenClaw 一键启动：解析 --env dev|prod（默认 prod），运行时落在 openClawRuntime/。
# 配置来自 openclaw.env.json，不用 .env。见 docs/prd-bootstrap.md §6.2。

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
OPENCLAW_RUNTIME_ROOT="${REPO_ROOT}/openClawRuntime"

# 解析 --env（默认 prod，供 PM2 调起时不传参即生产）
OPENCLAW_ENV="${OPENCLAW_ENV:-production}"
ARGV=()
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
      ARGV+=("$1")
      shift
      ;;
  esac
done
set -- "${ARGV[@]}"
export OPENCLAW_ENV

if ! command -v openclaw &>/dev/null; then
  echo "错误：未找到全局 openclaw 命令。请先安装：npm install -g openclaw 或 pnpm add -g openclaw" >&2
  exit 1
fi

# 启动前检查 skill 依赖命令是否可用（可通过 SKILL_CHECK=0 或 SKIP_SKILL_CHECK=1 跳过）
if [[ "${SKILL_CHECK:-1}" != "0" && "${SKIP_SKILL_CHECK:-0}" != "1" ]]; then
  CHECK_JSON=""
  CHECK_JSON=$(node "$SCRIPT_DIR/check-skill-commands.js" --json 2>/dev/null) || true
  if command -v jq &>/dev/null && [[ -n "$CHECK_JSON" ]] && echo "$CHECK_JSON" | jq -e '.missing | length > 0' &>/dev/null; then
    echo "⚠️  以下 skill 依赖的命令未安装或不在 PATH 中：" >&2
    echo "$CHECK_JSON" | jq -r '.missing[] | "  \(.command) (被 \(.skills | join(", ")) 使用)\n    建议：\(.install)"' 2>/dev/null || true
    echo "  一键安装：node $SCRIPT_DIR/check-skill-commands.js --install  或  --install -y（不确认）" >&2
    if [[ "${SKILL_CHECK_STRICT:-0}" == "1" ]]; then
      echo "  已设置 SKILL_CHECK_STRICT=1，拒绝启动。" >&2
      exit 1
    fi
  fi
fi

# 加载 openclaw.env.json（固定值；环境由 --env 决定，不读 .env）
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

# 路径默认：相对路径按 openClawRuntime 解析（PRD §6.1）
export OPENCLAW_WORKSPACE_DIR="${OPENCLAW_WORKSPACE_DIR:-.workspace}"
export OPENCLAW_STATE_DIR="${OPENCLAW_STATE_DIR:-.clawStates}"
if [[ "$OPENCLAW_WORKSPACE_DIR" != /* ]]; then
  export OPENCLAW_WORKSPACE_DIR="${OPENCLAW_RUNTIME_ROOT}/${OPENCLAW_WORKSPACE_DIR}"
fi
if [[ "$OPENCLAW_STATE_DIR" != /* ]]; then
  export OPENCLAW_STATE_DIR="${OPENCLAW_RUNTIME_ROOT}/${OPENCLAW_STATE_DIR}"
fi
mkdir -p "$OPENCLAW_WORKSPACE_DIR" "$OPENCLAW_STATE_DIR"

# BOOT.md 每次启动用仓库默认覆盖到 openClawRuntime/.workspace
# 注意：其他文件（AGENTS.md、SOUL.md、USER.md 等）由 agent-workspace-defaults hook 在运行时从 workspace-defaults/ 注入
# 因此 .workspace/ 下的内容与 workspace-defaults/ 不一致是正常的，不影响实际运行
if [[ -f "$REPO_ROOT/workspace-defaults/BOOT.md" ]]; then
  cp "$REPO_ROOT/workspace-defaults/BOOT.md" "$OPENCLAW_WORKSPACE_DIR/BOOT.md"
fi

# 使 workspace 内可访问 skills：符号链接到仓库 skills，便于工具读取 skills/xxx/config/... 等路径
if [[ -d "$REPO_ROOT/skills" ]]; then
  ln -sfn "$REPO_ROOT/skills" "$OPENCLAW_WORKSPACE_DIR/skills"
fi

# 运行时配置：默认 openClawRuntime/openclaw.generated.json
export OPENCLAW_CONFIG_PATH="${OPENCLAW_CONFIG_PATH:-${REPO_ROOT}/openClawRuntime/openclaw.generated.json}"
if [[ "$OPENCLAW_CONFIG_PATH" != /* ]]; then
  export OPENCLAW_CONFIG_PATH="${REPO_ROOT}/${OPENCLAW_CONFIG_PATH}"
fi

# 生成运行时配置并启动
SKILLS_ABSOLUTE="${REPO_ROOT}/skills"
if [[ -d "$SKILLS_ABSOLUTE" ]]; then
  if "$REPO_ROOT/scripts/ensure-openclaw-runtime.sh"; then
    echo "Using config: $OPENCLAW_CONFIG_PATH (skills → $SKILLS_ABSOLUTE)"
  fi
  [[ -n "${OPENCLAW_WORKSPACE_DIR:-}" ]] && echo "  workspace → $OPENCLAW_WORKSPACE_DIR"
fi

# 启动前先停止已在运行的 openclaw gateway，避免端口占用与重复进程（PRD §6.1）
openclaw gateway stop 2>/dev/null || true

# 提高 AbortSignal 的 MaxListeners 上限，避免 MaxListenersExceededWarning（fetch/undici 等）
PRELOAD_SCRIPT="${REPO_ROOT}/scripts/preload-max-listeners.js"
if [[ -f "$PRELOAD_SCRIPT" ]]; then
  export NODE_OPTIONS="${NODE_OPTIONS:+$NODE_OPTIONS }-r $PRELOAD_SCRIPT"
fi

GATEWAY_ARGS=(gateway run --allow-unconfigured)
if [[ -n "${OPENCLAW_GATEWAY_PORT:-}" ]]; then
  GATEWAY_ARGS+=(--port "$OPENCLAW_GATEWAY_PORT")
fi
# 默认 verbose；仅当显式设为 0 时关闭（OPENCLAW_VERBOSE=0 或 VERBOSE=0）
if [[ "${OPENCLAW_VERBOSE:-1}" != "0" ]] && [[ "${VERBOSE:-1}" != "0" ]]; then
  GATEWAY_ARGS+=(--verbose)
  echo "Verbose logging enabled"
fi

exec openclaw "${GATEWAY_ARGS[@]}"
