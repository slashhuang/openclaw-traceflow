# Agent Audit - 贡献审计

扫描 OpenClaw transcript JSONL，统计 Agent 的代码交付和问答服务数据。

## 快速开始

```bash
# 扫描（首次自动全量，之后自动增量）
node skills/agent-audit/scripts/audit-scanner.mjs
```

扫描完成后数据写入 `~/.openclaw/workspace/.openclawAudits/`：

```
.openclawAudits/
├── anchors.json              # 扫描进度锚点
├── events/2026-03.jsonl      # 审计事件（按月分片）
└── snapshots/latest.json     # 最新聚合快照
```

## 参数

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--sessions-dir <path>` | transcript JSONL 目录 | `~/.openclaw/agents/main/sessions` |
| `--audit-dir <path>` | 审计输出目录 | `~/.openclaw/workspace/.openclawAudits` |
| `--user-md <path>` | USER.md 路径（用于 ID 归一化） | `~/.openclaw/workspace/USER.md` |
| `--full` | 强制全量重扫（锚点损坏或想重建时用） | - |
| `--snapshot` | 仅重建快照，不扫描 | - |

## 定时任务配置

在 OpenClaw 的 BOOT.md 或对话中添加 cron job：

```jsonc
// 每天 23:00 自动扫描
{
  "name": "每日贡献审计",
  "schedule": { "kind": "cron", "expr": "0 23 * * *", "tz": "Asia/Shanghai" },
  "sessionTarget": "isolated",
  "payload": {
    "kind": "agentTurn",
    "message": "执行贡献审计扫描：运行 node skills/agent-audit/scripts/audit-scanner.mjs，完成后读取 snapshots/latest.json 输出今日摘要。"
  },
  "delivery": { "mode": "announce", "channel": "wave", "to": "user:ou_xxx" }
}
```

也可以在对话中直接让 bot 创建：

> "帮我配一个每天 23:00 的审计定时任务，结果发给我"

### 月度报表

```jsonc
// 每月 1 号 09:00 生成上月报表
{
  "name": "月度贡献报表",
  "schedule": { "kind": "cron", "expr": "0 9 1 * *", "tz": "Asia/Shanghai" },
  "sessionTarget": "isolated",
  "payload": {
    "kind": "agentTurn",
    "message": "生成上月 Agent 贡献月报：先运行 audit-scanner.mjs 确保数据最新，然后读取 snapshots/latest.json 和 events/ 中的 userMessage 采样，用 AI 总结生成完整月报（代码交付 + 问答服务），发送给晓刚。"
  },
  "delivery": { "mode": "announce", "channel": "wave", "to": "user:ou_xxx" }
}
```

## 手动触发

在对话中说以下任意一句：

- "跑一下审计"
- "更新审计数据"
- "看下贡献统计"
- "生成贡献报表"

## 输出示例

```
📊 Bot 贡献统计

💻 代码交付: 6 MRs
  晓刚: 3 MRs (wave-openclaw-wrapper)
  坚圣: 2 MRs (stellar-fe, wave-openclaw-wrapper)
  马达: 1 MR (wave-openclaw-wrapper)

💬 问答服务: 196 questions, 16 users
  Top: 晓刚 60q, 马达 48q, 玲玲 23q

🏷️ 标签: general-qa(78) > code/mr(23) > wave-api(21) > tapd(10)

🤖 自动化: 4 runs
```

## 原理

1. JSONL 是 append-only → 用 byteOffset 锚点做增量扫描
2. 从 assistant 的 toolCall block 提取 exec command / read path
3. 规则引擎做标签分类（零 LLM 消耗）
4. 报表生成时才用 LLM 做自然语言总结

详细设计见 [PRD](../../docs/PRD-agent-contribution-audit.md)。
 skills/agent-audit/SKILL.md  0 → 100644
+
91
−
0

Viewed
---
name: agent-audit
description: "Agent 贡献审计：增量扫描 OpenClaw transcript JSONL，统计代码交付和问答服务数据。触发场景：(1) 每天 23:00 定时任务自动执行 (2) 用户说'跑一下审计'/'审计报告'/'贡献统计'/'bot 做了什么' (3) 用户问某人使用 bot 的情况 (4) 需要生成月度/周度贡献报表。覆盖：增量扫描、事件提取、快照聚合、AI 总结报表。"
---

# Agent 贡献审计

增量扫描 OpenClaw transcript JSONL，低负荷统计 Agent 对团队的贡献。

## 核心维度

1. **代码交付** — 谁通过 bot 创建了 MR，涉及哪些仓库
2. **问答服务** — 服务了多少人（团队内/外），问题标签分布

## 数据位置

```
~/.openclaw/workspace/.openclawAudits/
├── anchors.json           # JSONL 扫描锚点
├── events/YYYY-MM.jsonl   # 审计事件流（按月分片）
└── snapshots/
    ├── latest.json        # 最新快照
    └── YYYY-MM.json       # 月度快照
```

团队成员列表从 `USER.md` 自动推断，不需要额外配置。

## 扫描执行

### 自动（cron 每天 23:00）

定时任务调用脚本完成增量扫描 + 快照重建。

### 手动触发

用户在对话中说"跑一下审计"等触发词时执行：

```bash
node skills/agent-audit/scripts/audit-scanner.mjs \
  --sessions-dir <sessions_path> \
  --audit-dir <workspace>/.openclawAudits
```

参数说明：
- `--sessions-dir` — OpenClaw transcript JSONL 目录，默认 `~/.openclaw/agents/main/sessions`
- `--audit-dir` — 审计输出目录，默认 `~/.openclaw/workspace/.openclawAudits`
- `--user-md` — USER.md 路径，默认 `~/.openclaw/workspace/USER.md`
- `--full` — 忽略锚点，全量重扫
- `--snapshot` — 仅重建快照（不扫描新数据）

## 报表生成

扫描完成后，读取 `snapshots/latest.json`，结合 `events/` 中的 `userMessage` 采样，
用 LLM 生成自然语言总结。

### 报表 prompt 组装

1. 读取 `snapshots/latest.json` 作为数据上下文
2. 从 events 中每人取 5-10 条代表性 `userMessage`（优先不同标签）
3. 要求 LLM 生成 2-3 段总结：谁做了什么、高频场景、差异化价值

### 报表示例

```
📊 Bot 贡献月报 (2026-03)

## AI 总结
本月 bot 服务了 8 位团队成员和 2 位外部同学。
代码方面：帮晓刚创建了 5 个 MR...
问答方面：高频场景是 Code Review(78次) 和 TAPD Bug 查询(62次)...

## 📊 详细数据
（数字表格）
```

## 标签分类规则

基于 tool call 特征，零 LLM 消耗：

| 信号 | 标签 |
|------|------|
| exec 含 `gitlab-mr.mjs --create` | `code/mr-create` |
| exec 含 `git push` | `code/push` |
| exec 含 `tapd-bug` | `tapd/bug` |
| wave_search_documents 调用 | `knowledge-base` |
| read 路径匹配 `skills/<name>/` | `skill/<name>` |
| 无 tool call | `general-qa` |

## PRD 详情

完整设计见 `docs/PRD-agent-contribution-audit.md`（同仓库）。
