---
name: self-improvement
description: "Captures learnings, errors, corrections, and insights to enable continuous improvement. Use when: (1) A command or operation fails unexpectedly, (2) User corrects you ('No, that's wrong...', 'Actually...', '不对', '错了'), (3) User requests a fix or rollback ('fix', '修复', '改一下', 'revert'), (4) User requests a capability that doesn't exist, (5) An external API or tool fails, (6) You realize your knowledge is outdated or incorrect, (7) A better approach is discovered for a recurring task. Also review learnings before major tasks."
metadata:
  {
    'openclaw':
      {
        'emoji': '🔄',
        'requires': { 'bins': ['git', 'python3'] },
        'runtime': true,
      },
  }
---

# Self-Improvement - 实时反思机制

## 核心机制

**不是技能，是运行时机制** - 在会话进行中自动检测和记录反思

## 自动检测触发器

### 1. 用户纠正

**关键词**: 「No, that's wrong」「Actually」「不对」「错了」「incorrect」  
**类型**: correction  
**优先级**: high

### 2. 修复行为 ⭐

**关键词**: 「fix」「修复」「修正」「改一下」「revert」「rollback」  
**类型**: correction  
**优先级**: high  
**说明**: 用户要求修复，说明阿布的方案有问题

### 3. 阿布引入的问题 ⭐⭐

**检测逻辑**:

1. 阿布提出建议
2. 用户说「fix」或「修复」
3. 时间间隔 < 5 分钟  
   **类型**: correction  
   **优先级**: critical  
   **说明**: 阿布的建议导致了新问题，需要深度反思

### 4. 命令失败

**检测**: 工具执行返回非零退出码  
**类型**: error  
**优先级**: high

### 5. 功能请求

**关键词**: 「Can you also」「I wish」「能不能」「有没有」「希望」  
**类型**: insight  
**优先级**: medium

### 6. 知识盲区

**检测**: 用户提供了阿布不知道的正确信息  
**类型**: knowledge_gap  
**优先级**: high

### 7. 最佳实践

**检测**: 发现了更好的方法/模式  
**类型**: best_practice  
**优先级**: medium

## 核心功能

### 1. 实时反思

- 检测会话中的纠正/修复/错误/洞察
- 自动记录到 `.clawStates/reflections.jsonl`
- 识别配置/代码优化机会

### 2. Wakeup 报告

- 汇总过去的反思记录
- 按优先级和类型排序建议
- 主动告知用户需要调整的内容

### 3. 自动 PR

- 对 critical/high 优先级建议自动生成 PR
- 修改配置文件或技能代码
- 提交到 Monorepo 仓库根

### 4. Promotion 机制

- 高价值反思自动推广到文档（CLAUDE.md/AGENTS.md/SOUL.md/TOOLS.md）
- 可复用模式自动提取为技能
- 状态追踪（pending → in_progress → resolved/promoted/promoted_to_skill）

## 反思分类

### 类型（type）

| 类型              | 说明     | 触发场景                               |
| ----------------- | -------- | -------------------------------------- |
| **correction**    | 用户纠正 | 「No, that's wrong...」「Actually...」 |
| **insight**       | 新发现   | 发现了之前不知道的知识                 |
| **knowledge_gap** | 知识盲区 | 知识过时/错误，用户提供了正确信息      |
| **best_practice** | 最佳实践 | 发现了更好的方法/模式                  |

### 维度（dimension）

| 维度            | 说明         | 示例                              |
| --------------- | ------------ | --------------------------------- |
| **ai**          | AI 自我反思  | 「回答不够准确，需要优化 prompt」 |
| **user**        | 用户输入质量 | 「用户输入模糊，需要引导澄清」    |
| **interaction** | 交互质量     | 「来回确认次数过多，效率低」      |

### 领域（area）

| 领域       | 范围                     |
| ---------- | ------------------------ |
| **config** | 配置文件、环境变量、设置 |
| **skill**  | 技能代码、AgentSkills    |
| **prompt** | System Prompt、指令优化  |
| **infra**  | 基础设施、部署、CI/CD    |
| **docs**   | 文档、注释、README       |

### 优先级（priority）

| 优先级       | 说明                                 |
| ------------ | ------------------------------------ |
| **critical** | 阻塞核心功能，数据丢失风险，安全问题 |
| **high**     | 显著影响，影响常见工作流，重复问题   |
| **medium**   | 中等影响，有变通方案                 |
| **low**      | 轻微不便，边缘情况，锦上添花         |

### 状态（status）

| 状态                  | 含义                  |
| --------------------- | --------------------- |
| **pending**           | 待处理                |
| **in_progress**       | 正在处理（PR 创建后） |
| **resolved**          | 已解决（PR 合并后）   |
| **wont_fix**          | 不处理（需说明原因）  |
| **promoted**          | 已推广到文档          |
| **promoted_to_skill** | 已提取为技能          |

## 集成方式

### OpenClaw 运行时集成

在 `openclaw/runtime/session.py` 中添加：

```python
from skills.self_improvement import reflect

# 追踪阿布的建议
abot_suggestions = []

async def on_abot_response(response):
    """追踪阿布的建议"""
    abot_suggestions.append({
        "id": generate_id(),
        "content": response,
        "timestamp": datetime.now()
    })
    # 清理超过 5 分钟的建议
    cleanup_old_suggestions()

async def on_user_message(message):
    """检测用户消息中的反思触发器"""

    # 1. 用户纠正
    if any(kw in message for kw in ["No, that's wrong", "Actually", "不对", "错了"]):
        await reflect(
            type="correction",
            finding=f"用户纠正：{message}",
            priority="high"
        )

    # 2. 修复行为（阿布引入的问题）
    if any(kw in message for kw in ["fix", "修复", "修正", "改一下", "revert"]):
        recent = [s for s in abot_suggestions
                 if datetime.now() - s["timestamp"] < timedelta(minutes=5)]
        if recent:
            await reflect(
                type="correction",
                finding=f"阿布的建议导致需要修复：{recent[-1]['content']}",
                suggestion="优化建议前的验证逻辑",
                priority="critical",
                area="skill"
            )

    # 3. 功能请求
    if any(kw in message for kw in ["Can you also", "I wish", "能不能", "有没有"]):
        await reflect(
            type="insight",
            finding=f"功能请求：{message}",
            priority="medium"
        )
```

### 工具执行后检测

在 `openclaw/runtime/tool_executor.py` 中添加：

```python
async def execute_tool(tool_call):
    result = await execute(tool_call)

    # 命令失败
    if result.exit_code != 0:
        await reflect(
            type="error",
            finding=f"命令失败：{tool_call.command}\n{result.stderr}",
            priority="high",
            area="infra"
        )

    return result
```

## 脚本用法（内部使用）

### 反思生成

```bash
python3 skills/self-improvement/scripts/reflect.py \
  --session-id main/xxx \
  --type correction \
  --dimension ai \
  --area config \
  --finding "回答不够准确" \
  --suggestion "优化 prompt" \
  --priority high
```

### Wakeup 报告

```bash
python3 skills/self-improvement/scripts/wakeup_report.py
```

### 生成 PR

```bash
# 列出待处理的反思
python3 skills/self-improvement/scripts/auto_pr.py --list

# 为高优先级反思生成 PR
python3 skills/self-improvement/scripts/auto_pr.py --reflection-id LRN-20260331-001
```

### Promotion 到文档

```bash
# 推广到 AGENTS.md
python3 skills/self-improvement/scripts/promote.py \
  --reflection-id LRN-20260331-001 \
  --target AGENTS.md
```

### Promotion 到技能

```bash
# 提取为技能
python3 skills/self-improvement/scripts/promote.py \
  --reflection-id LRN-20260331-001 \
  --skill my-skill-name
```

### 重复追踪

```bash
# 追踪重复模式
python3 skills/self-improvement/scripts/recurrence_tracker.py \
  --pattern-key simplify.dead_code

# 列出所有重复模式
python3 skills/self-improvement/scripts/recurrence_tracker.py --list
```

## 反思记录格式

```json
{
  "id": "LRN-20260331-001",
  "type": "correction|insight|knowledge_gap|best_practice",
  "dimension": "ai|user|interaction",
  "area": "config|skill|prompt|infra|docs",
  "timestamp": "2026-03-31T13:00:00+08:00",
  "sessionId": "main/xxx",
  "category": "config|skill|prompt|input-clarity|interaction",
  "priority": "critical|high|medium|low",
  "triggerType": "realtime-keyword|periodic|manual|auto-detect",
  "finding": "context tokens 经常超限",
  "suggestion": "将 contextLimit 从 1000 提升到 2000",
  "impact": "减少 retry，提升成功率",
  "occurrenceCount": 1,
  "recurrenceCount": 1,
  "sessionIds": ["main/xxx"],
  "lastSeen": "2026-03-31T13:00:00+08:00",
  "firstSeen": "2026-03-31T13:00:00+08:00",
  "applicableTo": "ai|user|both",
  "status": "pending|in_progress|resolved|wont_fix|promoted|promoted_to_skill",
  "skillPath": "skills/my-skill",
  "patternKey": "simplify.dead_code",
  "relatedFiles": ["skills/xxx/config.json"],
  "tags": ["tag1", "tag2"],
  "seeAlso": ["LRN-20260330-001"],
  "diff": {
    "file": "skills/xxx/config.json",
    "old": { "timeout": 5000 },
    "new": { "timeout": 10000 }
  },
  "fullContent": "完整的反思内容（可选）",
  "resolution": {
    "resolvedAt": "2026-03-31T14:00:00+08:00",
    "commit": "abc123",
    "pr": "#42",
    "notes": "简要描述解决方案"
  }
}
```

## ID 生成规则

**格式**：`TYPE-YYYYMMDD-XXX`

- `TYPE`: `LRN` (learning), `ERR` (error), `FEAT` (feature)
- `YYYYMMDD`: 当前日期
- `XXX`: 当日序号（001, 002, ...）

**示例**：

- `LRN-20260331-001` - 2026-03-31 第 1 条学习
- `ERR-20260331-002` - 2026-03-31 第 2 条错误
- `FEAT-20260331-003` - 2026-03-31 第 3 条功能请求

## Promotion 机制

### 推广条件（满足任一）

- recurrenceCount >= 3
- 跨 2+ 不同任务
- 30 天内发生
- 用户明确说「保存为技能」

### 推广目标

| 目标          | 内容                      |
| ------------- | ------------------------- |
| `CLAUDE.md`   | 项目事实/约定/陷阱        |
| `AGENTS.md`   | Agent 工作流/工具使用模式 |
| `SOUL.md`     | 行为准则/沟通风格         |
| `TOOLS.md`    | 工具能力/使用指南/陷阱    |
| `skills/xxx/` | 可复用技能                |

### 推广流程

1. 识别高价值反思
2. 提炼为简洁规则
3. 添加到目标文件
4. 更新反思状态为 promoted/promoted_to_skill
5. 添加 skillPath 字段

## 依赖

- Git（仓库环境）
- Python 3.6+

## 注意事项

- **运行时机制** - 不是普通 skill，是 OpenClaw 运行时的一部分
- **自动触发** - 不需要手动调用，自动检测会话中的反思触发器
- **用户确认** - 所有 PR 需要用户确认后才合并
- **状态追踪** - 反思状态会自动流转（pending → in_progress → resolved/promoted/promoted_to_skill）
