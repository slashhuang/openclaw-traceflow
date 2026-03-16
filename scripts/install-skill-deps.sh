#!/usr/bin/env bash
# 安装所有 Skill 的 Python 依赖
# 用法：./scripts/install-skill-deps.sh
# npm run prepare 会自动执行此脚本
#
# 服务器首次部署建议执行：
#   npm install && npm run prepare

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "========================================"
echo "  安装 Skill Python 依赖"
echo "========================================"

# 遍历所有 skill 的 requirements.txt
for req_file in "$REPO_ROOT"/skills/*/requirements.txt; do
  if [[ -f "$req_file" ]]; then
    skill_name=$(basename "$(dirname "$req_file")")
    echo ""
    echo "[${skill_name}] 安装依赖..."

    # 优先静默安装，失败后用清华镜像源
    pip3 install -r "$req_file" -q 2>/dev/null || \
    pip3 install -r "$req_file" -i https://pypi.tuna.tsinghua.edu.cn/simple 2>&1 || {
      echo "⚠️  [${skill_name}] 依赖安装失败，请手动执行："
      echo "   pip3 install -r ${req_file} -i https://pypi.tuna.tsinghua.edu.cn/simple"
    }
  fi
done

echo ""
echo "========================================"
echo "  安装完成"
echo "========================================"
echo ""
echo "提示：stock-assistant 需要富途 OpenD 或网络代理才能获取行情数据"
