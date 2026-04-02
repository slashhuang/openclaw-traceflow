# CLAUDE.md

本文件面向在 **`openclaw-traceflow/`** 仓库内工作的 Claude Code / Cursor 等助手。**本仓库是独立开源项目**：克隆本仓库即可开发与发布，**不要求**任何 Monorepo、subtree 或私有配套仓。

- **用户文档**：[README.md](README.md)（英文）、[README.zh-CN.md](README.zh-CN.md)（中文）
- **上游发布**：`git@github.com:slashhuang/openclaw-traceflow.git`（以你 `git remote -v` 为准）

## 项目概述

OpenClaw TraceFlow：面向 OpenClaw Agent 的 **可观测** Web 应用（NestJS + React）。通过 **Gateway WebSocket（长连接）** 与 **本机 OpenClaw 数据目录** 提供会话、Skill、Token、延迟、System Prompt、价格与日志等能力。

### Gateway scopes（修改 OpenClaw 集成时必读）

当 TraceFlow 以 **backend** 且无设备身份连接 Gateway 时，OpenClaw 可能在 `connect` 后 **清空 scopes**。依赖 **`operator.read`** 的 RPC 会报 **`missing scope: operator.read`**。

实现约定（勿破坏）：

- **路径 / 运行时目录**：用 `connect` 响应的 **snapshot**（`stateDir` / `configPath`），不要只靠 `skills.status` 等需 operator 的探测。
- **仪表盘 health / 概览**：用 Gateway **`health` RPC**，再映射为 UI 所需结构。

代码入口：`src/openclaw/gateway-overview-health.ts`、`gateway-persistent-client.ts`、`gateway-ws-paths.ts`。产品说明已写入 **README** 的 _Gateway scopes_ 小节。

### 数据口径与性能（简述）

- UI **ℹ** 与 i18n 键说明统计范围（live `*.jsonl` vs `*.jsonl.reset.*`、活跃/归档 Token、`totalTokensFresh` 等）。
- `MetricsService.refreshToolStatsSnapshot` 使用会话 **fingerprint** 减少重复解析；大文件 head/tail；债项见 [ROADMAP.md](ROADMAP.md)。

## README 维护约定

修改 **README.md** / **README.zh-CN.md** 时：**保持现有章节顺序与顶级 `##` 标题层级不变**（Why TraceFlow → … → Quick start → Tech stack → Overview → …）。中英文同步**语义**；新内容优先写入已有小节。

## Git 与助手行为

用户说「提交」→ 默认只做本地 `git add` / `git commit`，**不要**自动 `push`，除非用户明确要求推送。

## 技术栈

- **后端**: NestJS 11 + TypeScript
- **前端**: React 19 + Vite 8 + React Router 7 + Ant Design 5 + Pro Layout + react-intl
- **图表**: Recharts 3
- **实时**: Socket.IO（日志流；仪表盘 HTTP 轮询）
- **存储**: sql.js（SQLite），`data/metrics.db`
- **Gateway**: `GatewayConnectionService` + `TraceflowGatewayPersistentClient`

## 目录结构（核心）

```
src/
├── main.ts, app.module.ts, app.controller.ts
├── config/
├── openclaw/          # Gateway WS、health 映射、路径解析
├── auth/, setup/, health/, dashboard/, sessions/, logs/, metrics/
├── traceflow-skills/  # 内置 skills 清单 API
└── common/resolveOpenClawPaths.ts

resources/bundled-skills/   # 与 OpenClaw 配套的 vendored skills（如 agent-audit）
frontend/src/
```

## 常用命令

```bash
pnpm install
pnpm run start:dev
pnpm run dev
pnpm run build
pnpm run build:all
pnpm run deploy:pm2
pnpm test
```

## API（实现以 controller 为准）

| 端点                                               | 说明                                                                                 |
| -------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `GET /api/health`                                  | 健康（含 Gateway 摘要）                                                              |
| `GET /api/dashboard/overview`                      | 仪表盘聚合（前端主入口）                                                             |
| `GET /api/sessions` · `GET /api/sessions/:id`      | 会话                                                                                 |
| `POST /api/sessions/:id/kill`                      | 终止会话                                                                             |
| `GET /api/logs`                                    | 最近日志                                                                             |
| `GET /api/metrics/*`                               | 延迟 / 工具 / 并发                                                                   |
| `GET /api/audit/snapshot` · `POST /api/audit/scan` | 审计（扫描器路径：`resources/bundled-skills/agent-audit/scripts/audit-scanner.mjs`） |
| `GET /api/traceflow-skills`                        | 内置 skills 文件列表与正文                                                           |

完整列表见历史版本或 README；新增端点后同步 README 与本表。

## WebSocket

- Gateway：单例长连接 `TraceflowGatewayPersistentClient`。
- 服务端日志：`logs` 命名空间 — `logs:subscribe` / `logs:unsubscribe` / `logs:new`。

## 前端注意

- Dashboard 页签 **visible** 时约 **10s** 轮询 `GET /api/dashboard/overview`（非 3s）。
- `fetchData` 用 **ref** 防并发，勿把 `inFlight` 放进 `useCallback` 依赖链。

## 配置默认值

见 `config.service.ts`：`OPENCLAW_GATEWAY_URL` 默认 `http://localhost:18789`，`PORT` 默认 `3001`，`DATA_DIR` 默认 `./data`。详见 [config/README.md](config/README.md)。

## 路径解析（本仓库内）

**本仓库事实源**：`src/common/resolveOpenClawPaths.ts`。所有 OpenClaw 数据路径须通过此处解析，**禁止**硬编码 `~/.openclaw/...`。

若在其他项目（如 Agent 部署仓）维护同名逻辑，应保持**语义一致**；TraceFlow **不依赖**那些仓库即可构建运行。

### 更新 `resolveOpenClawPaths` 时

1. 改 `src/common/resolveOpenClawPaths.ts`
2. 若有伙伴仓库拷贝了同文件，按需手动同步
3. 跑相关测试与审计扫描路径校验

---

## 维护者备忘（可选）

TraceFlow 可与 **OpenClaw Gateway**、**agent-audit** 等技能配合使用；集成方自行决定目录布局。**开源文档与 README 中不要假设**读者拥有 `claw-brains`、`claw-commons` 等私有或并列仓库。
