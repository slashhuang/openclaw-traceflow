#!/usr/bin/env bash
# 一键安装本仓库运行所需环境：Node、PM2、OpenClaw、飞书插件、以及各 skill 依赖命令（jq/uv/yt-dlp 等）。
# 用法：在仓库根目录执行 ./scripts/setup-env.sh 或 bash scripts/setup-env.sh
# 支持 macOS（Homebrew + Node）与 Linux（apt/dnf 安装 Node + jq/yt-dlp，uv 官方脚本）。

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

IS_DARWIN=false
[[ "$(uname -s)" == "Darwin" ]] && IS_DARWIN=true

# 确保 ~/.local/bin 在本脚本及后续安装的 PATH 中（uv 会装到这里）
export PATH="${HOME}/.local/bin:${PATH}"

install_homebrew() {
  if command -v brew &>/dev/null; then
    echo "[OK] Homebrew 已安装"
    return 0
  fi
  if ! "$IS_DARWIN"; then
    echo "当前为 Linux，跳过 Homebrew。"
    return 0
  fi
  echo "正在安装 Homebrew（若需确认请按提示操作）..."
  NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)" || true
  if [[ -x /opt/homebrew/bin/brew ]]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
  elif [[ -x /usr/local/bin/brew ]]; then
    eval "$(/usr/local/bin/brew shellenv)"
  fi
  if ! command -v brew &>/dev/null; then
    echo "Homebrew 安装可能未完成或未加入 PATH，请手动执行并重试：" >&2
    echo '  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"' >&2
    exit 1
  fi
  echo "[OK] Homebrew 已就绪"
}

install_node_linux() {
  if command -v apt-get &>/dev/null; then
    echo "正在用 apt 安装 Node.js..."
    sudo apt-get update -qq
    sudo apt-get install -y nodejs npm
  elif command -v dnf &>/dev/null; then
    echo "正在用 dnf 安装 Node.js..."
    sudo dnf install -y nodejs npm
  elif command -v yum &>/dev/null; then
    echo "正在用 yum 安装 Node.js..."
    sudo yum install -y nodejs npm
  else
    echo "未检测到 apt/dnf/yum。请先安装 Node.js (v18+)：https://nodejs.org 或 NodeSource 源。" >&2
    return 1
  fi
}

install_node() {
  if command -v node &>/dev/null; then
    echo "[OK] Node 已安装: $(node -v)"
    return 0
  fi
  if "$IS_DARWIN" && command -v brew &>/dev/null; then
    echo "正在用 Homebrew 安装 Node.js..."
    brew install node
  elif ! "$IS_DARWIN"; then
    install_node_linux || exit 1
  else
    echo "未检测到 Homebrew 且未找到 node。请先安装 Node.js (v18+)：https://nodejs.org" >&2
    exit 1
  fi
  if ! command -v node &>/dev/null; then
    echo "Node 安装后仍不可用，请检查 PATH。" >&2
    exit 1
  fi
  echo "[OK] Node 已就绪: $(node -v)"
}

install_pm2_openclaw() {
  echo "正在全局安装 pm2 和 openclaw..."
  npm install -g pm2 openclaw
  echo "[OK] pm2、openclaw 已安装"
}

install_feishu_plugin() {
  if openclaw plugins list 2>/dev/null | grep -q '@openclaw/feishu'; then
    echo "[OK] 飞书插件已安装"
    return 0
  fi
  echo "正在安装飞书插件..."
  openclaw plugins install @openclaw/feishu
  echo "[OK] 飞书插件已安装"
}

install_skill_commands_linux() {
  echo "正在用系统包管理器安装 jq、yt-dlp，并用官方脚本安装 uv..."
  if command -v apt-get &>/dev/null; then
    sudo apt-get update -qq
    sudo apt-get install -y jq yt-dlp curl
  elif command -v dnf &>/dev/null; then
    sudo dnf install -y jq yt-dlp curl
  elif command -v yum &>/dev/null; then
    sudo yum install -y jq yt-dlp curl
  else
    echo "未检测到 apt/dnf/yum，跳过 jq/yt-dlp。"
  fi
  if ! command -v uv &>/dev/null; then
    echo "正在安装 uv..."
    curl -LsSf https://astral.sh/uv/install.sh | sh
    export PATH="${HOME}/.local/bin:${PATH}"
  fi
  echo "[OK] skill 依赖（jq/uv/yt-dlp）已处理"
}

install_skill_commands() {
  if "$IS_DARWIN" && [[ -f "$SCRIPT_DIR/check-skill-commands.js" ]]; then
    echo "正在检查并安装各 skill 依赖命令（jq/uv/yt-dlp 等）..."
    node "$SCRIPT_DIR/check-skill-commands.js" --install -y 2>/dev/null || true
    echo "[OK] skill 依赖已处理"
  elif ! "$IS_DARWIN"; then
    install_skill_commands_linux
  else
    echo "未找到 check-skill-commands.js，跳过 skill 依赖安装。"
  fi
}

# --- 主流程 ---
echo "===== 一键环境安装 (claw-family) ====="
echo "将按需安装: Node.js、npm、PM2、OpenClaw、飞书插件、jq/uv/yt-dlp 等 skill 依赖"
echo ""
install_homebrew || true
install_node
install_pm2_openclaw
install_feishu_plugin
install_skill_commands

echo ""
echo "===== 安装完成 ====="
echo "后续步骤："
echo "  1. 在仓库根目录配置飞书：bot.dev.json（本地）、bot.prod.json（生产）；模型等见 config/openclaw.partial.json"
echo "  2. 启动: 本地 ./scripts/start-openclaw.sh --env dev；生产 ./bootstrap.sh 或 pm2 start ecosystem.config.cjs"
if [[ -d "${HOME}/.local/bin" ]]; then
  echo "  3. 若 uv 刚被安装，请把 ~/.local/bin 加入 PATH（PM2 启动时也需能找到 uv）："
  echo "     Linux: 在 ~/.bashrc 或 ~/.profile 中增加: export PATH=\"\$HOME/.local/bin:\$PATH\""
  echo "     macOS: 在 ~/.zshrc 中增加: export PATH=\"\$HOME/.local/bin:\$PATH\""
fi
echo ""
