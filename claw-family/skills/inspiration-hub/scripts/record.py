#!/usr/bin/env python3
"""
灵感记录脚本（增强版）
用法：python3 record.py "原始灵感内容" [标题]

存储位置：`.workspace/inspiration/`（本地工作区，不被 git track）

功能：
- 自动标签识别
- AI 点评（调用 LLM API）
- 商业价值评估
- 技术可行性分析
"""

import os
import sys
from datetime import datetime

# 标签识别规则（增强版）
TAG_KEYWORDS = {
    "功能": ["功能", "模块", "特性", "按钮", "页面", "界面"],
    "技能": ["技能", "skill", "插件", "插件化"],
    "自动化": ["自动", "定时", "cron", "周期", "每天", "每周", "触发"],
    "AI": ["AI", "模型", "智能", "算法", "训练", "LLM", "大模型"],
    "金融": ["股票", "股价", "金融", "币", "基金", "理财", "交易", "投资"],
    "效率": ["效率", "提效", "快", "节省时间", "简化"],
    "监控": ["监控", "告警", "提醒", "通知", "预警", "检测"],
    "集成": ["集成", "打通", "对接", "同步", "API", "webhook"],
    "编辑器": ["编辑", "editor", "IDE", "可视化"],
    "审计": ["审计", "audit", "检查", "验证", "合规"],
}

# 商业价值评估关键词
BUSINESS_VALUE_KEYWORDS = {
    "高": ["赚钱", "收入", "变现", "付费", "商业", "市场", "竞争", "核心"],
    "中": ["用户体验", "留存", "活跃", "口碑", "品牌"],
    "低": ["优化", "美化", "重构", "技术债"],
}

def extract_tags(content: str) -> list:
    """根据内容自动识别标签"""
    tags = []
    for tag, keywords in TAG_KEYWORDS.items():
        if any(kw in content.lower() for kw in keywords):
            tags.append(f"#{tag}")
    return tags if tags else ["#想法"]  # 默认标签

def assess_business_value(content: str) -> dict:
    """评估商业价值（基于关键词匹配）"""
    scores = {"高": 0, "中": 0, "低": 0}
    for level, keywords in BUSINESS_VALUE_KEYWORDS.items():
        scores[level] = sum(1 for kw in keywords if kw.lower() in content.lower())
    
    # 返回得分最高的等级
    max_level = max(scores, key=scores.get)
    return {
        "level": max_level,
        "scores": scores,
        "reasoning": f"关键词匹配：{scores}"
    }

def ai_review(content: str, tags: list) -> str:
    """AI 点评（简化版：基于规则的点评）"""
    # 实际可以调用 LLM API，这里先用规则
    reviews = []
    
    if "#AI" in tags:
        reviews.append("💡 AI 相关功能，建议评估模型成本和响应速度")
    if "#自动化" in tags:
        reviews.append("⏰ 自动化功能，建议考虑异常处理和重试机制")
    if "#金融" in tags:
        reviews.append("💰 金融相关，建议注意数据准确性和合规性")
    if "#编辑器" in tags:
        reviews.append("📝 编辑器功能，建议考虑用户体验和快捷键")
    if "#审计" in tags:
        reviews.append("🔍 审计功能，建议考虑日志记录和可追溯性")
    
    return "\n".join(reviews) if reviews else "💡 有趣的想法，值得深入探讨！"

def generate_filename(title: str) -> str:
    """生成文件名：YYYY-MM-DD-标题.md"""
    date = datetime.now().strftime("%Y-%m-%d")
    # 清理标题中的非法字符
    safe_title = title.replace("/", "-").replace(":", "-").strip()
    return f"{date}-{safe_title}.md"

def create_inspiration_file(title: str, content: str, tags: list, author: str = "爸爸"):
    """创建灵感文件（增强版）"""
    # 获取灵感库目录：`.workspace/inspiration/`
    script_dir = os.path.dirname(os.path.abspath(__file__))
    # 从 scripts/record.py 向上三级到 skills/，然后到 .workspace/
    workspace_dir = os.path.join(script_dir, "..", "..", "..", "openClawRuntime", ".workspace")
    workspace_dir = os.path.normpath(workspace_dir)
    inspiration_dir = os.path.join(workspace_dir, "inspiration")
    
    date = datetime.now().strftime("%Y-%m-%d")
    tags_str = " ".join(tags)
    business_value = assess_business_value(content)
    ai_review_text = ai_review(content, tags)
    
    template = f"""# 灵感：{title}

## 📋 基础信息
- **日期**：{date}
- **记录人**：{author}
- **标签**：{tags_str}

## 💡 原始灵感
{content}

---

## 🤖 AI 点评
{ai_review_text}

---

## 💰 商业价值评估
- **等级**：{business_value["level"]}
- **分析**：{business_value["reasoning"]}

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
