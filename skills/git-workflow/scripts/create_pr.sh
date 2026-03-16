#!/bin/bash
# 自动创建 PR 脚本
# 用法：./create_pr.sh [分支名] [PR 标题] [PR 描述]
# 
# 核心原则：
# 1. 必须调用 GitHub API 自动创建 PR，禁止返回 /new/分支 链接让用户手动创建
# 2. Token 获取：环境变量 GITHUB_TOKEN > .env 文件
# 3. 创建失败必须报错，不能降级为手动流程

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/github_api.sh"

# 获取当前分支名
get_current_branch() {
    git rev-parse --abbrev-ref HEAD
}

# 获取最后一个 commit 的标题
get_last_commit_title() {
    git log -1 --pretty=%s
}

# 获取变更摘要（最近 3 个 commit）
get_commits_summary() {
    git log -3 --pretty=format:"- %s" | head -10
}

# 获取变更文件列表
get_changed_files() {
    local branch="$1"
    git diff --name-only origin/main...HEAD 2>/dev/null || git diff --name-only HEAD~1..HEAD
}

# 生成 PR 描述
generate_pr_body() {
    local custom_body="$1"
    
    if [ -n "$custom_body" ]; then
        echo "$custom_body"
        return
    fi
    
    # 自动生成 PR 描述
    local commits="$(get_commits_summary)"
    local files="$(get_changed_files)"
    
    cat << EOF
## 📝 变更内容

$commits

## 📁 涉及文件

\`\`\`
$files
\`\`\`

---
*此 PR 由 git-workflow 自动创建*
EOF
}

# 主函数
main() {
    local branch="${1:-$(get_current_branch)}"
    local title="${2:-$(get_last_commit_title)}"
    local body="${3:-}"
    
    echo "[git-workflow] 创建 PR..."
    echo "[git-workflow] 分支：$branch"
    echo "[git-workflow] 标题：$title"
    
    # 验证 Token 是否存在
    local token_check="$(get_token)"
    if [ -z "$token_check" ]; then
        echo "[git-workflow] ❌ 错误：找不到 GITHUB_TOKEN" >&2
        echo "[git-workflow] 请确保：" >&2
        echo "[git-workflow]   1. 环境变量 GITHUB_TOKEN 已设置，或" >&2
        echo "[git-workflow]   2. 仓库根目录 .env 文件中有 GITHUB_TOKEN=ghp_xxx" >&2
        return 1
    fi
    
    # 生成 PR 描述
    if [ -z "$body" ]; then
        body="$(generate_pr_body)"
    fi
    
    # 调用 API 创建 PR
    local pr_number
    pr_number="$(create_pr "$title" "$body" "$branch" "main")"
    
    if [ $? -eq 0 ] && [ -n "$pr_number" ]; then
        echo "[git-workflow] ✅ PR 创建成功"
        echo "[git-workflow] PR 链接：https://github.com/slashhuang/claw-family/pull/$pr_number"
        # 输出 PR 号供调用方使用
        echo "PR_NUMBER=$pr_number"
    else
        echo "[git-workflow] ❌ PR 创建失败" >&2
        echo "[git-workflow] 请检查：" >&2
        echo "[git-workflow]   1. GITHUB_TOKEN 是否有效（需 repo 权限）" >&2
        echo "[git-workflow]   2. 分支 '$branch' 是否已推送到远程" >&2
        echo "[git-workflow]   3. base 分支 'main' 是否存在" >&2
        return 1
    fi
}

# 如果直接执行脚本
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
    main "$@"
fi
