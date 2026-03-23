#!/usr/bin/env python3
"""
代码同步与 Gateway 重启脚本（增强版：支持主仓库 + Subtree 同步）
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
        if stdout.strip():
            print(f"[code-sync] {stdout.strip()}")
        return {
            "success": True,
            "beforeCommit": before_commit,
            "afterCommit": after_commit,
            "message": stdout.strip() or "Fast-forward"
        }
    else:
        print(f"[code-sync] ❌ 主仓库同步失败：{stderr}")
        return {
            "success": False,
            "beforeCommit": before_commit,
            "afterCommit": after_commit,
            "message": stderr.strip() or "git pull failed"
        }


# Subtree 配置：目录 -> remote 名
SUBTREE_CONFIG = [
    {"dir": "claw-family", "remote": "claw-family-upstream"},
    {"dir": "futu-openD", "remote": "futu-openD-upstream"},
    {"dir": "openclaw-traceflow", "remote": "openclaw-traceflow"},
    {"dir": "external-refs/openclaw", "remote": "openclaw-upstream"},
]


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
        message = stdout.strip().split('\n')[-1][:100] if stdout.strip() else "Squashed update"
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
        error_msg = stderr.strip() if stderr.strip() else stdout.strip()
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
    同步所有 subtree
    返回：[subtree_result, ...]
    """
    print("[code-sync] === 同步 Subtree 项目 ===")
    results = []
    
    for config in SUBTREE_CONFIG:
        result = sync_subtree(repo_root, config["dir"], config["remote"])
        results.append(result)
        print("")  # 空行分隔
    
    return results


def check_pm2():
    """检查 PM2 是否安装"""
    success, _, _ = run_command("which pm2")
    if not success:
        print("[code-sync] 错误：未找到 pm2。请安装：npm i -g pm2")
        return False
    return True


def restart_gateway(repo_root):
    """重启或启动 Gateway"""
    print("[code-sync] === 重启 Gateway ===")
    
    # 检查是否已存在
    success, stdout, _ = run_command("pm2 describe claw-gateway", cwd=repo_root, capture_output=True)
    
    if success and "online" in stdout:
        print("[code-sync] 重启 claw-gateway...")
        success, stdout, stderr = run_command("pm2 restart claw-gateway", cwd=repo_root)
        action = "restart"
    else:
        print("[code-sync] 启动 claw-gateway...")
        success, stdout, stderr = run_command("pm2 start ecosystem.config.cjs", cwd=repo_root)
        action = "start"
    
    if not success:
        print(f"[code-sync] ❌ PM2 操作失败：{stderr}")
        return {"success": False, "action": action, "message": stderr.strip()}
    
    print(f"[code-sync] ✅ Gateway 已 {action}")
    return {"success": True, "action": action, "message": f"Gateway {action} successfully"}


def wait_and_verify(repo_root):
    """等待启动并验证"""
    import time
    print("[code-sync] 等待 Gateway 启动...")
    time.sleep(3)
    
    success, stdout, _ = run_command("pm2 describe claw-gateway", cwd=repo_root, capture_output=True)
    
    if success and "online" in stdout:
        return True
    else:
        print("[code-sync] 警告：Gateway 可能未正常启动")
        return False


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


def generate_report(main_result, subtree_results, gateway_result, cleanup_result):
    """生成同步报告"""
    report = {
        "timestamp": datetime.now().astimezone().isoformat(),
        "mainRepo": main_result,
        "subtrees": subtree_results,
        "gatewayRestart": gateway_result,
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
    
    # Subtree
    print("")
    print("Subtree 项目:")
    for st in report["subtrees"]:
        status = "✅" if st["success"] else "❌"
        if st["beforeCommit"] == st["afterCommit"]:
            print(f"  {status} {st['dir']}: 无更新")
        else:
            print(f"  {status} {st['dir']}: {st['beforeCommit']} → {st['afterCommit']}")
    
    # Gateway
    gw = report["gatewayRestart"]
    if gw["success"]:
        print(f"✅ Gateway: 已{gw['action']}")
    else:
        print(f"❌ Gateway: {gw['message']}")
    
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
    
    # 1. 同步主仓库
    main_result = sync_main_repo(repo_root)
    print("")
    
    # 2. 同步所有 subtree
    subtree_results = sync_all_subtrees(repo_root)
    
    # 3. 清理已合并的 worktree
    cleanup_result = cleanup_worktrees(repo_root)
    print("")
    
    # 4. 检查 PM2
    if not check_pm2():
        sys.exit(1)
    
    # 5. 重启 Gateway
    gateway_result = restart_gateway(repo_root)
    
    # 6. 验证启动
    if not wait_and_verify(repo_root):
        print("[code-sync] 请检查 pm2 logs claw-gateway")
        sys.exit(1)
    
    # 7. 生成并保存报告
    report = generate_report(main_result, subtree_results, gateway_result, cleanup_result)
    save_report(repo_root, report)
    
    # 8. 打印摘要
    print_summary(report)
    
    # 9. 输出完整报告（供 OpenClaw 检测并发送通知）
    print("")
    print(f"[SYNC_REPORT] {json.dumps(report, ensure_ascii=False)}")
    
    print("")
    print("[code-sync] 完成。维护命令：pm2 status | pm2 logs claw-gateway | pm2 restart claw-gateway")


if __name__ == "__main__":
    main()
