# CLAUDE.md

This file guides Claude Code and other AI assistants working in **`openclaw-traceflow/`**（monorepo `claw-sources` 内以 git subtree 维护的一方子项目）。上游仓库：`git@github.com:slashhuang/openclaw-traceflow.git`。

**Monorepo 总览**（根目录结构、子项目分工、Gateway `missing scope` 说明）：仓库根 **[`../AGENTS.md`](../AGENTS.md)**。

## 项目概述

OpenClaw TraceFlow：OpenClaw Agent **可观测**仪表盘（NestJS + React）。通过 **Gateway WebSocket（长连接）** 与 **本地会话数据** 提供会话、Skill、Token、延迟、System Prompt、价格与日志等能力。

面向使用者的说明：**[README.md](README.md)**（英文）、**[README.zh-CN.md](README.zh-CN.md)**（中文）；开发与 AI 助手以本文件与代码为准。

## README（开源文档）

- 修改 **README.md** / **README.zh-CN.md** 时，**保持现有章节顺序与标题层级不变**（例如从 Tech stack / 技术栈 一直到 License / 许可证 的区块顺序不要重排、不要合并或拆分整章）。
- 允许在**既有小节内**增删改段落与列表项；中英文需同步更新**对应语义**的段落。
- 需要新增说明时，优先写入**已有小节**（如「会话与参与者」）；非必要勿插入新的顶级 `##` 以免打乱读者习惯与翻译对照。

## Git 与双远端（monorepo `main`）

本目录在 monorepo 中由 **git subtree** 同步到独立仓库 **`git@github.com:slashhuang/openclaw-traceflow.git`**（远程名常为 `openclaw-traceflow`）。

在仓库根、**`main`** 分支上推送与本目录相关的提交时，应**先后**执行：

1. `git push origin main` — 更新 **`claw-sources`**（`origin`）。
2. `git subtree push --prefix=openclaw-traceflow openclaw-traceflow main` — 更新 **openclaw-traceflow** 独立仓库。

仅执行第 1 步不会更新独立仓；AI/自动化在「已合并到 main 且含 `openclaw-traceflow/` 变更」的推送流程中应包含第 2 步。

## 技术栈

- **后端**: NestJS 11 + TypeScript  
- **前端**: React 19 + Vite 8 + React Router 7 + Ant Design 5 + Pro Layout + react-intl（中/英）  
- **图表**: Recharts 3  
- **实时**: Socket.IO（日志流；仪表盘 HTTP 轮询）  
- **存储**: sql.js（SQLite），`data/metrics.db`  
- **Gateway**: `GatewayConnectionService` + `TraceflowGatewayPersistentClient`（长驻 WS，配置变更时重建）

## 目录结构（核心）

```
src/
├── main.ts
├── app.module.ts
├── app.controller.ts          # SPA fallback
├── config/
├── openclaw/
│   ├── openclaw.module.ts     # OpenClawService + GatewayConnectionService（@Global）
│   ├── openclaw.service.ts
│   ├── gateway-connection.service.ts   # 单例：按 URL+token 签名缓存 WS 客户端
│   ├── gateway-persistent-client.ts    # 与 OpenClaw 默认 Control UI 同类：connect 后复用 request
│   ├── gateway-rpc.ts                  # 一次性 WS RPC（备用/低频路径）
│   └── gateway-ws-paths.ts             # HTTP→WS URL；fetchRuntimePathsFromGateway（路径解析）
├── auth/auth.guard.ts
├── setup/
├── health/
├── dashboard/dashboard.controller.ts   # GET /api/dashboard/overview
├── sessions/
├── logs/
├── metrics/
├── skills/
├── actions/
└── config/pricing-config.*

frontend/src/
├── pages/ Dashboard, Sessions, SessionDetail, Skills, SystemPrompt, TokenMonitor, Pricing, Logs, Settings
├── api/index.js
└── locales/en-US.js, zh-CN.js    # 键需一一对应（约 330 keys）
```

## 常用命令

```bash
pnpm install
pnpm run start:dev          # 后端 watch
pnpm run dev                # 后端 + 前端 concurrently
pnpm run build
pnpm run build:frontend
pnpm run build:all
pnpm run start:prod
pnpm run deploy:pm2         # install + build + PM2
pnpm test
```

## API（与 README / README.zh-CN 一致；实现以 controller 为准）

| 端点 | 说明 |
|------|------|
| `GET /api/health` | 健康状态（含 Gateway 连接摘要） |
| `GET /api/status` | Gateway status/usage 概览 |
| **`GET /api/dashboard/overview`** | **仪表盘聚合**（health、status、sessions、logs、metrics…）；前端主入口 |
| `GET /api/sessions` | 会话列表 |
| `GET /api/sessions/:id` | 会话详情 |
| `POST /api/sessions/:id/kill` | 终止会话 |
| `GET /api/logs` | 最近日志 |
| `GET /api/metrics/latency` | P50/P95/P99 |
| `GET /api/metrics/tools` | tools + skills Top 5 |
| `GET /api/metrics/concurrency` | 并发（可能占位） |
| `POST /api/actions/restart` | 本机 `openclaw gateway restart`（非远程 URL） |
| `GET /api/setup/status` | 配置状态（受 access mode 保护） |
| `POST /api/setup/configure` | 保存配置 |
| `POST /api/setup/test-connection` | 测试 Gateway |

## WebSocket

- **Gateway**: 由 `TraceflowGatewayPersistentClient` 维护（非每次请求新建连接）。  
- **TraceFlow 服务端日志**: Socket.IO 命名空间 `logs`：`logs:subscribe` / `logs:unsubscribe` / `logs:new`。

## 前端行为（避免文档写错）

- **Dashboard** `Dashboard.jsx`：页签 **visible** 时约 **10s** 轮询 `GET /api/dashboard/overview`（不是 3s）。  
- `fetchData` 使用 **ref** 防并发，勿把 `inFlight` 放进 `useCallback` 依赖，否则会连环请求。

## 配置默认值（`config.service.ts`）

- `OPENCLAW_GATEWAY_URL` 默认 **`http://localhost:18789`**（OpenClaw Gateway 默认端口）  
- `HOST` 默认 **`0.0.0.0`**，`PORT` **`3001`**  
- `DATA_DIR` → `./data`；可选 `config/openclaw.runtime.json`（见 `config/README.md`）

## 部署

```bash
docker run -d -p 3001:3001 \
  -e OPENCLAW_GATEWAY_URL=http://your-gateway:18789 \
  clawfamily/openclaw-traceflow:latest
```

## 开发注意

- 前端构建输出：`public/app/`  
- SPA 路由：`app.controller.ts`  
- i18n：新增文案需同时改 `frontend/src/locales/en-US.js` 与 `zh-CN.js`  
- 修改 Gateway 相关行为时同步更新 **README.md**、**README.zh-CN.md**、本文件与 **`config/README.md`**
- **性能与已知瓶颈**：`MetricsService.refreshToolStatsSnapshot()` 对每个会话调用 `getSessionDetail`（会话多时 O(n) 磁盘/解析）；后台 `MetricsModule` 定时任务同路径；详见 **`ROADMAP.md`**
