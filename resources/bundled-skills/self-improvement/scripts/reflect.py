#!/usr/bin/env python3
"""
Self-Improvement: 反思生成脚本
用法：python3 reflect.py --session-id xxx --type correction --finding "xxx" --suggestion "xxx"
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

def get_daily_sequence():
    """获取当日序号"""
    reflections_file = get_reflections_file()
    if not reflections_file.exists():
        return 1
    
    today = datetime.now().strftime("%Y%m%d")
    count = 0
    with open(reflections_file, "r", encoding="utf-8") as f:
        for line in f:
            if line.strip():
                try:
                    reflection = json.loads(line)
                    if reflection.get("id", "").startswith(f"LRN-{today}"):
                        count += 1
                except:
                    continue
    return count + 1

def generate_reflection(args):
    """生成反思记录"""
    # 生成规范 ID
    today = datetime.now().strftime("%Y%m%d")
    sequence = get_daily_sequence()
    reflection_id = f"LRN-{today}-{sequence:03d}"
    
    reflection = {
        "id": reflection_id,
        "type": args.type,  # correction|insight|knowledge_gap|best_practice
        "dimension": args.dimension,  # ai|user|interaction
        "area": args.area,  # config|skill|prompt|infra|docs
        "timestamp": datetime.now().astimezone().isoformat(),
        "sessionId": args.session_id,
        "category": args.category,
        "priority": args.priority,
        "triggerType": args.trigger_type,
        "finding": args.finding,
        "suggestion": args.suggestion,
        "userGuidance": args.user_guidance,
        "impact": args.impact,
        "occurrenceCount": args.occurrence_count or 1,
        "recurrenceCount": 1,
        "sessionIds": [args.session_id],
        "lastSeen": datetime.now().astimezone().isoformat(),
        "firstSeen": datetime.now().astimezone().isoformat(),
        "applicableTo": args.applicable_to,
        "status": "pending",
        "skillPath": None,
        "patternKey": args.pattern_key,
        "relatedFiles": parse_list(args.related_files) if args.related_files else [],
        "tags": parse_list(args.tags) if args.tags else [],
        "seeAlso": parse_list(args.see_also) if args.see_also else [],
        "diff": parse_diff(args.diff) if args.diff else None,
        "fullContent": args.full_content,
    }
    
    # 写入 reflections.jsonl
    reflections_file = get_reflections_file()
    reflections_file.parent.mkdir(parents=True, exist_ok=True)
    
    with open(reflections_file, "a", encoding="utf-8") as f:
        f.write(json.dumps(reflection, ensure_ascii=False) + "\n")
    
    return reflection

def parse_list(value):
    """解析逗号分隔的列表"""
    return [item.strip() for item in value.split(",")]

def parse_diff(diff_str):
    """解析 diff 字符串为 JSON"""
    try:
        return json.loads(diff_str)
    except:
        return None

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='生成反思记录')
    parser.add_argument("--session-id", required=True, help="会话 ID")
    parser.add_argument("--type", required=True, choices=["correction", "insight", "knowledge_gap", "best_practice"], help="反思类型")
    parser.add_argument("--dimension", required=True, choices=["ai", "user", "interaction"], help="反思维度")
    parser.add_argument("--area", required=True, choices=["config", "skill", "prompt", "infra", "docs"], help="领域标签")
    parser.add_argument("--finding", required=True, help="发现的具体问题")
    parser.add_argument("--suggestion", required=True, help="改进建议")
    parser.add_argument("--category", default="skill", help="分类：config|skill|prompt|input-clarity|interaction")
    parser.add_argument("--priority", choices=["critical", "high", "medium", "low"], default="medium", help="优先级")
    parser.add_argument("--trigger-type", default="periodic", help="触发类型：realtime-keyword|periodic|manual|auto-detect")
    parser.add_argument("--user-guidance", help="用户操作建议（可选）")
    parser.add_argument("--impact", help="影响范围")
    parser.add_argument("--occurrence-count", type=int, help="发生次数")
    parser.add_argument("--applicable-to", default="ai", help="适用对象：ai|user|both")
    parser.add_argument("--pattern-key", help="模式键：simplify.dead_code|harden.input_validation")
    parser.add_argument("--related-files", help="相关文件（逗号分隔）")
    parser.add_argument("--tags", help="标签（逗号分隔）")
    parser.add_argument("--see-also", help="相关反思 ID（逗号分隔）")
    parser.add_argument("--diff", help="配置变更 diff（JSON 格式）")
    parser.add_argument("--full-content", help="完整反思内容")
    
    args = parser.parse_args()
    reflection = generate_reflection(args)
    print(f"✅ 反思已保存：{reflection['id']}")
    print(f"   类型：{reflection['type']}")
    print(f"   维度：{reflection['dimension']}")
    print(f"   领域：{reflection['area']}")
    print(f"   优先级：{reflection['priority']}")
    print(f"   发现：{reflection['finding']}")
