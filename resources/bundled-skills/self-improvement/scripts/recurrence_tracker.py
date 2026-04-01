#!/usr/bin/env python3
"""
Self-Improvement: 重复追踪脚本
用法：python3 recurrence_tracker.py --pattern-key xxx
"""

import os
import sys
import json
import argparse
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

def update_reflection_field(reflection_id, field, value):
    """更新反思字段"""
    reflections_file = get_reflections_file()
    reflections = load_reflections()
    
    updated = False
    for reflection in reflections:
        if reflection.get("id") == reflection_id:
            reflection[field] = value
            updated = True
            break
    
    if updated:
        # 重写文件
        with open(reflections_file, "w", encoding="utf-8") as f:
            for reflection in reflections:
                f.write(json.dumps(reflection, ensure_ascii=False) + "\n")

def track_recurrence(pattern_key):
    """追踪重复次数"""
    reflections = load_reflections()
    
    # 查找匹配的反思
    matching = [r for r in reflections if r.get("patternKey") == pattern_key]
    
    if not matching:
        print(f"✅ 未找到匹配的模式：{pattern_key}")
        return 0
    
    # 更新 recurrenceCount
    today = datetime.now().astimezone().isoformat()
    for i, reflection in enumerate(matching):
        # 递增重复次数
        new_count = reflection.get("recurrenceCount", 1) + 1
        update_reflection_field(reflection["id"], "recurrenceCount", new_count)
        
        # 更新 lastSeen
        update_reflection_field(reflection["id"], "lastSeen", today)
        
        # 第一个匹配的更新 firstSeen
        if i == 0:
            update_reflection_field(reflection["id"], "firstSeen", reflection.get("timestamp", today))
    
    print(f"📊 模式 {pattern_key} 已出现 {len(matching)} 次")
    
    # 检查是否需要 Promotion
    if len(matching) >= 3:
        print(f"🔔 触发 Promotion 条件（recurrenceCount >= 3）")
        print(f"   建议执行：python3 promote.py --reflection-id {matching[0]['id']} --target AGENTS.md")
    
    return len(matching)

def list_recurring_patterns(min_count=2):
    """列出重复模式"""
    reflections = load_reflections()
    
    # 按 patternKey 分组
    by_pattern = {}
    for r in reflections:
        pattern_key = r.get("patternKey")
        if pattern_key:
            if pattern_key not in by_pattern:
                by_pattern[pattern_key] = []
            by_pattern[pattern_key].append(r)
    
    # 过滤重复次数 >= min_count 的
    recurring = {k: v for k, v in by_pattern.items() if len(v) >= min_count}
    
    if not recurring:
        print(f"✅ 没有重复模式（min_count={min_count}）")
        return
    
    print(f"📋 重复模式（>= {min_count} 次）:\n")
    for pattern_key, items in sorted(recurring.items(), key=lambda x: len(x[1]), reverse=True):
        print(f"🔁 {pattern_key}: {len(items)} 次")
        for item in items:
            print(f"   - [{item['id']}] {item.get('finding', 'N/A')[:50]}")
        print()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='追踪重复模式')
    parser.add_argument("--pattern-key", help="模式键")
    parser.add_argument("--list", action="store_true", help="列出重复模式")
    parser.add_argument("--min-count", type=int, default=2, help="最小重复次数（用于 --list）")
    
    args = parser.parse_args()
    
    if args.list:
        list_recurring_patterns(args.min_count)
    elif args.pattern_key:
        track_recurrence(args.pattern_key)
    else:
        parser.print_help()
