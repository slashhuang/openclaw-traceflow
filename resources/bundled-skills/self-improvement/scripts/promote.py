#!/usr/bin/env python3
"""
Self-Improvement: Promotion 脚本
用法：python3 promote.py --reflection-id xxx --target AGENTS.md
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

def load_reflection(reflection_id):
    """加载单个反思记录"""
    reflections = load_reflections()
    for r in reflections:
        if r.get("id") == reflection_id:
            return r
    return None

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
    else:
        print(f"❌ 反思记录不存在：{reflection_id}")

def distill_rule(reflection):
    """提炼规则"""
    rule = f"## {reflection.get('finding', 'Unknown')}\n\n"
    rule += f"**建议**: {reflection.get('suggestion', 'N/A')}\n\n"
    if reflection.get('impact'):
        rule += f"**影响**: {reflection['impact']}\n\n"
    return rule

def append_to_file(file_path, content):
    """追加内容到文件"""
    # 确保目录存在
    Path(file_path).parent.mkdir(parents=True, exist_ok=True)
    
    # 追加内容
    with open(file_path, "a", encoding="utf-8") as f:
        f.write("\n---\n\n")
        f.write(content)

def promote_to_doc(reflection_id, target_file):
    """推广到文档"""
    reflection = load_reflection(reflection_id)
    
    if not reflection:
        print(f"❌ 反思记录不存在：{reflection_id}")
        return False
    
    # 提炼规则
    rule = distill_rule(reflection)
    
    # 添加到目标文件
    append_to_file(target_file, rule)
    
    # 更新反思状态
    update_reflection_status(reflection_id, "promoted", {"promotedTo": target_file})
    
    print(f"✅ 已推广到 {target_file}")
    return True

def generate_skill_md(skill_dir, reflection):
    """生成 SKILL.md"""
    skill_md = f"""---
name: {skill_dir.split('/')[-1]}
description: {reflection.get('suggestion', 'Auto-generated skill')}
metadata:
  {{
    "openclaw": {{
      "emoji": "✨",
      "requires": {{ "bins": ["python3"] }},
    }},
  }}
---

# {skill_dir.split('/')[-1].replace('-', ' ').title()} Skill

## 来源

- **反思 ID**: {reflection.get('id')}
- **发现**: {reflection.get('finding', 'N/A')}
- **建议**: {reflection.get('suggestion', 'N/A')}

## 用法

```bash
# TODO: 添加使用示例
```

## 实现细节

{reflection.get('fullContent', 'TODO: 添加实现细节')}

## 验收标准

- [ ] 功能正常
- [ ] 测试通过
- [ ] 文档完善

---

**创建日期**: {datetime.now().strftime('%Y-%m-%d')}
**来源反思**: {reflection.get('id')}
"""
    
    skill_file = Path(skill_dir) / "SKILL.md"
    skill_file.parent.mkdir(parents=True, exist_ok=True)
    
    with open(skill_file, "w", encoding="utf-8") as f:
        f.write(skill_md)

def promote_to_skill(reflection_id, skill_name):
    """推广到技能"""
    reflection = load_reflection(reflection_id)
    
    if not reflection:
        print(f"❌ 反思记录不存在：{reflection_id}")
        return False
    
    # 创建技能目录
    skill_dir = f"skills/{skill_name}"
    
    # 生成 SKILL.md
    generate_skill_md(skill_dir, reflection)
    
    # 更新反思状态
    update_reflection_status(reflection_id, "promoted_to_skill", {
        "skillPath": skill_dir
    })
    
    print(f"✅ 已创建技能 {skill_name}")
    return True

def check_recurrence(pattern_key):
    """检查重复次数"""
    reflections = load_reflections()
    
    # 查找匹配的反思
    matching = [r for r in reflections if r.get("patternKey") == pattern_key]
    
    if len(matching) >= 3:
        print(f"🔔 检测到重复模式 {pattern_key}，已出现 {len(matching)} 次")
        return True, matching
    
    return False, matching

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='推广反思到文档或技能')
    parser.add_argument("--reflection-id", required=True, help="反思 ID")
    parser.add_argument("--target", choices=["CLAUDE.md", "AGENTS.md", "SOUL.md", "TOOLS.md"], help="推广到文档")
    parser.add_argument("--skill", help="推广到技能（技能名称）")
    parser.add_argument("--check-recurrence", help="检查重复次数（patternKey）")
    
    args = parser.parse_args()
    
    if args.check_recurrence:
        is_recurring, matching = check_recurrence(args.check_recurrence)
        if is_recurring:
            print(f"   建议触发 Promotion")
    elif args.target:
        promote_to_doc(args.reflection_id, args.target)
    elif args.skill:
        promote_to_skill(args.reflection_id, args.skill)
    else:
        parser.print_help()
