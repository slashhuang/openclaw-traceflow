# OpenClaw TraceFlow — Roadmap

本文档记录产品方向与**已识别的技术债**（含性能）。实现以仓库代码为准；欢迎通过 Issue / PR 讨论优先级。

---

## 性能与可扩展性（已知问题 → 计划）

以下条目来自代码审阅（`MetricsService.refreshToolStatsSnapshot`、`DashboardController`、`MetricsModule` 后台采集、`HealthService` 等）。

| 优先级 | 问题 | 影响 | 可能方向（非承诺） |
|--------|------|------|---------------------|
| **P0** | **工具/Skill 聚合** `refreshToolStatsSnapshot()` 对 `listSessions()` 返回的**每个**会话调用 `getSessionDetail(sessionId)`，顺序读取并解析 JSONL | 会话数多时，单次聚合为 **O(n) 次磁盘读 + 解析**；仪表盘在快照过期（约 45s）时会触发；后台 **每 30s** 的 Token 采集前也会调用 | 增量/采样聚合（仅活跃会话、时间窗口、或复用 hook_metrics）；并行化 + 上限；缓存工具统计结果并异步刷新 |
| **P1** | **`GET /api/dashboard/overview`** 单次请求内并行拉取：Gateway bundle、`health`（含本地 **120ms** CPU 采样）、全量 `listSessions`、多项 metrics SQL、`refreshToolStatsSnapshot`（可能触发 P0） | 首包延迟与 CPU 在高峰时明显 | 拆分「轻量轮询」与「重聚合」接口；health 采样改为节流/缓存；工具统计与 overview 解耦 |
| **P1** | **`MetricsModule` 定时任务**（约 30s）：`listSessions` + `refreshToolStatsSnapshot` + 逐会话 `recordTokenUsage` + 归档扫描 + `flushDatabase` | 后台持续占用磁盘与 CPU，与会话数正相关 | 降低频率或可配置；批量写入；跳过未变化会话 |
| **P2** | **`getTokenUsageBySessionKey`** 对每个 sessionKey 调用 `getSession` 解析模型 | 唯一 sessionKey 多时循环次数多 | 模型信息写入 metrics 表或单次批量查询 session 缓存 |
| **P2** | **`getHealthStatus` 中 `collectLocalRuntimeStats`** 固定 **await 120ms** | 每次健康检查增加至少 120ms 延迟 | 降频、缓存上次结果，或改为非阻塞近似值 |
| **P3** | **sql.js** 全库内存 + 定时落盘 | 历史 metrics/token 行数极大时内存与 I/O 压力 | 归档/限保留窗口；或迁移至持久化 SQLite（better-sqlite3 等）需评估 |
| **P3** | **并发指标等** 部分接口仍为占位或简化实现 | 与真实 Gateway 负载可能不一致 | 对接真实数据源或标注「实验性」 |

### 已有缓解（无需重复造轮子）

- 会话列表：`FileSystemSessionStorage` 增量扫描 + 短 TTL 缓存；`listSessions` 主要为内存合并与排序。
- 工具/Skill 聚合：`refreshToolStatsSnapshot()` 对每个会话计算 **fingerprint**（`lastActiveAt` + transcript 大小 + `status`）；与上次一致则**跳过** `getSessionDetail` 的重复 JSONL 解析，降低稳态 CPU/磁盘（会话数仍多时最坏情况仍可能触发 P0 路径）。
- 会话详情：`getSessionDetail` 对大 JSONL 使用 **head/tail 窗口**，避免全量读超大 transcript（见 `SESSION_JSONL_*` 常量）。
- Gateway：长驻 WebSocket，避免每次 RPC 重新握手。
- 仪表盘：`GET /api/dashboard/overview` 单次聚合多类数据，减少前端轮询往返（单次请求内仍可能叠加 P0/P1 成本）。

---

## 功能 Roadmap（产品向）

### 近期

- 性能：P0/P1 项中至少一项落地（见上表）。
- 文档：与本仓库 `README.md` 保持同步。

### 中期（示例）

- Memory / 时间线类可视化（需设计）。
- 多 Gateway 实例切换（配置与 UI）。

### 长期（示例）

- 跨实例聚合与健康检查。
- Metrics 长期保留策略与趋势分析。

---

## 如何贡献

优先带来：**复现数据**（会话数量级、一次 `/api/dashboard/overview` 的耗时）、**profiler 片段**或**针对 P0 的 PR**（例如为 `refreshToolStatsSnapshot` 增加会话数上限或后台队列）。
