#!/usr/bin/env python3
"""
代码同步脚本（增强版：支持主仓库 + Subtree 同步）
等同于 ./bootstrap.sh 的核心流程

用法：
    python3 sync.py [--dry-run]
    
触发方式：
    - 直接运行此脚本
    - 通过 skills/code-sync/scripts/sync.sh 调用
    - 用户说「更新代码」、「同步代码」、「拉代码」
"""

import json
import os
import subprocess
import sys
from datetime import datetime
from pathlib import Path


def get_repo_root():
    """获取仓库根目录（脚本所在目录的 ../../..）"""
    script_dir = Path(__file__).parent
    # 脚本路径：claw-family/skills/code-sync/scripts/sync.py
    # 仓库根目录：向上 5 级
    return (script_dir / "../../../..").resolve()


def get_workspace_root(repo_root):
    """获取 workspace 目录"""
    return repo_root / "claw-family" / "openClawRuntime" / ".workspace"


def run_command(cmd, cwd=None, capture_output=False, timeout=120):
    """运行 shell 命令（兼容 Python 3.6）"""
    try:
        kwargs = {
            'shell': True,
            'cwd': cwd,
            'universal_newlines': True,
            'timeout': timeout
        }
        if capture_output:
            kwargs['stdout'] = subprocess.PIPE
            kwargs['stderr'] = subprocess.PIPE
        
        result = subprocess.run(cmd, **kwargs)
        return result.returncode == 0, result.stdout, result.stderr
    except subprocess.TimeoutExpired:
        return False, "", "命令执行超时"
    except Exception as e:
        return False, "", str(e)


def get_current_branch(repo_root):
    success, stdout, _ = run_command(
        "git rev-parse --abbrev-ref HEAD",
        cwd=repo_root,
        capture_output=True,
    )
    return stdout.strip() if success else "unknown"


def ensure_clean_worktree(repo_root):
    """确保工作区干净，避免同步过程中混入未提交修改"""
    success, stdout, stderr = run_command(
        "git status --porcelain",
        cwd=repo_root,
        capture_output=True,
    )
    if not success:
        return {
            "success": False,
            "message": (stderr or "failed to inspect working tree").strip(),
        }
    if stdout.strip():
        return {
            "success": False,
            "message": "working tree is not clean; please commit/stash changes first",
        }
    return {"success": True, "message": "working tree clean"}


def fetch_all_remotes(repo_root):
    """同步所有远端引用，保证双机/多端场景的判断基于最新远端状态"""
    print("[code-sync] === 拉取远端引用（fetch --all --prune） ===")
    success, stdout, stderr = run_command(
        "git fetch --all --prune",
        cwd=repo_root,
        capture_output=True,
        timeout=300,
    )
    if success:
        msg = (stdout or "").strip()
        print("[code-sync] ✅ fetch 完成")
        if msg:
            print(f"[code-sync] {msg}")
        print("")
        return {"success": True, "message": msg or "fetch --all --prune done"}

    err = (stderr or stdout or "git fetch failed").strip()
    print(f"[code-sync] ❌ fetch 失败：{err}")
    print("")
    return {"success": False, "message": err}


def get_commit_short(repo_root, ref="HEAD"):
    """获取短 commit hash"""
    success, stdout, _ = run_command(f"git rev-parse --short {ref}", cwd=repo_root, capture_output=True)
    return stdout.strip() if success else "unknown"


def get_commit_full(repo_root, ref="HEAD"):
    """获取完整 commit hash"""
    success, stdout, _ = run_command(f"git rev-parse {ref}", cwd=repo_root, capture_output=True)
    return stdout.strip() if success else "unknown"


def sync_main_repo(repo_root):
    """
    同步主仓库（git pull --ff-only）
    返回：{success, beforeCommit, afterCommit, message}
    """
    print("[code-sync] === 同步主仓库 ===")
    before_commit = get_commit_short(repo_root)
    print(f"[code-sync] 同步前 commit: {before_commit}")
    
    success, stdout, stderr = run_command("git pull --ff-only", cwd=repo_root)
    
    after_commit = get_commit_short(repo_root)
    
    if success:
        print(f"[code-sync] ✅ 主仓库同步成功：{before_commit} → {after_commit}")
        msg = (stdout or "").strip()
        if msg:
            print(f"[code-sync] {msg}")
        return {
            "success": True,
            "beforeCommit": before_commit,
            "afterCommit": after_commit,
            "message": msg or "Fast-forward"
        }
    else:
        print(f"[code-sync] ❌ 主仓库同步失败：{stderr}")
        return {
            "success": False,
            "beforeCommit": before_commit,
            "afterCommit": after_commit,
            "message": (stderr or "git pull failed").strip()
        }


# Subtree 配置：目录 -> remote 名 -> 上游 URL
# 说明：若 remote 不存在，会按 expected_url 自动创建。
SUBTREE_CONFIG = [
    {
        "dir": "claw-family",
        "remote": "claw-family-upstream",
        "expected_url": "git@github.com:slashhuang/claw-family.git",
        "branch": "main",
    },
    {
        "dir": "futu-openD",
        "remote": "futu-openD-upstream",
        "expected_url": "git@github.com:slashhuang/futu-openD.git",
        "branch": "main",
    },
    {
        "dir": "openclaw-traceflow",
        "remote": "openclaw-traceflow",
        "expected_url": "git@github.com:slashhuang/openclaw-traceflow.git",
        "branch": "main",
    },
]


def normalize_git_url(url):
    """规范化 git URL，便于比较"""
    if not url:
        return ""
    u = url.strip()
    if u.endswith(".git"):
        u = u[:-4]
    return u.lower()


def get_remote_url(repo_root, remote_name):
    success, stdout, _ = run_command(
        f"git remote get-url {remote_name}",
        cwd=repo_root,
        capture_output=True,
    )
    return stdout.strip() if success else None


def ensure_remote(repo_root, remote_name, expected_url):
    """
    确保 remote 存在且 URL 正确。
    - 不存在：自动 add
    - 存在但 URL 不一致：自动 set-url
    """
    if not expected_url:
        return {
            "success": False,
            "remote": remote_name,
            "message": f"missing expected_url for {remote_name}",
        }

    current_url = get_remote_url(repo_root, remote_name)
    if current_url is None:
        ok, _, err = run_command(
            f"git remote add {remote_name} {expected_url}",
            cwd=repo_root,
            capture_output=True,
        )
        if not ok:
            return {
                "success": False,
                "remote": remote_name,
                "message": (err or "git remote add failed").strip(),
            }
        return {
            "success": True,
            "remote": remote_name,
            "message": f"added remote {remote_name} -> {expected_url}",
        }

    if normalize_git_url(current_url) == normalize_git_url(expected_url):
        return {
            "success": True,
            "remote": remote_name,
            "message": f"remote {remote_name} already configured",
        }

    ok, _, err = run_command(
        f"git remote set-url {remote_name} {expected_url}",
        cwd=repo_root,
        capture_output=True,
    )
    if not ok:
        return {
            "success": False,
            "remote": remote_name,
            "message": (err or "git remote set-url failed").strip(),
        }
    return {
        "success": True,
        "remote": remote_name,
        "message": f"updated remote {remote_name}: {current_url} -> {expected_url}",
    }


def ensure_subtree_remotes(repo_root):
    """
    为所有 subtree 校准 upstream remotes。
    返回：[{dir, remote, success, message}, ...]
    """
    print("[code-sync] === 校准 Subtree upstream remotes ===")
    results = []
    for config in SUBTREE_CONFIG:
        remote_name = config["remote"]
        expected_url = config.get("expected_url", "").strip()
        expected_url_env = config.get("expected_url_env", "").strip()
        if expected_url_env:
            expected_url = os.environ.get(expected_url_env, "").strip() or expected_url

        # 若未给默认 URL，但本地已配置 remote，则沿用本地配置（避免阻断同步流程）。
        if not expected_url:
            existing_url = get_remote_url(repo_root, remote_name)
            if existing_url:
                expected_url = existing_url

        result = ensure_remote(repo_root, remote_name, expected_url)
        row = {
            "dir": config["dir"],
            "remote": remote_name,
            "success": result["success"],
            "message": result["message"],
        }
        results.append(row)
        icon = "✅" if row["success"] else "❌"
        print(f"[code-sync] {icon} {config['dir']} -> {remote_name}: {row['message']}")
    print("")
    return results


def get_ref_sha(repo_root, ref):
    success, stdout, _ = run_command(
        f"git rev-parse {ref}",
        cwd=repo_root,
        capture_output=True,
    )
    return stdout.strip() if success else None


def get_subtree_split_sha(repo_root, subtree_dir):
    """
    用于预检的 subtree split。若历史中重复出现带相同 git-subtree-mainline 的 Split 提交，
    默认 split 会报「cache for … already exists」；此时回退到 --ignore-joins。
    """
    success, stdout, stderr = run_command(
        f"git subtree split --prefix {subtree_dir} HEAD",
        cwd=repo_root,
        capture_output=True,
        timeout=300,
    )
    if success:
        out = (stdout or "").strip().split()
        if out:
            return out[-1], None
        return None, "subtree split returned empty"
    err = (stderr or "").strip() or (stdout or "").strip()
    if "already exists" in err:
        success2, stdout2, stderr2 = run_command(
            f"git subtree split --ignore-joins --prefix {subtree_dir} HEAD",
            cwd=repo_root,
            capture_output=True,
            timeout=600,
        )
        if success2:
            out = (stdout2 or "").strip().split()
            if out:
                return out[-1], None
            return None, "subtree split --ignore-joins returned empty"
        return None, (stderr2 or "subtree split --ignore-joins failed").strip()
    return None, err or "subtree split failed"


def subtree_publish_precheck(repo_root, subtree_dir, remote_name, upstream_branch):
    """
    检查 remote/<branch> 是否为本地 subtree split 的祖先。
    若不是，说明上游领先或发生分叉，直接 push 大概率被拒绝。
    """
    remote_ref = f"{remote_name}/{upstream_branch}"
    remote_sha = get_ref_sha(repo_root, remote_ref)
    if not remote_sha:
        return {
            "success": True,
            "safe_to_push": True,
            "message": f"{remote_ref} missing; first push is allowed",
        }

    split_sha, split_err = get_subtree_split_sha(repo_root, subtree_dir)
    if not split_sha:
        return {
            "success": False,
            "safe_to_push": False,
            "message": f"failed to split {subtree_dir}: {split_err}",
        }

    # merge-base --is-ancestor A B: A 是否是 B 的祖先
    ok, _, _ = run_command(
        f"git merge-base --is-ancestor {remote_sha} {split_sha}",
        cwd=repo_root,
        capture_output=True,
    )
    if ok:
        return {
            "success": True,
            "safe_to_push": True,
            "message": f"{remote_ref} is ancestor of local split",
        }

    return {
        "success": True,
        "safe_to_push": False,
        "message": f"{remote_ref} is ahead/diverged from local split",
    }


def _tmp_push_branch_name(subtree_dir):
    return "tmp-cs-push-" + subtree_dir.replace("/", "-").replace("\\", "-")


def push_subtree_ignore_joins_fallback(repo_root, subtree_dir, remote_name, upstream_branch):
    """
    git subtree push 在「重复 Split 元数据」等情况下会报 cache already exists。
    使用 split --ignore-joins 生成分支，merge 远端后用 -X ours 保留 monorepo 侧树，再推送。
    """
    branch = _tmp_push_branch_name(subtree_dir)
    prev = get_current_branch(repo_root)
    remote_ref = f"{remote_name}/{upstream_branch}"
    try:
        run_command(
            f"git fetch {remote_name} {upstream_branch}",
            cwd=repo_root,
            capture_output=True,
            timeout=120,
        )
        run_command(f"git branch -D {branch}", cwd=repo_root, capture_output=True)
        ok, _, err = run_command(
            f"git subtree split --ignore-joins --prefix {subtree_dir} -b {branch} HEAD",
            cwd=repo_root,
            capture_output=True,
            timeout=600,
        )
        if not ok:
            return False, (err or "subtree split --ignore-joins failed").strip()

        ok2, _, err2 = run_command(
            f"git checkout {branch}",
            cwd=repo_root,
            capture_output=True,
        )
        if not ok2:
            return False, (err2 or "checkout split branch failed").strip()

        ok3, _, err3 = run_command(
            f'git merge -X ours {remote_ref} -m "merge: align with {remote_ref} (code-sync ignore-joins push)"',
            cwd=repo_root,
            capture_output=True,
            timeout=120,
        )
        if not ok3:
            run_command("git merge --abort", cwd=repo_root, capture_output=True)
            return False, (err3 or "merge before push failed").strip()

        ok4, out4, err4 = run_command(
            f"git push {remote_name} {branch}:{upstream_branch}",
            cwd=repo_root,
            capture_output=True,
            timeout=300,
        )
        if ok4:
            msg = (out4 or "").strip().split("\n")[-1][:120] or "pushed via ignore-joins fallback"
            return True, msg
        return False, (err4 or out4 or "git push failed").strip()
    finally:
        run_command(f"git checkout {prev}", cwd=repo_root, capture_output=True)
        run_command(f"git branch -D {branch}", cwd=repo_root, capture_output=True)


def sync_subtree(repo_root, subtree_dir, remote_name, upstream_branch="main"):
    """
    同步单个 subtree
    返回：{success, beforeCommit, afterCommit, message}
    """
    print(f"[code-sync] 🔄 同步 subtree: {subtree_dir} (from {remote_name}/{upstream_branch})")
    
    # 获取同步前的 commit
    before_commit = get_commit_short(repo_root, f"HEAD:{subtree_dir}")
    print(f"[code-sync]   同步前 commit: {before_commit}")
    
    # 执行 subtree pull
    cmd = f"git subtree pull --prefix {subtree_dir} {remote_name} {upstream_branch} --squash"
    success, stdout, stderr = run_command(cmd, cwd=repo_root, timeout=300)
    
    # 获取同步后的 commit
    after_commit = get_commit_short(repo_root, f"HEAD:{subtree_dir}")
    
    if success:
        print(f"[code-sync]   ✅ 同步成功：{before_commit} → {after_commit}")
        # 提取 squash commit 信息
        message = (stdout or "").strip().split('\n')[-1][:100] or "Squashed update"
        print(f"[code-sync]   {message}")
        return {
            "success": True,
            "dir": subtree_dir,
            "remote": remote_name,
            "beforeCommit": before_commit,
            "afterCommit": after_commit,
            "message": message
        }
    else:
        # 检查是否是无更新的情况
        error_msg = (stderr or "").strip() or (stdout or "").strip()
        if "already up-to-date" in error_msg.lower() or "can't squash-merge a fast-forward" in error_msg.lower():
            print(f"[code-sync]   ⏭️  无需更新（已是最新）")
            return {
                "success": True,
                "dir": subtree_dir,
                "remote": remote_name,
                "beforeCommit": before_commit,
                "afterCommit": before_commit,
                "message": "Already up-to-date"
            }
        else:
            print(f"[code-sync]   ❌ 同步失败：{error_msg}")
            return {
                "success": False,
                "dir": subtree_dir,
                "remote": remote_name,
                "beforeCommit": before_commit,
                "afterCommit": after_commit,
                "message": error_msg[:200]
            }


def sync_all_subtrees(repo_root):
    """
    同步所有 subtree（pull）
    返回：[subtree_result, ...]
    """
    print("[code-sync] === 同步 Subtree 项目（pull） ===")
    results = []
    
    for config in SUBTREE_CONFIG:
        result = sync_subtree(
            repo_root,
            config["dir"],
            config["remote"],
            config.get("branch", "main"),
        )
        results.append(result)
        print("")  # 空行分隔
    
    return results


def has_unpushed_commits(repo_root, subtree_dir, remote_name, upstream_branch="main"):
    """检查 subtree 目录是否有未推送的提交（对比 subtree 远端）"""
    # 检查是否有针对该目录的未推送提交
    success, stdout, _ = run_command(
        f"git log {remote_name}/{upstream_branch}..main --pretty=format:'%h' -- {subtree_dir}",
        cwd=repo_root,
        capture_output=True
    )
    return success and bool(stdout.strip())


def push_subtree(repo_root, subtree_dir, remote_name, upstream_branch="main"):
    """
    推送 subtree 到上游
    返回：{success, message}
    """
    print(f"[code-sync] 🔄 推送 subtree: {subtree_dir} (to {remote_name}/{upstream_branch})")
    
    precheck = subtree_publish_precheck(repo_root, subtree_dir, remote_name, upstream_branch)
    if not precheck["success"]:
        print(f"[code-sync]   ❌ 预检查失败：{precheck['message']}")
        return {
            "success": False,
            "dir": subtree_dir,
            "remote": remote_name,
            "pushed": False,
            "message": precheck["message"][:200],
        }
    if not precheck["safe_to_push"]:
        print(f"[code-sync]   ⚠️  检测到上游领先，先执行 subtree pull --squash: {precheck['message']}")
        pull_cmd = f"git subtree pull --prefix {subtree_dir} {remote_name} {upstream_branch} --squash"
        pull_ok, pull_out, pull_err = run_command(pull_cmd, cwd=repo_root, timeout=300)
        if not pull_ok:
            pull_msg = (pull_err or pull_out or "subtree pull before push failed").strip()
            print(f"[code-sync]   ❌ 预同步失败：{pull_msg}")
            return {
                "success": False,
                "dir": subtree_dir,
                "remote": remote_name,
                "pushed": False,
                "message": f"pre-push subtree pull failed: {pull_msg[:160]}",
            }
        print(f"[code-sync]   ✅ 预同步完成，继续推送")

    # 检查是否有未推送的提交
    if not has_unpushed_commits(repo_root, subtree_dir, remote_name, upstream_branch):
        print(f"[code-sync]   ⏭️  无需推送（无本地修改）")
        return {
            "success": True,
            "dir": subtree_dir,
            "remote": remote_name,
            "pushed": False,
            "message": "No local changes to push"
        }
    
    # 执行 subtree push
    cmd = f"git subtree push --prefix {subtree_dir} {remote_name} {upstream_branch}"
    success, stdout, stderr = run_command(cmd, cwd=repo_root, timeout=300)
    
    if success:
        print(f"[code-sync]   ✅ 推送成功")
        msg = (stdout or "").strip().split('\n')[-1][:100] or "Pushed successfully"
        print(f"[code-sync]   {msg}")
        return {
            "success": True,
            "dir": subtree_dir,
            "remote": remote_name,
            "pushed": True,
            "message": msg
        }
    else:
        error_msg = (stderr or "").strip() or (stdout or "").strip()
        if "already exists" in error_msg or "cache for" in error_msg:
            print(
                "[code-sync]   ⚠️  subtree push 报 cache 冲突（多为重复 Split 元数据），"
                "尝试 ignore-joins + merge 后推送…"
            )
            fb_ok, fb_msg = push_subtree_ignore_joins_fallback(
                repo_root, subtree_dir, remote_name, upstream_branch
            )
            if fb_ok:
                print("[code-sync]   ✅ 推送成功（ignore-joins fallback）")
                print(f"[code-sync]   {fb_msg[:200]}")
                return {
                    "success": True,
                    "dir": subtree_dir,
                    "remote": remote_name,
                    "pushed": True,
                    "message": fb_msg[:200],
                }
            print(f"[code-sync]   ❌ fallback 仍失败：{fb_msg[:300]}")
        print(f"[code-sync]   ❌ 推送失败：{error_msg}")
        return {
            "success": False,
            "dir": subtree_dir,
            "remote": remote_name,
            "pushed": False,
            "message": error_msg[:200]
        }


def push_all_subtrees(repo_root):
    """
    推送所有有本地修改的 subtree
    返回：[push_result, ...]
    """
    print("[code-sync] === 推送 Subtree 项目（push） ===")
    results = []
    
    for config in SUBTREE_CONFIG:
        result = push_subtree(
            repo_root,
            config["dir"],
            config["remote"],
            config.get("branch", "main"),
        )
        results.append(result)
        print("")  # 空行分隔
    
    return results





def cleanup_worktrees(repo_root):
    """调用 cleanup_worktree.py 清理已合并的 worktree"""
    print("[code-sync] === 清理已合并的 worktree ===")
    
    cleanup_script = Path(__file__).parent / "cleanup_worktree.py"
    if not cleanup_script.exists():
        print("[code-sync] 警告：cleanup_worktree.py 不存在，跳过清理")
        return None
    
    success, stdout, stderr = run_command(
        f"python3 {cleanup_script}",
        cwd=repo_root,
        capture_output=True
    )
    
    if success:
        print(f"[code-sync] {stdout}")
    else:
        print(f"[code-sync] 清理失败：{stderr}")
    
    # 读取通知文件
    notification_file = repo_root / ".workspace" / ".worktree_cleanup_notification.json"
    if notification_file.exists():
        try:
            with open(str(notification_file), 'r') as f:
                notification_data = json.load(f)
            # 删除通知文件（避免重复通知）
            os.remove(str(notification_file))
            return notification_data
        except Exception as e:
            print(f"[code-sync] 读取通知文件失败：{e}")
    
    return None


def generate_report(main_result, subtree_results, gateway_result, cleanup_result, push_results=None, remote_results=None):
    """生成同步报告"""
    report = {
        "timestamp": datetime.now().astimezone().isoformat(),
        "mainRepo": main_result,
        "subtrees": subtree_results,
        "subtreesPush": push_results or [],  # push 结果
        "subtreeRemotes": remote_results or [],  # remote 校准结果
        "gatewayRestart": gateway_result,  # None 表示未重启
        "worktreeCleanup": cleanup_result
    }
    return report


def save_report(repo_root, report):
    """保存报告到文件"""
    workspace = get_workspace_root(repo_root)
    report_file = workspace / ".sync_report.json"
    
    try:
        workspace.mkdir(parents=True, exist_ok=True)
        with open(str(report_file), 'w', encoding='utf-8') as f:
            json.dump(report, f, ensure_ascii=False, indent=2)
        print(f"[code-sync] 报告已保存：{report_file}")
        return True
    except Exception as e:
        print(f"[code-sync] 保存报告失败：{e}")
        return False


def print_summary(report):
    """打印同步摘要"""
    print("")
    print("=" * 60)
    print("[code-sync] 📊 同步摘要")
    print("=" * 60)
    
    # 主仓库
    main = report["mainRepo"]
    if main["success"]:
        print(f"✅ 主仓库：{main['beforeCommit']} → {main['afterCommit']}")
    else:
        print(f"❌ 主仓库：{main['message']}")
    
    # Subtree Pull
    print("")
    print("Subtree Pull（从上游拉取）:")
    for st in report["subtrees"]:
        status = "✅" if st["success"] else "❌"
        if st["beforeCommit"] == st["afterCommit"]:
            print(f"  {status} {st['dir']}: 无更新")
        else:
            print(f"  {status} {st['dir']}: {st['beforeCommit']} → {st['afterCommit']}")
    
    # Subtree Push
    push_results = report.get("subtreesPush", [])
    if push_results:
        print("")
        print("Subtree Push（推送到上游）:")
        for pr in push_results:
            if pr.get("pushed"):
                print(f"  ✅ {pr['dir']}: 已推送到 {pr['remote']}")
            else:
                print(f"  ⏭️  {pr['dir']}: 无本地修改")
    
    # Worktree 清理
    cleanup = report.get("worktreeCleanup")
    if cleanup and cleanup.get("cleaned"):
        print(f"✅ Worktree 清理：{len(cleanup['cleaned'])} 个")
    
    print("")
    print("=" * 60)


def main():
    dry_run = "--dry-run" in sys.argv
    
    repo_root = get_repo_root()
    print(f"[code-sync] 仓库根目录：{repo_root}")
    print("[code-sync] 开始同步代码...")
    print("")
    
    if dry_run:
        print("[code-sync] 干跑模式，不执行实际操作")
        return

    branch = get_current_branch(repo_root)
    if branch != "main":
        print(f"[code-sync] ❌ 当前分支为 {branch}，请切换到 main 后再执行。")
        sys.exit(1)

    clean_check = ensure_clean_worktree(repo_root)
    if not clean_check["success"]:
        print(f"[code-sync] ❌ {clean_check['message']}")
        sys.exit(1)

    fetch_result = fetch_all_remotes(repo_root)
    if not fetch_result["success"]:
        sys.exit(1)
    
    # 1. 同步主仓库
    main_result = sync_main_repo(repo_root)
    print("")
    
    # 2. 同步所有 subtree（pull）
    remote_results = ensure_subtree_remotes(repo_root)
    if any(not r["success"] for r in remote_results):
        print("[code-sync] ❌ 部分 subtree remote 校准失败，跳过 subtree pull/push，请先修复 remote 配置。")
        report = generate_report(main_result, [], None, None, [], remote_results)
        save_report(repo_root, report)
        print_summary(report)
        print("")
        print(f"[SYNC_REPORT] {json.dumps(report, ensure_ascii=False)}")
        sys.exit(1)

    # 3. 同步所有 subtree（pull）
    subtree_results = sync_all_subtrees(repo_root)
    
    # 4. 推送本地修改到上游 subtree（push）
    push_results = push_all_subtrees(repo_root)
    
    # 5. 清理已合并的 worktree
    cleanup_result = cleanup_worktrees(repo_root)
    print("")
    
    # 6. 生成并保存报告（不再重启 Gateway）
    report = generate_report(main_result, subtree_results, None, cleanup_result, push_results, remote_results)
    save_report(repo_root, report)
    
    # 7. 打印摘要
    print_summary(report)
    
    # 8. 输出完整报告（供 OpenClaw 检测并发送通知）
    print("")
    print(f"[SYNC_REPORT] {json.dumps(report, ensure_ascii=False)}")
    
    print("")
    print("[code-sync] ✅ 代码同步完成！如需重启 Gateway，请执行：./skills/claw-family-restart/scripts/restart.sh")


if __name__ == "__main__":
    main()
