#!/bin/bash
# 推送 monorepo 到 GitHub 远程仓库

REMOTE_URL="${1:-git@github.com:slashhuang/claw-sources.git}"

echo "设置远程仓库：$REMOTE_URL"
git remote remove origin 2>/dev/null
git remote add origin $REMOTE_URL

echo "推送到 origin/main..."
git push -u origin main

echo "完成！"
echo ""
echo "之后可以使用以下命令同步子仓库："
echo "  git subtree pull --prefix claw-family claw-family-upstream main --squash"
echo "  git subtree pull --prefix futu-openD futu-openD-upstream main --squash"
echo "  git subtree pull --prefix openclaw-traceflow openclaw-traceflow main --squash"
echo "  git subtree pull --prefix external-refs/openclaw openclaw-upstream main --squash"
