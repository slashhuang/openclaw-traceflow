#!/usr/bin/env python3
"""
自动清理已合并分支的 worktree

用法：
    python3 cleanup_worktree.py [--dry-run]
    
功能：
    - 扫描所有 worktree
    - 检查分支是否已合并到 origin/main
    - 删除已合并的 worktree
    - 发送飞书通知（若有清理）
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
        kwargs = {
            'shell': True,
            'cwd': cwd,
            'universal_newlines': True,
            'timeout': 60
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


def get_worktree_list(repo_root):
    """获取 worktree 列表"""
    success, stdout, _ = run_command("git worktree list", cwd=repo_root, capture_output=True)
    if not success:
        return []
    
    worktrees = []
    for line in stdout.strip().split('\n'):
        if not line:
            continue
        parts = line.split()
        if len(parts) >= 2:
            path = parts[0]
            branch = parts[1]
            # 解析分支名（去掉 refs/heads/ 前缀）
            if branch.startswith('refs/heads/'):
                branch = branch[len('refs/heads/'):]
            elif branch == 'main' or branch == 'master':
                branch = branch
            worktrees.append({
                'path': path,
                'branch': branch
            })
    return worktrees


def get_current_worktree_path():
    """获取当前 worktree 路径"""
    return os.getcwd()


def is_branch_merged(branch, repo_root):
    """检查分支是否已合并到 origin/main"""
    # 先 fetch 确保 origin/main 是最新的
    run_command("git fetch origin main", cwd=repo_root)
    
    # 检查是否已合并到 origin/main
    success, _, _ = run_command(
        f"git merge-base --is-ancestor {branch} origin/main",
        cwd=repo_root
    )
    return success


def has_uncommitted_changes(worktree_path):
    """检查 worktree 是否有未提交的更改"""
    success, stdout, _ = run_command("git status --porcelain", cwd=worktree_path, capture_output=True)
    if not success:
        return False
    return bool(stdout.strip())


def remove_worktree(worktree_path, repo_root):
    """删除 worktree"""
    success, _, stderr = run_command(
        f"git worktree remove {worktree_path}",
        cwd=repo_root
    )
    return success, stderr


def cleanup_worktrees(repo_root, dry_run=False):
    """清理已合并的 worktree"""
    print("[worktree-cleanup] 开始扫描 worktree...")
    
    # 获取 worktree 列表
    worktrees = get_worktree_list(repo_root)
    print(f"[worktree-cleanup] 扫描到 {len(worktrees)} 个 worktree")
    
    if not worktrees:
        return []
    
    # 获取当前 worktree 路径
    current_path = get_current_worktree_path()
    
    # 规范分支前缀
    branch_prefixes = ['feat/', 'fix/', 'docs/', 'chore/', 'refactor/']
    
    cleaned = []
    skipped = []
    
    for wt in worktrees:
        path = wt['path']
        branch = wt['branch']
        
        # 跳过主工作区（main/master）
        if branch in ['main', 'master']:
            print(f"[worktree-cleanup] 跳过主工作区：{path}")
            continue
        
        # 跳过当前 worktree
        if os.path.abspath(path) == os.path.abspath(current_path):
            print(f"[worktree-cleanup] 跳过当前 worktree：{path}")
            continue
        
        # 只处理规范命名的分支
        is_target_branch = any(branch.startswith(prefix) for prefix in branch_prefixes)
        if not is_target_branch:
            print(f"[worktree-cleanup] 跳过非规范分支 {branch}：{path}")
            continue
        
        # 检查是否已合并
        if not is_branch_merged(branch, repo_root):
            print(f"[worktree-cleanup] 分支 {branch} 未合并，跳过：{path}")
            skipped.append({'path': path, 'branch': branch, 'reason': '未合并'})
            continue
        
        # 检查是否有未提交更改
        if has_uncommitted_changes(path):
            print(f"[worktree-cleanup] 分支 {branch} 有未提交更改，跳过：{path}")
            skipped.append({'path': path, 'branch': branch, 'reason': '有未提交更改'})
            continue
        
        # 删除 worktree
        if dry_run:
            print(f"[worktree-cleanup] [dry-run] 将删除：{path} (分支：{branch})")
            cleaned.append({'path': path, 'branch': branch, 'dry_run': True})
        else:
            success, stderr = remove_worktree(path, repo_root)
            if success:
                print(f"[worktree-cleanup] 已删除：{path} (分支：{branch})")
                cleaned.append({'path': path, 'branch': branch})
            else:
                print(f"[worktree-cleanup] 删除失败 {path}: {stderr}")
                skipped.append({'path': path, 'branch': branch, 'reason': f'删除失败：{stderr}'})
    
    return cleaned


def send_notification(cleaned_list, skipped_list):
    """发送飞书通知"""
    if not cleaned_list:
        return
    
    # 构建通知消息
    message = "🧹 **Worktree 自动清理完成**\n\n"
    message += f"✅ 已清理 {len(cleaned_list)} 个：\n"
    for item in cleaned_list:
        branch = item['branch']
        path = Path(item['path']).name
        message += f"- `{branch}` → `{path}`\n"
    
    if skipped_list:
        message += f"\n⚠️ 跳过 {len(skipped_list)} 个：\n"
        for item in skipped_list[:5]:  # 最多显示 5 个
            message += f"- `{item['branch']}`: {item['reason']}\n"
        if len(skipped_list) > 5:
            message += f"... 还有 {len(skipped_list) - 5} 个\n"
    
    print(f"\n[worktree-cleanup] 通知消息：\n{message}")
    
    # 尝试发送飞书消息（通过 OpenClaw message 工具）
    # 注意：这里无法直接调用 message 工具，需要由调用方处理
    # 返回消息内容供调用方使用
    return message


def main():
    dry_run = "--dry-run" in sys.argv
    
    repo_root = get_repo_root()
    print(f"[worktree-cleanup] 仓库根目录：{repo_root}")
    
    if dry_run:
        print("[worktree-cleanup] 干跑模式，不执行实际删除")
    
    # 执行清理
    cleaned = cleanup_worktrees(repo_root, dry_run)
    
    # 获取跳过的列表（用于通知）
    worktrees = get_worktree_list(repo_root)
    current_path = get_current_worktree_path()
    skipped = []
    for wt in worktrees:
        path = wt['path']
        branch = wt['branch']
        if branch in ['main', 'master']:
            continue
        if os.path.abspath(path) == os.path.abspath(current_path):
            continue
        if not any(branch.startswith(prefix) for prefix in ['feat/', 'fix/', 'docs/', 'chore/', 'refactor/']):
            continue
        if not is_branch_merged(branch, repo_root):
            skipped.append({'path': path, 'branch': branch, 'reason': '未合并'})
            continue
        if has_uncommitted_changes(path):
            skipped.append({'path': path, 'branch': branch, 'reason': '有未提交更改'})
    
    # 发送通知
    if cleaned:
        notification = send_notification(cleaned, skipped)
        # 将通知内容写入临时文件，供 sync.py 读取并发送
        if not dry_run:
            notification_file = repo_root / ".workspace" / ".worktree_cleanup_notification.json"
            notification_file.parent.mkdir(parents=True, exist_ok=True)
            with open(str(notification_file), 'w') as f:
                json.dump({
                    'cleaned': cleaned,
                    'skipped': skipped,
                    'message': notification
                }, f, ensure_ascii=False, indent=2)
            print(f"[worktree-cleanup] 通知内容已写入：{notification_file}")
    
    print(f"[worktree-cleanup] 完成，共清理 {len(cleaned)} 个 worktree")
    
    return 0 if not cleaned or dry_run else 0


if __name__ == "__main__":
    sys.exit(main())
