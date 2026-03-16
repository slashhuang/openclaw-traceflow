#!/usr/bin/env bash
# 一站式启动入口（统一通过 PM2 + ecosystem.config.cjs）：
# - 本地/开发：./bootstrap.sh --env dev|local
# - 生产：./bootstrap.sh 或 ./bootstrap.sh --env prod|production
# 不同环境通过 PM2 的 --env 选择 ecosystem.config.cjs 中的 env / env_dev / env_local 等配置。

set -e

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_ROOT"

# 解析 --env（默认 production）
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

# 映射 OPENCLAW_ENV → PM2 的 --env 名称
PM2_ENV="production"
case "$OPENCLAW_ENV" in
  dev|development)
    PM2_ENV="dev"
    ;;
  local)
    PM2_ENV="local"
    ;;
  prod|production)
    PM2_ENV="production"
    ;;
  *)
    # 其他值一律当作 production 处理，避免意外
    PM2_ENV="production"
    ;;
esac

echo "[bootstrap] OPENCLAW_ENV=${OPENCLAW_ENV}, PM2_ENV=${PM2_ENV}"

# 仅在生产环境下做 git pull，避免开发环境干扰本地改动
if [[ "$PM2_ENV" == "production" ]]; then
  if git rev-parse --is-inside-work-tree &>/dev/null; then
    echo "[bootstrap] 同步代码..."
    git pull --ff-only || true
  fi
fi

if ! command -v pm2 &>/dev/null; then
  echo "错误：未找到 pm2。请安装：npm i -g pm2" >&2
  exit 1
fi

# 自动安装所有 skill 的 Python 依赖（所有环境）
# 服务器首次部署时建议先执行 npm run prepare，bootstrap 也会在每次启动前检查并安装
install_python_deps() {
  local req_file="$1"
  if [[ -f "$req_file" ]] && command -v pip3 &>/dev/null; then
    echo "[bootstrap] 安装依赖：$req_file ..."
    # 优先静默安装，失败后用清华镜像源
    pip3 install -r "$req_file" -q 2>/dev/null || \
    pip3 install -r "$req_file" -i https://pypi.tuna.tsinghua.edu.cn/simple 2>&1 || true
  fi
}

install_python_deps "skills/stock-assistant/requirements.txt"

# 安装依赖后，停止旧的 stock-assistant 进程（如果有），确保用新依赖重启
if pm2 describe stock-assistant &>/dev/null; then
  echo "[bootstrap] 重启 stock-assistant（使用新安装的依赖）..."
  pm2 delete stock-assistant
fi

# 要启动的应用：始终含 claw-gateway、stock-assistant
# futu-opend 仅在本地已安装富途 OpenD 的机器上运行（默认不启动）
PM2_APPS="claw-gateway,stock-assistant"

# futu-opend 已注释，如需启动请取消注释并添加到 PM2_APPS
# PM2_APPS="${PM2_APPS},futu-opend"

if pm2 describe claw-gateway &>/dev/null; then
  echo "[bootstrap] 重启 claw-gateway（env=${PM2_ENV})..."
  pm2 delete claw-gateway
  pm2 start ecosystem.config.cjs --only "$PM2_APPS" --env "$PM2_ENV"
else
  echo "[bootstrap] 启动服务（env=${PM2_ENV})..."
  pm2 start ecosystem.config.cjs --only "$PM2_APPS" --env "$PM2_ENV"
fi

echo "[bootstrap] 完成。维护: pm2 status | pm2 logs claw-gateway | pm2 logs futu-opend"
