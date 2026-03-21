# OpenClaw TraceFlow

[![License](https://img.shields.io/badge/license-MIT-blue)](/LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20.11.0-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-%3E%3D9.0.0-F69220?logo=pnpm&logoColor=white)](https://pnpm.io/)
[![NestJS](https://img.shields.io/badge/NestJS-11-E0234E?logo=nestjs&logoColor=white)](https://nestjs.com/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)](https://vite.dev/)

## English

**OpenClaw TraceFlow** is an observability UI for the OpenClaw Agent: sessions, skills, token usage & alerts, latency (P50/P95/P99), system prompt analysis, model pricing, and live logs.

- **Gateway integration**: uses a **long-lived WebSocket** to the OpenClaw Gateway (same idea as Control UI)—`status`, `usage.status`, `logs.tail`, `skills.status`, etc., reuse one connection instead of connect-per-RPC. Config changes recreate the client.
- **Defaults**: TraceFlow listens on **`http://0.0.0.0:3001`** (or `PORT` / `HOST`). Gateway URL defaults to **`http://localhost:18789`** (`OPENCLAW_GATEWAY_URL`).
- **Dashboard polling**: the main dashboard refreshes about **every 10 seconds** when the browser tab is **visible** (not 3s).
- **Performance**: TraceFlow is optimized for **small-to-medium** session counts on a single host. With **many** sessions (hundreds+), CPU and disk I/O can spike because tool/skill Top-5 metrics are computed by scanning session transcripts (see **`ROADMAP.md`**). Plan capacity accordingly or contribute optimizations.
- **Quick start**: `pnpm install` → `pnpm run deploy:pm2` → open **`http://localhost:3001`**. Dev: `pnpm run start:dev` (backend); frontend dev uses Vite and proxies `/api` to the backend (see **中文** for `VITE_API_PROXY_TARGET`).

Full routes, environment variables, REST API tables, troubleshooting, and **performance notes (中文)** are in the sections below. Product/performance backlog: **`ROADMAP.md`**.

---

## 中文

**让 AI 助手更可观测**——OpenClaw 追踪流仪表盘（持续迭代中）。

> **为什么需要 TraceFlow？** 当助手每天处理大量会话时，你需要看清：Skill 调用分布、Token 是否逼近上限、SystemPrompt 是否臃肿、延迟 P50/P95/P99、以及实时日志。TraceFlow 提供**可观测性**，而不仅是另一个空壳面板。  
> 功能与文档会随版本更新；实现细节以本仓库代码为准。

---

### 环境要求

| 项 | 版本 |
|----|------|
| Node.js | `>= 20.11.0`（推荐 20 LTS） |
| pnpm | `>= 9.0.0`（lockfile v9） |
| PM2 | 可选（`deploy:pm2`） |

```bash
node -v
pnpm -v
# 未安装 pnpm：npm i -g pnpm
```

---

### 构建与部署

| 命令 | 说明 |
|------|------|
| `pnpm run build:all` | 构建后端 + 前端 |
| `pnpm run deploy:pm2` | 构建并以 PM2 启动（带重启保护） |
| `pnpm run release` | 构建并打 npm 包 |

**生产（PM2，推荐）**

```bash
pnpm install
pnpm run deploy:pm2
# 浏览器访问 http://localhost:3001
```

**开发**

```bash
cd openclaw-traceflow
pnpm install
pnpm run start:dev
```

单独跑前端（Vite 默认端口见 `frontend/vite.config.js`）时，`/api` 会代理到后端；若本机 `3001` 不是本服务，请设置 **`VITE_API_PROXY_TARGET`** 再启动前端。

---

### 与 Control UI 的差异（能力对照）

| 能力 | Control UI | TraceFlow |
|------|------------|-----------|
| Skill 调用追踪（基于 read 工具反推） | — | 有 |
| 用户维度 Skill 统计 | — | 有 |
| Token 多级阈值与排行 | 基础 | 增强 |
| SystemPrompt 分析与建议 | — | 有 |
| 延迟 P50/P95/P99 | — | 有 |
| 部署 | 随 Gateway | 独立 Nest + React，可 PM2/Docker |

---

### 页面路由

| 路由 | 说明 |
|------|------|
| `/` / `/dashboard` | 仪表盘（Gateway 状态、Token/延迟/工具等） |
| `/sessions` | 会话列表 |
| `/sessions/:id` | 会话详情 |
| `/skills` | Skill 使用统计 |
| `/system-prompt` | System Prompt 解析与探测 |
| `/tokens` | Token 监控与告警 |
| `/pricing` | 模型价格配置 |
| `/logs` | 实时日志（Socket.IO） |
| `/settings` | Gateway / 路径 / 访问控制 |

截图可参考 `docs/traceFlowSnapshots/` 下图片（若有）。

---

### 性能提示与限制（部署前请读）

TraceFlow 面向**单机、中等规模**会话与指标；在**会话量很大**（例如数百上千个会话目录）时，请预留更多 **CPU、磁盘 IOPS** 与内存。

| 现象 | 原因（摘要） |
|------|----------------|
| 仪表盘/API 偶发变慢 | `GET /api/dashboard/overview` 会并行聚合健康检查、会话列表、Gateway、metrics 等；健康检查含约 **120ms** 的本地 CPU 采样。 |
| CPU/磁盘在空闲时仍跳动 | 后台 **约每 30s** 采集 token 与工具统计；工具/Skill **Top 5** 当前通过对**每个会话**拉取详情并解析 transcript 聚合，复杂度随会话数**近似线性**增长。 |
| `data/metrics.db` 变大 | 指标与 token 历史使用 **sql.js**（内存库 + 定期落盘），数据量持续增长会占用更多内存与写入。 |

**缓解建议（运维）**：控制同一 TraceFlow 实例上的会话规模；使用更快磁盘（SSD）；监控进程 CPU 与 `data/` 目录大小。  
**改进计划**：见仓库根目录 **`ROADMAP.md`**（含优先级与可能技术方向）。

---

### 技术架构（摘要）

```
OpenClaw Gateway ──(WebSocket RPC，长连接)──▶ TraceFlow 后端 (NestJS)
        │                                          │
        └── 会话数据 / 可选本地日志 ───────────────┼──▶ React 前端 (Vite)
```

| 特性 | 说明 |
|------|------|
| 对接 Gateway | 长驻 WebSocket + HTTP `/health`；仪表盘数据主要由 `/api/dashboard/overview` 聚合 |
| 本地数据 | `sql.js`、metrics 落盘 `./data/metrics.db` |
| 实时日志 | Socket.IO 命名空间 `logs`；仪表盘在**页签可见**时约 **10s** 拉取 overview |

---

### 环境变量（摘要）

| 变量 | 说明 | 默认 |
|------|------|------|
| `OPENCLAW_GATEWAY_URL` | Gateway HTTP 基址 | `http://localhost:18789` |
| `OPENCLAW_GATEWAY_TOKEN` / `OPENCLAW_GATEWAY_PASSWORD` | Gateway 鉴权（WS/RPC） | 无 |
| `OPENCLAW_STATE_DIR` / `OPENCLAW_WORKSPACE_DIR` | 路径覆盖（可选） | 自动解析 |
| `OPENCLAW_LOG_PATH` | 本地日志回退（Gateway 不可用时） | 无 |
| `OPENCLAW_RUNTIME_ACCESS_TOKEN` | 保护 `api/setup/*`（`OPENCLAW_ACCESS_MODE=token`） | 无 |
| `OPENCLAW_ACCESS_MODE` | `local-only` \| `token` \| `none` | `none` |
| `HOST` | 监听地址 | `0.0.0.0` |
| `PORT` | 端口 | `3001` |
| `DATA_DIR` | 数据目录 | `./data` |

详见下方 REST 表与 `config/README.md`（`openclaw.runtime.json`）。

---

### 价格配置

Token 页费用估算依赖模型单价。内置默认价表；可通过 `config/model-pricing.json`（参考 `config/model-pricing.example.json`）覆盖。价格表为文档化参考，以你本地配置为准。

---

### 安全与访问模式

仅 **`/api/setup/*`**（首次配置、保存、测连、生成 token）受 `OPENCLAW_ACCESS_MODE` 约束；其余读取类接口当前不做统一 Bearer 校验（部署在公网时请自行网络隔离或使用反向代理鉴权）。

| 模式 | 行为 |
|------|------|
| `local-only` | 仅本机 IP 可改配置 |
| `token` | 改配置需 `Authorization: Bearer <OPENCLAW_RUNTIME_ACCESS_TOKEN>` |
| `none` | 不校验（仅信任网络下使用） |

---

### REST API（精选）

| Path | Method | 说明 |
|------|--------|------|
| `/api/health` | GET | 健康与 Gateway 连接摘要 |
| `/api/status` | GET | Gateway `status`/`usage` 概览（JSON） |
| **`/api/dashboard/overview`** | **GET** | **仪表盘聚合**：health、statusOverview、sessions、recentLogs、metrics 等；可选 `?timeRangeMs=` |
| `/api/sessions` | GET | 会话列表 |
| `/api/sessions/:id` | GET | 会话详情（含大文件 `head_tail` 等字段） |
| `/api/sessions/:id/status` | GET | 单会话状态 |
| `/api/sessions/:id/kill` | POST | 终止会话 |
| `/api/sessions/token-usage` | GET | Token 使用相关 |
| `/api/logs` | GET | 最近日志 |
| `/api/skills/*` | GET | Skills 统计、system prompt 分析/探测 |
| `/api/pricing/*` | GET/POST/DELETE | 价格配置 |
| `/api/metrics/*` | GET | 延迟、tools/skills、token 汇总等 |
| `/api/actions/*` | POST | 重启 Gateway、清理日志等 |
| `/api/setup/status` | GET | 配置状态（受保护） |
| `/api/setup/test-connection` | POST | 测试连接（受保护） |
| `/api/setup/configure` | POST | 保存配置（受保护） |

完整路径以 `src/**/*controller.ts` 为准。

---

### WebSocket（日志）

Socket.IO 命名空间 **`logs`**：`logs:subscribe` / `logs:unsubscribe` / `logs:new`（字段 `timestamp` / `level` / `content`）。

---

### 常见故障

- **Gateway 不可用**：检查 `OPENCLAW_GATEWAY_URL`，并在设置中填写 Token/Password 后保存。
- **日志为空**：优先走 Gateway `logs.tail`；仅当 Gateway 不可用且配置了 `OPENCLAW_LOG_PATH` 时读本地文件。
- **Token 全为 0**：确认会话是否产生用量；核对 `/api/metrics/token-summary` 与 `/api/sessions/token-usage`。

---

### Roadmap（摘录）

- 已完成：Skill 追踪、用户维度、会话类型识别、Token 阈值、SystemPrompt 建议等。
- 规划中：Memory 可视化、多实例聚合、长期趋势等（见仓库 issue/PR）。

---

### 贡献

```bash
cd openclaw-traceflow
pnpm install
pnpm run start:dev
```

欢迎 Issue / PR（Bug、功能、文档、UI、测试）。

---

### 作者与链接

- X: https://x.com/brucelee_1991  
- 小红书: https://www.xiaohongshu.com/user/profile/5845481182ec395656dfb393  
- 知乎: https://www.zhihu.com/people/huang-da-xian-14-14  

---

### License

MIT © [slashhuang](https://github.com/slashhuang)
