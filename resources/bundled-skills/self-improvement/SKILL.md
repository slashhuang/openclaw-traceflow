---
name: self-improvement
description: 'Captures learnings, errors, corrections, and insights to enable continuous improvement.'
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

# Self-Improvement

## 触发场景

1. 用户纠正（"不对"、"错了"、"反思下"）
2. 用户要求修复（"fix"、"修复"）
3. 命令执行失败
4. 发现更好的方法

## 输出格式

### 文件结构

```
.openclawSelfImprovements/
└── reflections.jsonl    # 反思记录（JSONL 格式）
```

### reflections.jsonl

每行一个反思记录：

```json
{
  "id": "LRN-20260402-001",
  "type": "correction",
  "dimension": "ai",
  "area": "skill",
  "timestamp": "2026-04-02T15:00:00+08:00",
  "sessionId": "main/xxx",
  "category": "skill",
  "priority": "high",
  "triggerType": "realtime-keyword",
  "finding": "擅自合并 PR，没有等用户审批",
  "suggestion": "所有 PR 必须等用户审批后才能合并",
  "impact": "违反审批流程，可能导致未经审查的代码合并",
  "occurrenceCount": 1,
  "sessionIds": ["main/xxx"],
  "applicableTo": "ai",
  "status": "pending",
  "patternKey": "pr.approval.required",
  "tags": ["PR", "approval", "workflow"]
}
```

### 字段说明

| 字段        | 说明        | 示例                                                      |
| ----------- | ----------- | --------------------------------------------------------- |
| `id`        | 反思记录 ID | `LRN-20260402-001`                                        |
| `type`      | 类型        | `correction`, `insight`, `knowledge_gap`, `best_practice` |
| `dimension` | 维度        | `ai`, `user`, `interaction`                               |
| `area`      | 领域        | `config`, `skill`, `prompt`, `infra`, `docs`              |
| `priority`  | 优先级      | `critical`, `high`, `medium`, `low`                       |
| `status`    | 状态        | `pending`, `in_progress`, `resolved`, `promoted`          |

## 环境变量

- `OPENCLAW_AUDIT_DIR` — 覆盖输出目录（默认：`.openclawSelfImprovements`）

## 触发格式（供 runtime 参考）

```yaml
triggers:
  keywords:
    - '不对'
    - '错了'
    - '反思下'
    - 'fix'
    - '修复'
  events:
    - command_failed
    - better_approach_found
```
