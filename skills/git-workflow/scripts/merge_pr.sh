#!/bin/bash
# 合并 PR 脚本
# 用法：./merge_pr.sh <PR 号> [合并方式]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/github_api.sh"

# 主函数
main() {
    local pr_number="$1"
    local merge_method="${2:-merge}"
    
    if [ -z "$pr_number" ]; then
        echo "[git-workflow] ❌ 错误：需要提供 PR 号"
        echo "[git-workflow] 用法：$0 <PR 号> [merge|squash|rebase]"
        exit 1
    fi
    
    echo "[git-workflow] 合并 PR #$pr_number (方式：$merge_method)..."
    
    # 调用 API 合并 PR
    if merge_pr "$pr_number" "$merge_method"; then
        echo "[git-workflow] ✅ PR 合并成功"
        
        # 可选：删除远程分支
        echo "[git-workflow] 获取 PR 信息..."
        local pr_info="$(get_pr_status "$pr_number")"
        local head_ref=$(echo "$pr_info" | grep -o '"head":{[^}]*"ref":"[^"]*"' | grep -o '"ref":"[^"]*"' | cut -d'"' -f4)
        
        if [ -n "$head_ref" ]; then
            echo "[git-workflow] 删除远程分支：$head_ref"
            delete_branch "$head_ref" || echo "[git-workflow] ⚠️ 分支删除失败（可能已删除）"
        fi
    else
        echo "[git-workflow] ❌ PR 合并失败"
        exit 1
    fi
}

# 如果直接执行脚本
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
    main "$@"
fi
