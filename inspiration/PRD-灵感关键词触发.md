# PRD：灵感库关键词触发机制

## 📋 基础信息
- **日期**：2026-03-11
- **来源**：爸爸（slashhuang）反馈
- **记录人**：阿布
- **标签**：#功能 #效率 #AI

---

## 💡 需求背景

目前灵感库需要手动告诉阿布「帮我记个灵感」，容易和正常需求讨论搞混。

爸爸希望通过**关键词触发**，让阿布自动识别什么时候是在记录灵感。

---

## 🎯 目标

### 解决什么问题
- 灵感记录流程不够流畅
- 正常需求讨论和灵感记录容易混淆
- 缺少自动化的灵感捕获机制

### 用户场景
- 爸爸突然想到一个点子，直接说「灵感：XXX」
- 阿布自动识别关键词，记录到 `inspiration/` 目录
- 后续爸爸可以随时回顾、转化为需求

---

## 📝 功能设计

### 1. 关键词触发

**灵感触发词**（爸爸说这些词时，阿布进入「灵感记录模式」）：
- 「灵感：XXX」
- 「记个灵感：XXX」
- 「想法：XXX」
- 「要不要做个 XXX」
- 「灵感记录：XXX」

**示例对话**：
```
爸爸：灵感：做个自动整理 GitHub issue 的功能
阿布：好的～阿布帮你记下来啦！📝
     已保存到：inspiration/2026-03-11-自动整理 GitHub issue.md
     有空时爸爸可以回顾，觉得可行就说「把 XXX 灵感转化为需求」～
```

### 2. 灵感记录格式

阿布自动提取以下信息：
- **标题**：从爸爸的话里提取简短标题
- **日期**：当天日期
- **原始灵感**：爸爸的原话
- **标签**：自动识别（如提到「功能」→ `#功能`，提到「股票」→ `#金融`）

### 3. 后续转化流程

当爸爸说以下词时，阿布进入「灵感转化模式」：
- 「把 XXX 灵感转化为需求」
- 「实现这个灵感」
- 「XXX 灵感可以做」

转化流程：
1. 阿布读取对应的灵感文件
2. 完善 PRD（补充技术可行性、工作量评估等）
3. 走 PR 流程（PRD 单独 PR → 用户确认 → 实现 PR）

---

## 🔍 技术实现

### 方案选择

**推荐方案：新增 `skills/inspiration-hub` Skill**

理由：
- Skill 有明确的触发词、用法、示例定义（SKILL.md）
- 代码组织清晰，符合 OpenClaw 标准架构
- 便于后续扩展（如灵感回顾、灵感转化等命令）
- 脚本路径可靠，Skill 内调用 `baseDir/scripts/xxx` 即可

### 修改文件清单

| 文件 | 修改类型 | 说明 |
|------|----------|------|
| `skills/inspiration-hub/SKILL.md` | 新增 | Skill 定义（触发词、用法） |
| `skills/inspiration-hub/scripts/record.py` | 新增 | 灵感记录脚本 |
| `SOUL.md` | 修改 | 添加 skill 使用说明（可选） |

---

### 实现逻辑

#### 1. SKILL.md 触发词定义

在 `skills/inspiration-hub/SKILL.md` 中定义：

```yaml
---
name: inspiration-hub
description: 灵感库管理技能。记录灵感、回顾灵感、转化为需求。
triggers:
  - "灵感："
  - "记个灵感"
  - "想法："
  - "要不要做个"
  - "灵感记录"
  - "把.*灵感转化为需求"
  - "实现这个灵感"
---

# 灵感库技能

## 触发词

**灵感记录**：
- 「灵感：XXX」
- 「记个灵感：XXX」
- 「想法：XXX」
- 「要不要做个 XXX」
- 「灵感记录：XXX」

**灵感转化**：
- 「把 XXX 灵感转化为需求」
- 「实现这个灵感」
```

#### 2. 记录脚本 (`record.py`)

```python
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
    
    template = f"""# 灵感：{{title}}

## 📋 基础信息
- **日期**：{{date}}
- **记录人**：{{author}}
- **标签**：{{tags}}

## 💡 原始灵感
{{content}}

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
    
    date = datetime.now().strftime("%Y-%m-%d")
    tags_str = " ".join(tags)
    
    filename = generate_filename(title)
    filepath = os.path.join(inspiration_dir, filename)
    
    # 确保目录存在
    os.makedirs(inspiration_dir, exist_ok=True)
    
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(template.format(
            title=title,
            date=date,
            author=author,
            tags=tags_str,
            content=content
        ))
    
    return filepath

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("用法：python3 record.py \"灵感内容\" [标题]")
        sys.exit(1)
    
    content = sys.argv[1]
    title = sys.argv[2] if len(sys.argv) > 2 else content[:20]
    tags = extract_tags(content)
    
    filepath = create_inspiration_file(title, content, tags)
    print(f"✅ 灵感已保存：{{filepath}}")
```

#### 3. 标签自动识别规则

| 标签 | 关键词 | 示例 |
|------|--------|------|
| #功能 | 功能、模块、特性、按钮、页面 | 「做个新功能」 |
| #技能 | 技能、skill、插件 | 「写个 skill」 |
| #自动化 | 自动、定时、cron、周期 | 「每天自动」 |
| #AI | AI、模型、智能、算法 | 「AI 分析」 |
| #金融 | 股票、股价、金融、币、基金 | 「股价预警」 |
| #效率 | 效率、提效、快、节省时间 | 「提效工具」 |
| #监控 | 监控、告警、提醒、通知 | 「监控告警」 |
| #集成 | 集成、打通、对接、同步 | 「飞书同步」 |

---

### 完整示例

**用户输入**：
```
灵感：做个自动整理 GitHub issue 的功能，把 bug 类的 issue 自动分配给对应模块的负责人
```

**阿布处理**：
1. 识别触发词「灵感：」
2. 提取内容：「做个自动整理 GitHub issue 的功能...」
3. 自动识别标签：#自动化 #功能 #集成
4. 生成标题：「自动整理 GitHub issue」
5. 调用 `record.py` 生成文件
6. 回复：「好的～阿布帮你记下来啦！📝 已保存到：`inspiration/2026-03-11-自动整理 GitHub issue.md`」

**生成的文件**：
```markdown
# 灵感：自动整理 GitHub issue

## 📋 基础信息
- **日期**：2026-03-11
- **记录人**：爸爸
- **标签**：#自动化 #功能 #集成

## 💡 原始灵感
做个自动整理 GitHub issue 的功能，把 bug 类的 issue 自动分配给对应模块的负责人
...
```

---

## 📊 优先级评估
- **紧迫性**：中（爸爸已明确提出需求）
- **影响力**：中（提升灵感记录体验）
- **实现难度**：小（主要是文本识别 + 文件生成）
- **推荐优先级**：P1

---

## ✅ 验收标准

1. 爸爸说「灵感：XXX」时，阿布自动记录到 `inspiration/` 目录
2. 生成的文件包含：标题、日期、原始灵感、自动标签
3. 阿布回复确认信息，包含文件路径
4. 爸爸说「把 XXX 灵感转化为需求」时，阿布能读取并启动 PRD 流程

---

## 📝 后续演进
- [x] 已讨论
- [ ] PRD 确认
- [ ] 开发中
- [ ] 已实现

**关联需求/PR**：(实现后填)

---

## 📎 附件
- 灵感库 README：`inspiration/README.md`
- 灵感模板：见 `inspiration/README.md`
