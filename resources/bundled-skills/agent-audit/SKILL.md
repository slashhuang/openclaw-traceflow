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
