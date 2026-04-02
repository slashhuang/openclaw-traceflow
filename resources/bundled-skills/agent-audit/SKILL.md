---
name: agent-audit
description: "Agent 贡献审计：增量扫描 OpenClaw transcript JSONL，统计代码交付和问答服务数据。"
metadata:
  {
    "openclaw": {
      "emoji": "📊",
      "requires": { "bins": ["node", "git"] },
      "runtime": false,
    },
  }
---

# Agent 贡献审计

## 触发场景

1. **每天 23:00 定时任务自动执行**
2. **用户说**："跑一下审计"、"审计报告"、"贡献统计"、"bot 做了什么"

## 输出格式

### 文件结构

```
.openclawAudits/
├── anchors.json              # 扫描锚点
├── events/
│   └── YYYY-MM.jsonl         # 月度事件流
└── snapshots/
    ├── latest.json           # 最新快照
    └── YYYY-MM.json          # 月度快照
```

### anchors.json

```json
{
  "version": 1,
  "lastRunAt": "2026-04-02T15:00:00Z",
  "files": {
    "session-xxx.jsonl": {
      "byteOffset": 12345,
      "lineCount": 100,
      "sessionKey": "agent:main:main",
      "status": "active"
    }
  }
}
```

### events/YYYY-MM.jsonl

每行一个事件，支持两种类型：

**代码交付事件**:
```json
{
  "type": "code_delivery",
  "timestamp": "2026-04-02T15:00:00Z",
  "sessionId": "main/xxx",
  "senderId": "ou_xxx",
  "senderName": "爸爸",
  "mr": {
    "platform": "github",
    "project": "owner/repo",
    "iid": 123,
    "url": "https://github.com/owner/repo/pull/123",
    "title": "feat: xxx"
  },
  "tokenUsage": { "input": 1000, "output": 100 }
}
```

**问答服务事件**:
```json
{
  "type": "qa",
  "timestamp": "2026-04-02T15:00:00Z",
  "sessionId": "main/xxx",
  "senderId": "ou_xxx",
  "tags": ["code/pr", "general-qa"],
  "userMessage": "帮我创建个 PR",
  "tokenUsage": { "input": 1000, "output": 100 }
}
```

### snapshots/latest.json

```json
{
  "generatedAt": "2026-04-02T15:00:00Z",
  "codeDelivery": {
    "totalMRs": 5,
    "byInitiator": { "ou_xxx": { "displayName": "爸爸", "total": 5, "repos": ["owner/repo"] } },
    "byRepo": { "owner/repo": 5 }
  },
  "qaService": {
    "totalQuestions": 50,
    "uniqueUsers": 3,
    "byUser": { "ou_xxx": { "displayName": "爸爸", "questions": 50, "tags": { "code/pr": 30 } } },
    "byTag": { "code/pr": 30, "general-qa": 20 }
  },
  "automation": { "totalRuns": 10, "byType": { "daily-report": 10 } },
  "cost": { "totalInputTokens": 100000, "totalOutputTokens": 10000 }
}
```

## 环境变量

- `OPENCLAW_AUDIT_DIR` — 覆盖审计输出目录
- `OPENCLAW_SESSIONS_DIR` — 覆盖 sessions 目录

## 触发格式（供 runtime 参考）

```yaml
triggers:
  schedule:
    - cron: "0 23 * * *"  # 每天 23:00
  keywords:
    - "跑一下审计"
    - "审计报告"
    - "贡献统计"
    - "bot 做了什么"
```
