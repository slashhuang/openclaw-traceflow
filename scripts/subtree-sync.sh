#!/bin/bash
# subtree-sync.sh - 同步所有 subtree 到最新上游版本
# 用法：./scripts/subtree-sync.sh [pull|push|status]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$REPO_ROOT"

# 定义 subtree 配置 (使用并行数组保证顺序)
# external-refs/openclaw 为外部参考代码，不纳入 subtree 同步
# openclaw-traceflow 上游: git@github.com:slashhuang/openclaw-traceflow.git（remote 名 openclaw-traceflow）
SUBTREE_DIRS=("claw-family" "futu-openD" "openclaw-traceflow")
SUBTREE_REMOTES=("claw-family-upstream" "futu-openD-upstream" "openclaw-traceflow")

# 获取上游分支名（可配置）
UPSTREAM_BRANCH="${UPSTREAM_BRANCH:-main}"
LOCAL_BRANCH="${LOCAL_BRANCH:-main}"

ensure_on_main() {
    local branch
    branch="$(git rev-parse --abbrev-ref HEAD)"
    if [[ "$branch" != "main" ]]; then
        echo "❌ 当前分支为 $branch，请切换到 main 后再执行"
        exit 1
    fi
}

ensure_clean_worktree() {
    if [[ -n "$(git status --porcelain)" ]]; then
        echo "❌ 工作区不干净，请先提交或暂存变更"
        exit 1
    fi
}

fetch_all() {
    echo "=== 拉取远端引用（fetch --all --prune）==="
    git fetch --all --prune
    echo ""
}

get_remote() {
    local dir="$1"
    for i in "${!SUBTREE_DIRS[@]}"; do
        if [[ "${SUBTREE_DIRS[$i]}" == "$dir" ]]; then
            echo "${SUBTREE_REMOTES[$i]}"
            return 0
        fi
    done
    return 1
}

is_valid_subtree() {
    local dir="$1"
    for d in "${SUBTREE_DIRS[@]}"; do
        if [[ "$d" == "$dir" ]]; then
            return 0
        fi
    done
    return 1
}

show_status() {
    echo "=== Subtree 状态 ==="
    echo ""
    for i in "${!SUBTREE_DIRS[@]}"; do
        dir="${SUBTREE_DIRS[$i]}"
        remote="${SUBTREE_REMOTES[$i]}"
        echo "📁 $dir"
        echo "   上游 remote: $remote"
        # 显示最后提交
        last_commit=$(git log -1 --format="%h %s" -- "$dir" 2>/dev/null || echo "N/A")
        echo "   本地最新：$last_commit"
        echo ""
    done
}

subtree_publish_precheck() {
    local dir="$1"
    local remote="$2"
    local upstream="${3:-$UPSTREAM_BRANCH}"
    local remote_ref="$remote/$upstream"

    if ! git rev-parse "$remote_ref" >/dev/null 2>&1; then
        # 远端分支不存在，允许首次推送
        return 0
    fi

    local split_sha
    if ! split_sha="$(git subtree split --prefix "$dir" HEAD)"; then
        echo "❌ $dir split 失败，无法进行推送预检查"
        return 2
    fi

    if git merge-base --is-ancestor "$remote_ref" "$split_sha"; then
        return 0
    fi

    return 1
}

sync_before_push_if_needed() {
    local dir="$1"
    local remote="$2"
    local upstream="${3:-$UPSTREAM_BRANCH}"
    if subtree_publish_precheck "$dir" "$remote" "$upstream"; then
        return 0
    fi

    local rc=$?
    if [[ $rc -eq 2 ]]; then
        return 1
    fi

    echo "⚠️  检测到 $dir 上游领先/分叉，先执行 subtree pull --squash"
    git subtree pull --prefix "$dir" "$remote" "$upstream" --squash
}

pull_all() {
    ensure_on_main
    ensure_clean_worktree
    fetch_all
    echo "=== 从上游拉取所有 subtree ==="
    echo ""
    for i in "${!SUBTREE_DIRS[@]}"; do
        dir="${SUBTREE_DIRS[$i]}"
        remote="${SUBTREE_REMOTES[$i]}"
        echo "🔄 拉取 $dir 从 $remote..."
        git subtree pull --prefix "$dir" "$remote" "$UPSTREAM_BRANCH" --squash || {
            echo "⚠️  $dir 拉取失败，继续下一个..."
        }
        echo ""
    done
    echo "✅ 全部拉取完成"
}

push_all() {
    ensure_on_main
    ensure_clean_worktree
    fetch_all
    echo "=== 推送所有 subtree 到上游 ==="
    echo ""
    echo "⚠️  警告：这将推送所有有变更的 subtree 到各自的上游仓库"
    read -p "确认继续？(y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "已取消"
        return 1
    fi

    for i in "${!SUBTREE_DIRS[@]}"; do
        dir="${SUBTREE_DIRS[$i]}"
        remote="${SUBTREE_REMOTES[$i]}"
        sync_before_push_if_needed "$dir" "$remote" "$UPSTREAM_BRANCH" || {
            echo "⚠️  $dir 预同步失败，继续下一个..."
            continue
        }
        # 检查是否有未推送的变更
        if git log "origin/$LOCAL_BRANCH".."$LOCAL_BRANCH" -- "$dir" --quiet 2>/dev/null; then
            echo "🔄 推送 $dir 到 $remote..."
            git subtree push --prefix "$dir" "$remote" "$UPSTREAM_BRANCH" || {
                echo "⚠️  $dir 推送失败，继续下一个..."
            }
        else
            echo "⏭️  $dir 没有未推送的变更"
        fi
    done
    echo "✅ 全部推送完成"
}

sync_one() {
    local dir="$1"
    local action="${2:-pull}"

    if ! is_valid_subtree "$dir"; then
        echo "❌ 未知的 subtree: $dir"
        echo "可用的 subtree: ${SUBTREE_DIRS[*]}"
        return 1
    fi

    remote=$(get_remote "$dir")
    ensure_on_main
    ensure_clean_worktree
    fetch_all

    if [[ "$action" == "pull" ]]; then
        echo "🔄 拉取 $dir 从 $remote..."
        git subtree pull --prefix "$dir" "$remote" "$UPSTREAM_BRANCH" --squash
    else
        sync_before_push_if_needed "$dir" "$remote" "$UPSTREAM_BRANCH"
        echo "🔄 推送 $dir 到 $remote..."
        git subtree push --prefix "$dir" "$remote" "$UPSTREAM_BRANCH"
    fi
}

show_help() {
    echo "用法：$0 [command] [options]"
    echo ""
    echo "Commands:"
    echo "  status          显示所有 subtree 状态"
    echo "  pull [all]      从上游拉取所有 subtree 更新"
    echo "  push [all]      推送所有 subtree 到上游"
    echo "  sync <dir>      同步单个 subtree (默认 pull)"
    echo "  sync <dir> push 推送单个 subtree 到上游"
    echo ""
    echo "环境变量:"
    echo "  UPSTREAM_BRANCH 上游分支名 (默认：main)"
    echo "  LOCAL_BRANCH    本地分支名 (默认：main)"
    echo ""
    echo "示例:"
    echo "  $0 status"
    echo "  $0 pull"
    echo "  $0 sync claw-family"
    echo "  $0 sync claw-family push"
}

# 主逻辑
case "${1:-status}" in
    status)
        show_status
        ;;
    pull|all)
        pull_all
        ;;
    push)
        push_all
        ;;
    sync)
        if [[ -z "$2" ]]; then
            echo "❌ 请指定 subtree 目录"
            show_help
            exit 1
        fi
        sync_one "$2" "${3:-pull}"
        ;;
    help|-h|--help)
        show_help
        ;;
    *)
        echo "❌ 未知命令：$1"
        show_help
        exit 1
        ;;
esac
