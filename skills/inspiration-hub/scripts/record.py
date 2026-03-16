#!/usr/bin/env python3
"""
灵感记录脚本
用法：python3 record.py "原始灵感内容" [标题]

在 skill 中调用时，使用 baseDir 获取脚本所在目录：
    script_dir = os.path.dirname(os.path.abspath(__file__))
    inspiration_dir = os.path.join(script_dir, "..", "..", "..", "inspiration")
"""

import os
import sys
from datetime import datetime

# 标签识别规则
TAG_KEYWORDS = {
    "功能": ["功能", "模块", "特性", "按钮", "页面"],
    "技能": ["技能", "skill", "插件"],
    "自动化": ["自动", "定时", "cron", "周期", "每天", "每周"],
    "AI": ["AI", "模型", "智能", "算法", "训练"],
    "金融": ["股票", "股价", "金融", "币", "基金", "理财", "交易"],
    "效率": ["效率", "提效", "快", "节省时间"],
    "监控": ["监控", "告警", "提醒", "通知", "预警"],
    "集成": ["集成", "打通", "对接", "同步", "API"],
}

def extract_tags(content: str) -> list:
    """根据内容自动识别标签"""
    tags = []
    for tag, keywords in TAG_KEYWORDS.items():
        if any(kw in content for kw in keywords):
            tags.append(f"#{tag}")
    return tags if tags else ["#功能"]  # 默认标签

def generate_filename(title: str) -> str:
    """生成文件名：YYYY-MM-DD-标题.md"""
    date = datetime.now().strftime("%Y-%m-%d")
    # 清理标题中的非法字符
    safe_title = title.replace("/", "-").replace(":", "-").strip()
    return f"{date}-{safe_title}.md"

def create_inspiration_file(title: str, content: str, tags: list, author: str = "爸爸"):
    """创建灵感文件"""
    # 获取灵感库目录（相对于脚本位置）
    script_dir = os.path.dirname(os.path.abspath(__file__))
    inspiration_dir = os.path.join(script_dir, "..", "..", "..", "inspiration")
    inspiration_dir = os.path.normpath(inspiration_dir)
    
    date = datetime.now().strftime("%Y-%m-%d")
    tags_str = " ".join(tags)
    
    template = f"""# 灵感：{title}

## 📋 基础信息
- **日期**：{date}
- **记录人**：{author}
- **标签**：{tags_str}

## 💡 原始灵感
{content}

---

## 🔍 深度分析

### 解决什么问题
_（待完善）_

### 目标用户/场景
_（待完善）_

### 技术可行性
_（待完善）_

---

## 📊 优先级评估
- **紧迫性**：待评估
- **影响力**：待评估
- **实现难度**：待评估

---

## 📝 后续演进
- [ ] 待完善
- [ ] 已讨论
- [ ] 已转化为 PRD
- [ ] 开发中
- [ ] 已实现

**关联需求/PR**：_（实现后填）_
"""
    
    filename = generate_filename(title)
    filepath = os.path.join(inspiration_dir, filename)
    
    # 确保目录存在
    os.makedirs(inspiration_dir, exist_ok=True)
    
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(template)
    
    return filepath

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("用法：python3 record.py \"灵感内容\" [标题]")
        sys.exit(1)
    
    content = sys.argv[1]
    title = sys.argv[2] if len(sys.argv) > 2 else content[:20]
    tags = extract_tags(content)
    
    filepath = create_inspiration_file(title, content, tags)
    print(f"✅ 灵感已保存：{filepath}")
