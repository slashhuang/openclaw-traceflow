#!/usr/bin/env bash
# Install ClawHub skills into repo skills/ directory. Skills 以「上传/放入目录」方式管理，不再使用配置文件。
# Usage: ./scripts/install-clawhub-skills.sh <slug1> [slug2 ...]
# Example: ./scripts/install-clawhub-skills.sh stock-market-pro youtube-watcher
set -e
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"
SKILLS_DIR="${REPO_ROOT}/skills"
mkdir -p "$SKILLS_DIR"

if [[ $# -eq 0 ]]; then
  echo "Usage: $0 <skill-slug> [skill-slug ...]"
  echo "Example: $0 stock-market-pro youtube-watcher clawddocs"
  exit 0
fi

DELAY="${CLAWHUB_INSTALL_DELAY:-3}"
FIRST=1
for slug in "$@"; do
  if [[ -f "${SKILLS_DIR}/${slug}/SKILL.md" ]]; then
    echo "已安装，跳过 $slug"
    continue
  fi
  if [[ $FIRST -eq 0 ]]; then
    echo "等待 ${DELAY}s 再安装下一个，避免限流..."
    sleep "$DELAY"
  fi
  FIRST=0
  echo "Installing $slug ..."
  npx --yes clawhub install "$slug" --workdir . --dir skills --no-input
done

echo "Done. Skills are in $SKILLS_DIR"
