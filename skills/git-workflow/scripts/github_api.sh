#!/bin/bash
# GitHub API 封装脚本
# 提供常用的 GitHub API 调用函数

set -e

# 获取 GITHUB_TOKEN
# 严格只从 .env 文件读取（不从 openclaw.env.json 读取）
get_token() {
    # 优先级：环境变量 > .env 文件
    if [ -n "$GITHUB_TOKEN" ]; then
        echo "$GITHUB_TOKEN"
        return
    fi
    
    local script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    local repo_root="$(cd "$script_dir/../../.." && pwd)"
    
    # 从 .env 读取（唯一来源）
    local env_file="$repo_root/.env"
    if [ -f "$env_file" ]; then
        local token=$(grep -o 'GITHUB_TOKEN=[^[:space:]]*' "$env_file" | cut -d'=' -f2)
        if [ -n "$token" ]; then
            echo "$token"
            return
        fi
    fi
    
    echo "" >&2
    echo "Error: GITHUB_TOKEN not found in .env file" >&2
    echo "Please create .env file in repo root with: GITHUB_TOKEN=ghp_xxx" >&2
    return 1
}

# GitHub API 基础 URL
GITHUB_API="https://api.github.com"

# 获取仓库信息
get_repo_info() {
    local repo_root="${REPO_ROOT:-$(git rev-parse --show-toplevel 2>/dev/null)}"
    local remote_url="$(git config --get remote.origin.url)"
    
    # 解析 owner 和 repo
    if [[ "$remote_url" =~ github.com[:/]([^/]+)/([^.]+) ]]; then
        REPO_OWNER="${BASH_REMATCH[1]}"
        REPO_NAME="${BASH_REMATCH[2]}"
        echo "$REPO_OWNER/$REPO_NAME"
    else
        echo "Error: Cannot parse remote URL: $remote_url" >&2
        return 1
    fi
}

# 创建 PR
# 参数：$1=标题，$2=描述，$3=head 分支，$4=base 分支（默认 main）
create_pr() {
    local title="$1"
    local body="$2"
    local head="$3"
    local base="${4:-main}"
    
    local token="$(get_token)"
    local repo="$(get_repo_info)"
    
    if [ -z "$token" ]; then
        echo "Error: GITHUB_TOKEN is required" >&2
        return 1
    fi
    
    if [ -z "$title" ] || [ -z "$head" ]; then
        echo "Error: title and head are required" >&2
        return 1
    fi
    
    # 调用 GitHub API 创建 PR
    local response=$(curl -s -X POST \
        -H "Authorization: token $token" \
        -H "Accept: application/vnd.github.v3+json" \
        "$GITHUB_API/repos/$repo/pulls" \
        -d "{
            \"title\": \"$title\",
            \"body\": \"$body\",
            \"head\": \"$head\",
            \"base\": \"$base\"
        }")
    
    # 解析响应
    local pr_number=$(echo "$response" | grep -o '"number": *[0-9]*' | grep -o '[0-9]*')
    local pr_url=$(echo "$response" | grep -o '"html_url": *"[^"]*"' | cut -d'"' -f4)
    local pr_state=$(echo "$response" | grep -o '"state": *"[^"]*"' | cut -d'"' -f4)
    
    if [ -n "$pr_number" ]; then
        echo "PR #$pr_number created: $pr_url"
        echo "$pr_number"
    else
        echo "Error: Failed to create PR" >&2
        echo "Response: $response" >&2
        return 1
    fi
}

# 合并 PR
# 参数：$1=PR 号，$2=合并方式（merge/squash/rebase，默认 merge）
merge_pr() {
    local pr_number="$1"
    local merge_method="${2:-merge}"
    
    local token="$(get_token)"
    local repo="$(get_repo_info)"
    
    if [ -z "$token" ]; then
        echo "Error: GITHUB_TOKEN is required" >&2
        return 1
    fi
    
    if [ -z "$pr_number" ]; then
        echo "Error: PR number is required" >&2
        return 1
    fi
    
    # 调用 GitHub API 合并 PR
    local response=$(curl -s -X PUT \
        -H "Authorization: token $token" \
        -H "Accept: application/vnd.github.v3+json" \
        "$GITHUB_API/repos/$repo/pulls/$pr_number/merge" \
        -d "{\"merge_method\": \"$merge_method\"}")
    
    # 解析响应
    local merged=$(echo "$response" | grep -o '"merged": *true' || echo "")
    local message=$(echo "$response" | grep -o '"message": *"[^"]*"' | cut -d'"' -f4)
    
    if [ -n "$merged" ]; then
        echo "PR #$pr_number merged successfully ($merge_method)"
        return 0
    else
        echo "Error: Failed to merge PR #$pr_number" >&2
        if [ -n "$message" ]; then
            echo "Message: $message" >&2
        fi
        echo "Response: $response" >&2
        return 1
    fi
}

# 获取 PR 状态
# 参数：$1=PR 号
get_pr_status() {
    local pr_number="$1"
    
    local token="$(get_token)"
    local repo="$(get_repo_info)"
    
    if [ -z "$token" ]; then
        echo "Error: GITHUB_TOKEN is required" >&2
        return 1
    fi
    
    if [ -z "$pr_number" ]; then
        echo "Error: PR number is required" >&2
        return 1
    fi
    
    # 调用 GitHub API 获取 PR 信息
    local response=$(curl -s \
        -H "Authorization: token $token" \
        -H "Accept: application/vnd.github.v3+json" \
        "$GITHUB_API/repos/$repo/pulls/$pr_number")
    
    echo "$response"
}

# 删除远程分支
# 参数：$1=分支名
delete_branch() {
    local branch="$1"
    
    local token="$(get_token)"
    local repo="$(get_repo_info)"
    
    if [ -z "$token" ]; then
        echo "Error: GITHUB_TOKEN is required" >&2
        return 1
    fi
    
    if [ -z "$branch" ]; then
        echo "Error: Branch name is required" >&2
        return 1
    fi
    
    # 调用 GitHub API 删除分支
    local response=$(curl -s -X DELETE \
        -H "Authorization: token $token" \
        -H "Accept: application/vnd.github.v3+json" \
        "$GITHUB_API/repos/$repo/git/refs/heads/$branch")
    
    if [ $? -eq 0 ]; then
        echo "Branch '$branch' deleted successfully"
        return 0
    else
        echo "Error: Failed to delete branch '$branch'" >&2
        echo "Response: $response" >&2
        return 1
    fi
}

# 如果直接执行脚本，根据参数调用相应函数
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
    case "$1" in
        create_pr)
            shift
            create_pr "$@"
            ;;
        merge_pr)
            shift
            merge_pr "$@"
            ;;
        get_pr_status)
            shift
            get_pr_status "$@"
            ;;
        delete_branch)
            shift
            delete_branch "$@"
            ;;
        *)
            echo "Usage: $0 {create_pr|merge_pr|get_pr_status|delete_branch} [args...]"
            echo ""
            echo "Commands:"
            echo "  create_pr <title> <body> <head_branch> [base_branch]"
            echo "  merge_pr <pr_number> [merge_method]"
            echo "  get_pr_status <pr_number>"
            echo "  delete_branch <branch_name>"
            exit 1
            ;;
    esac
fi
