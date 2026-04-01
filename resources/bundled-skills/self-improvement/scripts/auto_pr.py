#!/usr/bin/env python3
"""
Self-Improvement: 自动生成 PR 脚本
用法：python3 auto_pr.py --reflection-id xxx
"""

import os
import sys
import json
import argparse
import subprocess
from datetime import datetime
from pathlib import Path

def get_state_dir():
    """获取 OpenClaw state 目录"""
    return os.environ.get('OPENCLAW_STATE_DIR', 
                          Path.home() / '.openclaw' / 'state')

def get_reflections_file():
    """获取反思记录文件路径"""
    state_dir = get_state_dir()
    return Path(state_dir) / 'reflections.jsonl'

def load_reflections():
    """加载所有反思记录"""
    reflections_file = get_reflections_file()
    if not reflections_file.exists():
        return []
    
    reflections = []
    with open(reflections_file, "r", encoding="utf-8") as f:
        for line in f:
            if line.strip():
                try:
                    reflections.append(json.loads(line))
                except:
                    continue
    return reflections

def update_reflection_status(reflection_id, new_status, extra_fields=None):
    """更新反思状态"""
    reflections_file = get_reflections_file()
    reflections = load_reflections()
    
    updated = False
    for reflection in reflections:
        if reflection.get("id") == reflection_id:
            reflection["status"] = new_status
            if extra_fields:
                for key, value in extra_fields.items():
                    reflection[key] = value
            updated = True
            break
    
    if updated:
        # 重写文件
        with open(reflections_file, "w", encoding="utf-8") as f:
            for reflection in reflections:
                f.write(json.dumps(reflection, ensure_ascii=False) + "\n")
        print(f"✅ 反思状态已更新：{reflection_id} → {new_status}")

def apply_diff(diff):
    """应用配置变更"""
    if not diff or "file" not in diff:
        return False
    
    file_path = diff["file"]
    old_config = diff.get("old", {})
    new_config = diff.get("new", {})
    
    # 读取当前配置
    if not os.path.exists(file_path):
        print(f"⚠️  文件不存在：{file_path}")
        return False
    
    with open(file_path, "r", encoding="utf-8") as f:
        config = json.load(f)
    
    # 应用变更
    for key, value in new_config.items():
        config[key] = value
        print(f"   {key}: {old_config.get(key, 'N/A')} → {value}")
    
    # 写回配置
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(config, f, indent=2, ensure_ascii=False)
    
    return True

def create_pr(title, body):
    """创建 PR"""
    print(f"📝 创建 PR: {title}")
    print(f"   {body[:200]}...")
    # TODO: 实际调用 git-workflow skill 创建 PR
    # 这里只是模拟
    return True

def create_pr_from_reflection(reflection_id):
    """根据反思自动生成 PR"""
    reflections = load_reflections()
    reflection = None
    
    for r in reflections:
        if r.get("id") == reflection_id:
            reflection = r
            break
    
    if not reflection:
        print(f"❌ 反思记录不存在：{reflection_id}")
        return False
    
    # 检查状态
    if reflection.get("status") not in ["pending", "in_progress"]:
        print(f"⚠️  反思状态不是 pending/in_progress: {reflection.get('status')}")
        return False
    
    # 检查优先级
    if reflection.get("priority") not in ["critical", "high"]:
        print(f"⚠️  只处理 critical/high 优先级反思，当前优先级：{reflection.get('priority')}")
        return False
    
    # 检查是否有 diff
    if not reflection.get("diff"):
        print(f"⚠️  反思没有配置变更 diff")
        return False
    
    # 应用配置变更
    print(f"🔧 应用配置变更...")
    if not apply_diff(reflection["diff"]):
        return False
    
    # 创建 PR
    pr_title = f"refactor: 根据反思优化 {reflection.get('category', 'config')}"
    pr_body = f"""
## 反思来源

- **反思 ID**: {reflection_id}
- **类型**: {reflection.get('type', 'N/A')}
- **发现**: {reflection.get('finding', 'N/A')}
- **建议**: {reflection.get('suggestion', 'N/A')}

## 变更内容

- 文件：{reflection['diff']['file']}
- 变更：{reflection['diff'].get('old', {})} → {reflection['diff'].get('new', {})}

## 验收标准

- [ ] 配置已应用
- [ ] 功能正常
- [ ] 反思状态已更新为 resolved
"""
    
    if create_pr(pr_title, pr_body):
        # 更新反思状态为 in_progress
        update_reflection_status(reflection_id, "in_progress")
        print(f"✅ PR 创建成功！状态已更新为 in_progress")
        return True
    
    return False

def list_pending_reflections():
    """列出待处理的反思"""
    reflections = load_reflections()
    pending = [r for r in reflections if r.get("status") == "pending"]
    
    if not pending:
        print("✅ 没有待处理的反思")
        return
    
    print(f"📋 待处理的反思 ({len(pending)} 条):\n")
    
    # 按优先级和类型分组
    by_priority = {'critical': [], 'high': [], 'medium': [], 'low': []}
    for r in pending:
        priority = r.get('priority', 'low')
        if priority in by_priority:
            by_priority[priority].append(r)
    
    if by_priority['critical']:
        print(f"🔴 紧急优先级 ({len(by_priority['critical'])} 条):")
        for r in by_priority['critical']:
            print(f"   - [{r.get('id')}] [{r.get('type', 'N/A')}] {r.get('finding', 'N/A')[:50]}")
        print()
    
    if by_priority['high']:
        print(f"🟠 高优先级 ({len(by_priority['high'])} 条):")
        for r in by_priority['high']:
            print(f"   - [{r.get('id')}] [{r.get('type', 'N/A')}] {r.get('finding', 'N/A')[:50]}")
        print()
    
    if by_priority['medium']:
        print(f"🟡 中优先级 ({len(by_priority['medium'])} 条):")
        for r in by_priority['medium']:
            print(f"   - [{r.get('id')}] [{r.get('type', 'N/A')}] {r.get('finding', 'N/A')[:50]}")
        print()
    
    if by_priority['low']:
        print(f"🟢 低优先级 ({len(by_priority['low'])} 条):")
        for r in by_priority['low']:
            print(f"   - [{r.get('id')}] [{r.get('type', 'N/A')}] {r.get('finding', 'N/A')[:50]}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='根据反思自动生成 PR')
    parser.add_argument("--reflection-id", help="反思 ID")
    parser.add_argument("--list", action="store_true", help="列出待处理的反思")
    
    args = parser.parse_args()
    
    if args.list:
        list_pending_reflections()
    elif args.reflection_id:
        create_pr_from_reflection(args.reflection_id)
    else:
        parser.print_help()
