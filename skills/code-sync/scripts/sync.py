#!/usr/bin/env python3
"""
代码同步与 Gateway 重启脚本
等同于 ./bootstrap.sh 的核心流程

用法：
    python3 sync.py [--dry-run]
    
触发方式：
    - 直接运行此脚本
    - 通过 skills/code-sync/scripts/sync.sh 调用
"""

import json
import os
import subprocess
import sys
from pathlib import Path


def get_repo_root():
    """获取仓库根目录（脚本所在目录的 ../../..）"""
    script_dir = Path(__file__).parent
    return (script_dir / "../../..").resolve()


def run_command(cmd, cwd=None, capture_output=False):
    """运行 shell 命令（兼容 Python 3.6）"""
    try:
        # Python 3.6 不支持 capture_output 参数，需显式指定 stdout/stderr
        kwargs = {
            'shell': True,
            'cwd': cwd,
            'universal_newlines': True,
            'timeout': 120
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


def git_pull(repo_root):
    """同步代码"""
    print("[code-sync] 同步代码...")
    success, stdout, stderr = run_command("git pull --ff-only", cwd=repo_root)
    
    if success:
        # 获取当前 commit
        _, commit, _ = run_command("git rev-parse HEAD", cwd=repo_root, capture_output=True)
        commit = commit.strip()[:7] if commit else "unknown"
        print(f"[code-sync] 当前 commit: {commit}")
        return True, commit
    else:
        print(f"[code-sync] 代码同步失败：{stderr}")
        return False, None


def check_pm2():
    """检查 PM2 是否安装"""
    success, _, _ = run_command("which pm2")
    if not success:
        print("[code-sync] 错误：未找到 pm2。请安装：npm i -g pm2")
        return False
    return True


def restart_gateway(repo_root):
    """重启或启动 Gateway"""
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
        print(f"[code-sync] PM2 操作失败：{stderr}")
        return False, None
    
    return True, action


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
    print("[code-sync] 清理已合并的 worktree...")
    
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


def main():
    dry_run = "--dry-run" in sys.argv
    
    repo_root = get_repo_root()
    print(f"[code-sync] 仓库根目录：{repo_root}")
    print("[code-sync] 开始同步代码...")
    
    if dry_run:
        print("[code-sync] 干跑模式，不执行实际操作")
        return
    
    # 1. 代码同步
    success, commit = git_pull(repo_root)
    if not success:
        print("[code-sync] 代码同步失败，继续执行...")
        commit = "unknown"
    
    # 1.5 清理已合并的 worktree
    cleanup_result = cleanup_worktrees(repo_root)
    
    # 2. 检查 PM2
    if not check_pm2():
        sys.exit(1)
    
    # 3. 重启 Gateway
    success, action = restart_gateway(repo_root)
    if not success:
        sys.exit(1)
    
    # 4. 验证启动
    if not wait_and_verify(repo_root):
        print("[code-sync] 请检查 pm2 logs claw-gateway")
        sys.exit(1)
    
    print(f"[code-sync] 完成。Gateway 已 {action}。")
    print(f"[code-sync] 当前 commit: {commit}")
    print("[code-sync] 维护命令：pm2 status | pm2 logs claw-gateway | pm2 restart claw-gateway")
    
    # 输出清理结果（供 OpenClaw 检测并发送通知）
    if cleanup_result and cleanup_result.get('cleaned'):
        cleaned_count = len(cleanup_result['cleaned'])
        print(f"\n[WORKTREE_CLEANUP] {json.dumps(cleanup_result, ensure_ascii=False)}")


if __name__ == "__main__":
    main()
