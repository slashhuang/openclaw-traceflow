#!/bin/bash
# merge-and-sync.sh - 合并 PR 并同步代码到上游 subtree
# 用法：./merge-and-sync.sh <PR 号> [合并方式]

set -e

PR_NUMBER="$1"
MERGE_METHOD="${2:-merge}"  # merge, squash, rebase

if [[ -z "$PR_NUMBER" ]]; then
    echo "❌ 请提供 PR 号"
    echo "用法：$0 <PR 号> [merge|squash|rebase]"
    exit 1
fi

echo "=== 合并 PR #$PR_NUMBER ==="
gh pr merge "$PR_NUMBER" --$MERGE_METHOD --admin

echo ""
echo "=== 验证合并状态 ==="
MERGE_STATUS=$(gh pr view "$PR_NUMBER" --json state,mergedAt --jq '.state')
if [[ "$MERGE_STATUS" != "MERGED" ]]; then
    echo "❌ PR 合并失败"
    exit 1
fi
echo "✅ PR 已合并"

echo ""
echo "=== 更新本地代码 ==="
git pull --ff-only

echo ""
echo "=== 同步到上游 subtree ==="

# Subtree 配置
declare -A SUBTREE_DIRS=(
    ["claw-family"]="claw-family-upstream"
    ["futu-openD"]="futu-openD-upstream"
    ["openclaw-traceflow"]="openclaw-traceflow"
    ["external-refs/openclaw"]="openclaw-upstream"
)

for dir in "${!SUBTREE_DIRS[@]}"; do
    remote="${SUBTREE_DIRS[$dir]}"
    
    # 检查是否有未推送的提交
    if git log "origin/main..main" --pretty=format:'%h' -- "$dir" | grep -q .; then
        echo "🔄 推送 $dir 到 $remote..."
        git subtree push --prefix "$dir" "$remote" main || {
            echo "⚠️  $dir 推送失败，继续下一个..."
        }
    else
        echo "⏭️  $dir 无本地修改"
    fi
done

echo ""
echo "✅ 合并和同步完成！"
