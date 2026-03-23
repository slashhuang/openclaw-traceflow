# 宣发用参考：README.zh-CN 与官方截图

写稿、配图、核对口径时，**以仓库内产品文档为准**。本页只做**路径索引**，避免宣发文与实现脱节。

---

## 权威文档

| 说明 | 路径（相对 monorepo 根 `claw-sources/`） |
|------|--------------------------------------------|
| 中文产品说明（能力对比、概述、路由、性能、安全、故障） | [`openclaw-traceflow/README.zh-CN.md`](../../openclaw-traceflow/README.zh-CN.md) |
| 英文对照 | [`openclaw-traceflow/README.md`](../../openclaw-traceflow/README.md) |
| Monorepo 协作与 Gateway 说明（贡献者向） | 仓库根 [`AGENTS.md`](../../AGENTS.md) |
| 性能债与路线图 | [`openclaw-traceflow/ROADMAP.md`](../../openclaw-traceflow/ROADMAP.md) |

**一句话（摘自 README.zh-CN 首段）**  
面向 OpenClaw Agent 的**可观测** Web 应用：**会话、Skill、Token 用量与告警、延迟（P50/P95/P99）、System Prompt 分析、模型计价与实时日志**；独立 NestJS + React，**中/英**界面。

---

## 官方界面截图目录

目录（相对 monorepo）：**`openclaw-traceflow/docs/traceFlowSnapshots/`**

与 **README.zh-CN.md「界面截图」** 小节一一对应，发公众号 / 小红书 / 知乎时可按需选用：

| 文件名 | README 中的用途 |
|--------|-------------------|
| `dashboard-1.png` | 仪表盘 |
| `sessionList.png` | 会话列表 |
| `sessionDetail.png` | 会话详情 |
| `skills.png` | Skills |
| `systemPrompt.png` | System Prompt |
| `tokenMonitor.png` | Token 监控 |
| `models.png` | 模型价格 |

**Markdown 引用示例（在 `openclaw-traceflow` 目录下写 README 时）：**

```text
![仪表盘](./docs/traceFlowSnapshots/dashboard-1.png)
```

宣发素材若放在**公众号图床**，建议仍保留**与 README 同一套截图**，避免「文不对图」。  

**公众号长文插图占位**：[`wechat-article-openclaw-traceflow.md`](./wechat-article-openclaw-traceflow.md) 正文中已标 **【插图 1】～【插图 4（可选）】**，并写明推荐文件名（即本目录下各 `*.png`）；发稿时把占位段删掉，换成你上传后的图 + 图注即可。  

---

## 界面路由速查（摘自 README.zh-CN）

| 路径 | 说明 |
|------|------|
| `/`、`/dashboard` | 总览：Gateway 健康、Token、延迟、工具等 |
| `/sessions`、`/sessions/:id` | 会话列表与详情 |
| `/skills` | Skill 使用统计 |
| `/system-prompt` | System Prompt 分析 |
| `/tokens` | Token 监控与告警 |
| `/pricing` | 模型价格 |
| `/logs` | 实时日志（Socket.IO） |
| `/settings` | Gateway 地址、路径、访问控制 |

---

## 写稿时注意（避免过度承诺）

- **统计口径**：README 强调主要区块有 **ℹ**，如 live `*.jsonl` vs `*.jsonl.reset.*`、活跃/归档等——宣发可说「口径可追溯」，具体数字以界面为准。  
- **安全**：README 写明勿在未隔离网络下暴露 TraceFlow——宣发若提「部署」，可顺带一句**内网或代理鉴权**。  
- **图片版权**：`traceFlowSnapshots` 为产品截图，与开源仓库一并分发即可；若媒体要求无 UI 水印，用当前仓库内导出图。
