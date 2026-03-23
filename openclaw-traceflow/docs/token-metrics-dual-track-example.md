# Token 双轨：进行中 / 归档 / 日志估算 — 字段溯源与示例数据

本文说明仪表盘 **Token 汇总**柱状图中各数字的来源，并给出一份**模拟但可对照实现**的 API 形状示例（便于确认「进行中」与「归档」都能非空时的形态）。

## 1. 「进行中」列（metrics：`id` 形如 `token-…`）

| 展示项 | 来源 |
|--------|------|
| 记录值合计 / In / Out | `GET /api/metrics/token-summary` 的 `activeTokens` / `activeInput` / `activeOutput` |
| 底层数据 | 本地 `metrics.db` → `token_usage` 表，时间窗内每个 `session_id` **只取最新一条** `token-%` 行后汇总 |
| 采集方式 | TraceFlow 约每 30s 对 `listSessions()` 中有 `tokenUsage` 的会话写入快照（**不**按 `active`/`idle` 二选一过滤） |

## 2. 「归档」列（metrics：`id` 形如 `archived-…`）

| 展示项 | 来源 |
|--------|------|
| 记录值合计 / In / Out | `token-summary` 的 `archivedTokens` / `archivedInput` / `archivedOutput` |
| 底层数据 | `token_usage` 中 `archived-{sessionId}-{resetTimestamp}` 行在时间窗内 **SUM** |
| 日志侧 | OpenClaw 状态目录下 `*.jsonl.reset.*`：每次「新开对话」对应一轮归档，解析其中 **最后一条带 usage 的累计** |

**常见为 0 的原因**：从未触发 `/new` 或等价重置、reset 文件里没有带 usage 的行、时间窗内没有新的归档快照、或采集尚未写入。此时**不代表没有消耗**——当前轮用量在「进行中」侧。

## 3. 「估算(log)」柱（分桶）

| 展示项 | 来源 |
|--------|------|
| 进行中 / 归档 两柱 | `aggregateStaleAndEstimated`：仅对 `totalTokensFresh === false` 的会话，用 `estimatedTokensFromLog`（日志字节启发式）按 `token-usage-by-session-key` 的 `activeTokens` / `archivedTokens` 分到左或右桶 |
| 无 per-key 行时 | 可能落入「未分桶」统计，图中两柱可能都接近 0 |

## 4. 示例 JSON（双桶均有记录值）

见同目录下 [`fixtures/token-metrics-dual-track.example.json`](./fixtures/token-metrics-dual-track.example.json)。数值为**示意**，用于对照字段名与结构；真实环境以运行时 API 为准。
