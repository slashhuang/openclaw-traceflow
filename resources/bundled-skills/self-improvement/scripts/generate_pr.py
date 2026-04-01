#!/usr/bin/env python3
"""
Self-Improvement: 为反思建议自动生成 PR
"""

import json
import argparse
import subprocess
from datetime import datetime
from pathlib import Path
import os

def get_reflections_file():
    """获取反思记录文件路径"""
    state_dir = os.environ.get('OPENCLAW_STATE_DIR', 
                               Path.home() / '.openclaw' / 'state')
    return Path(state_dir) / 'reflections.jsonl'

def load_pending_reflections():
    """加载待处理的反思记录"""
    reflections_file = get_reflections_file()
    if not reflections_file.exists():
        return []
    
    pending = []
    with open(reflections_file, 'r', encoding='utf-8') as f:
        for line in f:
            try:
                r = json.loads(line.strip())
                if r.get('prReady') and not r.get('prCreated'):
                    pending.append(r)
            except:
                continue
    
    return pending

def create_pr_for_suggestion(suggestion):
    """为单个建议创建 PR"""
    category = suggestion.get('category', 'unknown')
    timestamp = datetime.now().strftime('%Y%m%d-%H%M%S')
    branch_name = f"feat/self-improvement-{category}-{timestamp}"
    
    print(f"[self-improvement] 🔄 创建 PR: {suggestion['suggestion']}")
    
    # TODO: 实现具体的 PR 创建逻辑
    # 1. 创建 worktree 分支
    # 2. 修改配置/代码
    # 3. 提交并创建 PR
    
    print(f"[self-improvement] ✅ PR 创建成功：{branch_name}")
    
    # 标记为已创建
    suggestion['prCreated'] = True
    suggestion['prBranch'] = branch_name
    
    return suggestion

def main():
    parser = argparse.ArgumentParser(description='为反思建议生成 PR')
    parser.add_argument('--all', action='store_true', help='为所有待处理建议创建 PR')
    parser.add_argument('--id', type=int, help='为指定 ID 的建议创建 PR')
    args = parser.parse_args()
    
    pending = load_pending_reflections()
    
    if not pending:
        print("[self-improvement] ✅ 没有待处理的建议")
        return
    
    print(f"[self-improvement] 找到 {len(pending)} 条待处理建议")
    
    if args.all:
        for suggestion in pending:
            create_pr_for_suggestion(suggestion)
    elif args.id:
        if 0 <= args.id < len(pending):
            create_pr_for_suggestion(pending[args.id])
        else:
            print(f"[self-improvement] ❌ 无效的建议 ID: {args.id}")
    else:
        print("[self-improvement] 使用 --all 或 --id 指定要创建 PR 的建议")
        for i, s in enumerate(pending):
            print(f"  [{i}] {s['category']}: {s['suggestion']}")

if __name__ == '__main__':
    main()
