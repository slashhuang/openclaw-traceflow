# OpenClaw TraceFlow

[![License](https://img.shields.io/badge/license-MIT-blue)](/LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20.11.0-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-%3E%3D9.0.0-F69220?logo=pnpm&logoColor=white)](https://pnpm.io/)
[![NestJS](https://img.shields.io/badge/NestJS-11-E0234E?logo=nestjs&logoColor=white)](https://nestjs.com/)
[![React](https://img.shields.io/badge/React-18-149ECA?logo=react&logoColor=white)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white)](https://vite.dev/)

面向 **[OpenClaw](https://docs.openclaw.ai) Agent** 的**可观测性** Web 应用：会话、Skill、Token 用量与告警、延迟（P50/P95/P99）、**Agent 与 Harness**（Project Context / OpenClaw Structure 等）、模型计价、实时日志，以及**实时 IM 推送**（飞书/钉钉）。独立 NestJS + React 服务，界面支持**中文 / English**，支持 PM2 或 CLI 部署。

**语言：** [English](README.md) · 简体中文（本页）

---

## 为什么选择 TraceFlow（对比 OpenClaw 默认管理后台）

| 能力                                           | OpenClaw 默认管理后台 | TraceFlow                                                                                                                                                                                   |
| ---------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 与 Gateway 同包分发                            | 是                    | 否（独立应用）                                                                                                                                                                              |
| Skill 调用追踪（read 路径反推）                | —                     | 有                                                                                                                                                                                          |
| 用户维度 Skill 统计                            | —                     | 有                                                                                                                                                                                          |
| Token 阈值与排行                               | 基础                  | 增强                                                                                                                                                                                        |
| Agent / Harness 自检（对齐 OpenClaw 文档用语） | —                     | 有                                                                                                                                                                                          |
| 延迟 P50/P95/P99                               | —                     | 有                                                                                                                                                                                          |
| Gateway 连接方式                               | 长驻 WS               | 长驻 WS（复用 `status`、`usage`、`logs.tail`、`skills.status` 等）                                                                                                                          |
| 部署方式                                       | 随 Gateway            | 独立 PM2、独立端口                                                                                                                                                                          |
| 界面语言                                       | 以单语为主            | 中英双语                                                                                                                                                                                    |
| 自动化友好性                                   | 基础                  | JSON HTTP API + 日志 WebSocket 推流                                                                                                                                                         |
| **IM 推送（Agent 会话推送到飞书/钉钉）**       | —                     | **有** — Thread 聚合、限流、防抖（v1.1.0+；面向中国市场，架构可扩展）                                                                                                                       |
| **产品内统计口径说明（ℹ）**                    | 少见                  | **有** — 主要区块说明纳入/排除范围（如 live `*.jsonl` 与 `*.jsonl.reset.*`、活跃/归档 Token、`totalTokensFresh` 等）                                                                        |
| **无 `operator.read` 时仍可安全概览 Gateway**  | 不适用                | **有** — 路径探测用 connect 快照；无设备 backend 连接清空 scopes 时，仪表盘 health/overview 走 **`health` RPC**（豁免 scope 拦截；详见英文 README _Gateway scopes_ / 下表「测试连接」排障） |

---

## 界面截图

### 仪表盘 / 会话

**仪表盘总览** — Gateway 健康、会话分布、Token 汇总、延迟、Skills/工具 Top 5、最近会话与实时日志。

> 仪表盘截图 _（待与最新 UI 截图对齐后补充）_

**会话列表** — 按 Agent 分页，记录值与日志估算双列，参与者身份、状态筛选、排序。

> 会话列表截图 _（待与最新 UI 截图对齐后补充）_

**会话详情** — 单个 transcript 视图，超大文件 head/tail 分片加载，消息/工具/事件/Skills 多 Tab。

> 会话详情截图 _（待与最新 UI 截图对齐后补充）_

### Skills / Prompt / Token / 价格

**Skills 分析** — 调用频率 Top 10、用户分布、Skill × Tool 归因、僵尸/重复检测。

> Skills 截图 _（待与最新 UI 截图对齐后补充）_

**System Prompt 与 Harness** — 工作区引导文件、Project Context、Skills 快照、Token 分块、评估结果。

> System Prompt 截图 _（待与最新 UI 截图对齐后补充）_

**Token 监控与价格** — 阈值分布、双轨（记录值 vs 估算）Token 指标、模型价格配置。

> Token 监控 / 价格截图 _（待与最新 UI 截图对齐后补充）_

> 截图资源位于 `docs/traceFlowSnapshots/`（当前已有：`dashboard-1.png`、`sessionList.png`、`sessionDetail.png`、`skills.png`、`systemPrompt.png`、`tokenMonitor.png`、`models.png`）。后续将与当前 UI 版本对齐后直接嵌入 README。

---

## 环境要求

| 项      | 说明                         |
| ------- | ---------------------------- |
| Node.js | `>= 20.11.0`（推荐 20 LTS）  |
| pnpm    | `>= 9.0.0`                   |
| PM2     | 生产环境推荐（`deploy:pm2`） |

---

## 快速开始

在克隆本仓库后，进入 **`openclaw-traceflow`** 目录执行：

```bash
pnpm run deploy:pm2
```

将依次执行 **`pnpm install`**、构建前后端，并在 PM2 中启动或重载进程名 **`openclaw-traceflow`**。浏览器访问 **`http://localhost:3001`**（或你配置的 `HOST` / `PORT`）。

请确保 Gateway 可被 **`OPENCLAW_GATEWAY_URL`** 访问（默认 `http://localhost:18789`）。若 Gateway 需要鉴权，在界面 **设置** 中填写 Token / Password。

---

## 部署方式

TraceFlow 支持多种部署模式，根据你的环境选择。

### PM2（生产环境推荐）

```bash
pnpm run deploy:pm2
```

部署脚本（`scripts/deploy-pm2.sh`）一次性完成 install → build → PM2 启动/重载。进程在 PM2 中注册为 **`openclaw-traceflow`**。

常用 PM2 命令：

```bash
pm2 logs openclaw-traceflow --lines 100   # 查看日志
pm2 restart openclaw-traceflow             # 重启
pm2 stop openclaw-traceflow                # 停止
pm2 delete openclaw-traceflow              # 从 PM2 中移除
```

### 生产环境（独立进程）

```bash
pnpm run build:all
pnpm run restart:prod
```

`restart:prod` 如果进程尚未运行则通过 PM2 启动，否则重启它（自动重启，最多 10 次重试，每次间隔 3 秒）。

### 开发模式

```bash
# 后端 + 前端热重载（两个进程）
pnpm run dev

# 仅后端
pnpm run start:dev

# 后端 + 前端分别启动
pnpm run dev:backend   # NestJS watch
pnpm run dev:frontend  # Vite dev server
```

### CLI 命令行

TraceFlow 提供 CLI 二进制入口（`bin/cli.js`），注册为 `openclaw-traceflow` 和 `openclaw-monitor`：

```bash
openclaw-traceflow          # 启动服务
openclaw-monitor            # 别名，同一二进制
pnpm run monitor            # 通过 package.json
```

### 首次设置

首次启动时，浏览器中会显示 **Setup Wizard** 用于配置 OpenClaw 数据路径。如果 Gateway 能自动发现路径或你已提前设置 `OPENCLAW_STATE_DIR` / `OPENCLAW_WORKSPACE_DIR`，可跳过此步骤。

### 反向代理

生产环境暴露时，建议将 TraceFlow 放在 Nginx / Caddy 后面并配置鉴权。默认仅 `/api/setup/*` 受 `OPENCLAW_ACCESS_MODE` 保护，其余读取类 API 无 Bearer 校验。

---

## 技术栈

- 后端：NestJS 11 + TypeScript
- 前端：React 18 + Vite 5 + React Router 6 + Ant Design 5 + Pro Layout + react-intl（中/英）
- 图表：Recharts 3
- 实时：Socket.IO（日志流；仪表盘 HTTP 轮询）
- 存储：sql.js（SQLite），`data/metrics.db`
- Gateway：`GatewayConnectionService` + `TraceflowGatewayPersistentClient`（长驻 WS，配置变更时重建）
- 日志：Winston + `winston-daily-rotate-file`（日志轮转 + 自动清理）
- IM 推送：飞书（`@larksuiteoapi/node-sdk`）+ EventEmitter2 事件驱动架构

---

## 概述

TraceFlow 是运行在 **OpenClaw Gateway** 之外的**独立服务**（默认连接 `http://localhost:18789`）。它不替代 Gateway，也不替代 OpenClaw 自带的**默认管理后台**，而是为**运维与排障**提供专用仪表盘，可部署在**另一端口或另一台机器**（默认监听 **`http://0.0.0.0:3001`**）。

**数据口径与诚实展示。** 许多控制台只给数字，不说明**来源**与**排除项**，容易造成误判。TraceFlow 将「口径可追溯」视为产品能力：主要面板配有 **ℹ** 说明统计范围——例如仪表盘 **Skills / 工具 Top 5** 仅聚合 **当前** transcript（`*.jsonl`），不含归档轮次（`*.jsonl.reset.*`）；**Token** 视图区分**活跃**与**归档**用量；会话/Token 文案在适当时提示 **`totalTokensFresh`** 与索引滞后。目标是减少**静默口径偏差**。

**性能取向。** 可观测不等于「每次点击都全量重读」。TraceFlow 已实现**增量**会话目录扫描、按会话 **fingerprint** 复用工具/Skill 聚合（transcript 未变则跳过重复解析）、超大 JSONL 的 **head/tail**、**单条长驻** Gateway WebSocket，以及仪表盘 **一次请求**拉齐概览。会话量极大时仍可能存在最坏路径（例如 **O(n)** 全量扫描），诚实记录在 **`ROADMAP.md`**。

**产品设计：** Agent **harness 可见**、system prompt **平台层与用户层**分层及 TraceFlow 交互路线图见 **[docs/agent-harness-and-system-prompt.md](./docs/agent-harness-and-system-prompt.md)**。

### Gateway scopes（为何使用 `health`）

TraceFlow 以 **`mode: backend`** 且**无配对设备身份**连接 Gateway 时，OpenClaw 可能在 `connect` 后**清空该连接的 `scopes`**。此时依赖 **`operator.read`** 的 RPC（例如部分 `skills.status` / `usage` 路径）会报 **`missing scope: operator.read`**。

实现上应保持：

- **运行时路径探测**优先使用 **`connect` 快照**（`stateDir` / `configPath`），不要只靠需 `operator.read` 的 RPC。
- **仪表盘 health / 概览**优先走 Gateway **`health` RPC**（实践中豁免 scope 拦截），再映射为 UI 所需结构。

代码入口：`src/openclaw/gateway-overview-health.ts`、`gateway-persistent-client.ts`、`gateway-ws-paths.ts`。

---

## 配置（先零配置）

TraceFlow 默认即可开箱即用。大多数本地环境下，不设置任何环境变量，直接执行 `pnpm run deploy:pm2` 后访问 `http://localhost:3001` 即可。

### 常见场景（通常只需要这一项）

| 变量                   | 何时需要设置                        | 默认                     |
| ---------------------- | ----------------------------------- | ------------------------ |
| `OPENCLAW_GATEWAY_URL` | Gateway 不在本机默认地址/端口可达时 | `http://localhost:18789` |

如果 Gateway 需要鉴权，优先在界面 **设置** 页填写 Token / Password。

### 可选覆盖（高级）

| 变量                                                   | 作用                                                   | 默认      |
| ------------------------------------------------------ | ------------------------------------------------------ | --------- |
| `HOST`                                                 | 监听地址                                               | `0.0.0.0` |
| `PORT`                                                 | 端口                                                   | `3001`    |
| `DATA_DIR`                                             | 本地数据目录（如 metrics DB）                          | `./data`  |
| `OPENCLAW_GATEWAY_TOKEN` / `OPENCLAW_GATEWAY_PASSWORD` | Gateway 鉴权（WS/RPC）                                 | 未设置    |
| `OPENCLAW_STATE_DIR` / `OPENCLAW_WORKSPACE_DIR`        | 路径覆盖                                               | 自动解析  |
| `OPENCLAW_LOG_PATH`                                    | Gateway 不可用时的本地日志回退                         | 未设置    |
| `OPENCLAW_ACCESS_MODE`                                 | 保护 `/api/setup/*`（`local-only` · `token` · `none`） | `none`    |
| `OPENCLAW_RUNTIME_ACCESS_TOKEN`                        | `OPENCLAW_ACCESS_MODE=token` 时使用的 Bearer Token     | 未设置    |

更细说明见 **`config/README.md`** 与可选 `config/openclaw.runtime.json`。

**计价：** Token 费用估算使用内置默认价表；可用 `config/model-pricing.json` 覆盖（参考 `config/model-pricing.example.json`）。

---

## IM 推送（v1.1.0+）

TraceFlow 可将 Agent 的实时会话记录推送到 IM 平台（当前支持**飞书**，钉钉已预留脚手架），按会话聚合展示，便于搜索和回溯。

> **定位说明：** 当前 IM 推送主要面向**中国市场**（飞书/钉钉）。架构设计上 Channel 是插件化的，欢迎社区贡献 **Slack**、**Microsoft Teams**、**Discord**、**企业微信** 等全球 IM 平台的 Channel 实现。详见下方「扩展 Channel」一节。

### 架构

```
OpenClaw Gateway (agents/*/sessions/*.jsonl)
         │
         ▼  （fs.watch 监听 sessions/*.jsonl）
SessionManager（直接监听文件系统）
         │
         ▼  （触发 audit.session.* 事件）
ImPushService（推送协调 + 内存队列）
         │
         ▼
FeishuChannel（飞书 API + 限流 + 防抖）
         │
         ▼
飞书审计机器人（Thread 聚合消息）
```

**核心设计决策：**

- **仅依赖文件系统** — 不依赖 OpenClaw WebSocket、HTTP API 或事件系统，直接监听 `agents/*/sessions/*.jsonl`。
- **内存队列** — 按会话串行发送，避免竞态和时序错乱。无 SQLite 持久化（更简单，无需迁移）。
- **重启不补推历史** — 重启后仅推送新消息，不回溯历史消息，避免消息风暴。
- **防抖** — JSONL 流式写入带防抖机制，防止飞书 API 被刷屏。
- **限流** — 令牌桶算法（10 条/秒，突发容量 20 条）。

### 快速配置

1. **配置飞书凭证**，编辑 `config/openclaw.runtime.json`：

```json
{
  "im": {
    "enabled": true,
    "channels": {
      "feishu": {
        "enabled": true,
        "appId": "cli_xxx",
        "appSecret": "xxx",
        "targetUserId": "ou_xxx",
        "pushStrategy": {
          "sessionStart": false,
          "sessionMessages": true,
          "sessionEnd": true,
          "errorLogs": true,
          "warnLogs": false
        }
      }
    }
  }
}
```

2. **获取飞书凭证**：访问 [飞书开放平台](https://open.feishu.cn/)，创建企业自建应用，获取 App ID/Secret，配置机器人发送消息权限。

3. **重启** TraceFlow，在飞书审计机器人中验证推送。

### 推送策略

| 配置项            | 说明                         | 默认值  |
| ----------------- | ---------------------------- | ------- |
| `sessionStart`    | 推送会话开始通知             | `false` |
| `sessionMessages` | 推送会话消息（用户/AI/技能） | `true`  |
| `sessionEnd`      | 推送会话结束汇总             | `true`  |
| `errorLogs`       | 推送 ERROR 日志告警          | `true`  |
| `warnLogs`        | 推送 WARN 日志               | `false` |

### API 端点

| 端点                             | 方法 | 说明                      |
| -------------------------------- | ---- | ------------------------- |
| `/api/im/channels`               | GET  | 获取已启用的 Channel 列表 |
| `/api/im/channels/health`        | GET  | Channel 健康状态          |
| `/api/im/channels/:type/enabled` | GET  | 检查 Channel 是否启用     |
| `/api/im/channels/:type/test`    | POST | 发送测试消息              |
| `/api/im/broadcast/test`         | POST | 广播测试消息              |

### 扩展 Channel

新 IM Channel 只需实现 `ImChannel` 接口（`initialize`、`send`、`healthCheck`、`destroy`）并在 `ImModule` 中注册。架构为全球化设计，欢迎社区贡献 **Slack**、**Microsoft Teams**、**Discord**、**企业微信** 等 Channel 实现。详见 [docs/IM_CHANNELS_GUIDE.md](docs/IM_CHANNELS_GUIDE.md)。

### 详细文档

- [IM_PUSH.md](docs/IM_PUSH.md) — 功能概览与故障排查
- [IM_CHANNELS_GUIDE.md](docs/IM_CHANNELS_GUIDE.md) — Channel 插件开发指南
- [IM_PUSH_STRATEGY.md](docs/IM_PUSH_STRATEGY.md) — 推送策略实现详解
- [IM_OPENCLAW_INTEGRATION.md](docs/IM_OPENCLAW_INTEGRATION.md) — OpenClaw 集成架构

---

## 运维与维护

### 日志管理

TraceFlow 使用 **Winston** 日志框架，支持每日轮转：

- **日志文件**：`data/traceflow.log`（当天）
- **轮转策略**：每日自动轮转，旧文件自动清理
- **时区**：Asia/Shanghai（北京时间）
- **查看日志**：`pm2 logs openclaw-traceflow --lines 100` 或 `tail -f data/traceflow.log`

### 健康监控

- **HTTP 健康检查**：`GET /api/health` — 返回 Gateway 连接状态和运行时健康
- **仪表盘轮询**：前端可见时每 ~10s 轮询 `GET /api/dashboard/overview`
- **后台指标**：Token 用量约每 30s 快照一次（可通过代码常量配置）
- **IM Channel 健康**：`GET /api/im/channels/health` — 返回各 Channel 健康状态

### 配置热更新

- **IM 推送配置**：修改 `config/openclaw.runtime.json` 后下次读取时生效
- **路径配置**：在设置页面保存的路径变更立即生效（内存配置同步）
- **Gateway 连接**：Gateway URL/Token/Password 变更时自动重建连接

### 会话监听

- **会话监听**：IM 推送通过 `fs.watch` 监听 `agents/*/sessions/*.jsonl` 文件
- **会话结束检测**：5 分钟无活动自动标记会话完成
- **重启行为**：重启后不补推历史消息，仅从当前位置开始监听新消息

### 数据范围

| 数据类型           | 来源                                | 说明                                      |
| ------------------ | ----------------------------------- | ----------------------------------------- |
| 会话转录           | `agents/*/sessions/*.jsonl`         | 当前 + 归档（`*.jsonl.reset.*`）          |
| Token 指标         | 本地 `data/metrics.db`（~30s 快照） | 活跃 + 归档双轨                           |
| Gateway 健康       | Gateway `health` RPC（WS）          | 豁免 scope，无需 `operator.read`          |
| IM 推送事件        | 文件系统监听                        | 仅 OpenClaw 数据，不含 TraceFlow 自身日志 |
| TraceFlow 应用日志 | Winston → `data/traceflow.log`      | 每日轮转，北京时间                        |

### 常用运维命令

```bash
# 查看进程状态
pm2 list

# 查看最近日志
pm2 logs openclaw-traceflow --lines 50

# 实时日志流
tail -f data/traceflow.log

# 配置变更后重启
pm2 restart openclaw-traceflow

# 完整重部署（安装 + 构建 + 启动）
pnpm run deploy:pm2

# 清理构建产物
pnpm run clean
```

---

## 界面路由

| 路径                                                   | 说明                                                                  |
| ------------------------------------------------------ | --------------------------------------------------------------------- |
| `/`、`/dashboard`                                      | 总览：Gateway 健康、Token、延迟、工具等                               |
| `/sessions`、`/sessions/:id`、`/sessions/:id/archives` | 会话列表、详情与归档轮次                                              |
| `/system-prompt`（`/agent-harness` 重定向至此）        | Agent 与 Harness：Project Context、OpenClaw Structure、Skills 快照等  |
| `/workspace`                                           | 工作区引导文件（`AGENTS.md` / `SOUL.md` / `IDENTITY.md` / `USER.md`） |
| `/markdown-preview`                                    | 工作区引导文档的 Markdown 预览                                        |
| `/pricing`                                             | 模型价格                                                              |
| `/logs`                                                | 实时日志（Socket.IO）                                                 |
| `/settings`                                            | Gateway 地址、路径、访问控制                                          |

### 会话与「参与者」列（读数说明）

- **一行会话**对应 OpenClaw 里的一条**对话线程**（一个 `sessionId` / 一份 transcript）；**群聊里多人**通常仍共享**同一条**会话，不是每人一行。
- **`sessionKey`** 表达**路由与形态**（如飞书、群 / 频道 / 私聊等），与「列里显示谁」不是同一维度。
- **`agent:<agentId>:main`** 在 OpenClaw 中表示 **`dmScope` 为 `main` 时私聊折叠到的默认主会话桶**；界面类型为 **「主会话」**，**不要**把它与「心跳任务专用会话」划等号——定时 heartbeat 也可能写入同一条 transcript，**仅凭 key 无法判断是否为 heartbeat。**
- **参与者（列表）：** TraceFlow 会扫描 transcript JSONL，对发送者去重（含 `Sender` / `Conversation info` 元数据块、`senderLabel`、`message.sender` 等）。若存在**多名**不同真人发送者，列中展示为 **`首位标识 (+N)`**，其中 **`N`** 为**除首位外**的其余人数（不是总人数）。
- **参与者（详情）：** 多人时主行展示首位与 **+N**，点击 **+N** 可在浮层中查看与列表同源的去重列表。群成员可能多于 transcript 中出现的发送者，**仅展示 transcript 中解析到的身份。**
- **会话详情 · 消息：** 单栏列表；每条消息默认**一行**摘要，**点击行**展开全文，**箭头**收起（避免展开后选中文本时误触收起）。
- 若仍为 `unknown`，多为索引未写入或 transcript 首条无法推断，属数据源限制，详见会话详情内说明。

---

## 性能与容量

TraceFlow 面向**单机、中等规模**会话量，并在**稳态**上做了针对性优化：

- **会话列表 / 存储：** `FileSystemSessionStorage` **增量**重扫变更的 transcript，并带短 TTL 缓存，`listSessions` 以内存合并与排序为主。
- **仪表盘工具/Skill Top 5：** `MetricsService.refreshToolStatsSnapshot()` 为每个会话维护 **fingerprint**（`lastActiveAt` + transcript 大小 + `status`）。未变化则**复用**已缓存的工具/Skill 计数，避免每次刷新都全量解析 JSONL——不活跃或已结束的会话在稳态下成本显著降低。
- **会话详情：** 大 transcript 使用 **head/tail 窗口**，避免整文件加载（见服务端常量与会话详情 UI）。
- **Gateway：** 按 URL+鉴权 **复用**一条 WebSocket，避免 `health`、`status`、`logs.tail` 等每次重新握手。
- **概览接口：** `GET /api/dashboard/overview` 一次返回健康、会话、日志与指标，减少前端往返。

会话量**极大**或大量会话持续变更时，最坏情况工作量仍可能上升，详见 **`ROADMAP.md`** 中的已知瓶颈与计划。

---

## 安全

仅 **`/api/setup/*`**（首次配置、测连、保存）受 **`OPENCLAW_ACCESS_MODE`** 约束；其余读取类接口**未做统一 Bearer 校验**。**请勿在未做网络隔离或反向代理鉴权的情况下将 TraceFlow 暴露到公网。**

| 模式         | 行为                                                               |
| ------------ | ------------------------------------------------------------------ |
| `local-only` | 仅本机 IP 可修改配置                                               |
| `token`      | 修改配置需 `Authorization: Bearer <OPENCLAW_RUNTIME_ACCESS_TOKEN>` |
| `none`       | 不校验（仅可信网络）                                               |

---

## HTTP API（节选）

便于脚本与监控；完整路由以 `src/**/*controller.ts` 为准。

| 路径                                         | 方法            | 说明                                      |
| -------------------------------------------- | --------------- | ----------------------------------------- |
| `/api/health`                                | GET             | 健康与 Gateway 连接摘要                   |
| `/api/status`                                | GET             | Gateway `status` / `usage` JSON           |
| **`/api/dashboard/overview`**                | **GET**         | 仪表盘聚合；可选 `?timeRangeMs=`          |
| `/api/sessions`                              | GET             | 会话列表                                  |
| `/api/sessions/:id`                          | GET             | 会话详情                                  |
| `/api/sessions/:id/kill`                     | POST            | 终止会话                                  |
| `/api/sessions/:id/evaluations*`             | GET/POST/DELETE | 会话评估（`latest`、历史、详情、创建）    |
| `/api/metrics/*`                             | GET             | 延迟、tools/skills、token 汇总等          |
| `/api/prompts/:promptId/evaluations*`        | GET/POST/DELETE | Prompt 评估（`latest`、历史、详情、创建） |
| `/api/evaluation-prompt`                     | GET/PUT/DELETE  | 会话评估模板                              |
| `/api/workspace-bootstrap-evaluation-prompt` | GET/PUT/DELETE  | 工作区引导评估模板                        |
| `/api/workspace/*`                           | GET/PUT         | 工作区文件读写接口                        |
| `/api/logs`                                  | GET             | 最近日志                                  |
| `/api/setup/*`                               | GET/POST        | 设置相关（受访问模式保护）                |
| `/api/im/channels`                           | GET             | 获取已启用的 IM Channel 列表              |
| `/api/im/channels/health`                    | GET             | IM Channel 健康状态                       |
| `/api/im/channels/:type/test`                | POST            | 发送 IM 测试消息                          |
| `/api/audit/snapshot`                        | GET             | 贡献审计快照                              |

---

## WebSocket（日志）

Socket.IO 命名空间 **`logs`**：`logs:subscribe`、`logs:unsubscribe`、服务端推送 `logs:new`（含 `timestamp`、`level`、`content`）。

---

## 常见故障

| 现象                                                    | 排查                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 连不上 Gateway                                          | 检查 `OPENCLAW_GATEWAY_URL`、防火墙；在设置中填写 Token                                                                                                                                                                                                                      |
| 设置里「测试连接」报 **`missing scope: operator.read`** | TraceFlow 使用无设备身份的 backend 连接时，Gateway 会清空 scopes；路径探测已避免调用 `skills.status`。若仍见旧报错，请更新到已修复版本。仪表盘概览使用 **`health` RPC**（豁免 scope）。实现入口：`src/openclaw/gateway-overview-health.ts`、`gateway-persistent-client.ts`。 |
| 日志为空                                                | 优先使用 Gateway `logs.tail`；无 operator scope 时可能拿不到 Gateway 日志，会回退为空；可配置 `OPENCLAW_LOG_PATH`                                                                                                                                                            |
| Token 指标为 0；仪表盘「归档」空白                      | 确认会话是否产生用量；核对 `/api/metrics/token-summary` 与 `/api/sessions/token-usage`。「归档」常为 0（未 /new 或 reset 无 usage 等）属预期；双轨字段溯源与示例见 **`docs/token-metrics-dual-track-example.md`**                                                            |
| 收不到 IM 推送                                          | 检查配置中 `im.enabled` 和 Channel 的 `enabled` 是否为 `true`；验证飞书凭证；查看 `data/traceflow.log` 中是否有 `Feishu API error`；通过 `POST /api/im/channels/feishu/test` 发送测试消息                                                                                    |
| IM 推送刷屏 / 消息风暴                                  | v1.1.1+ 已默认启用防抖。如仍见刷屏，检查配置中的 `rateLimit`（默认 10 条/秒）。详见 [docs/IM_PUSH.md](docs/IM_PUSH.md)                                                                                                                                                       |
| 重启后部分会话未被监听                                  | 重启后会话监听从当前文件位置开始，不补推历史。只要 jsonl 文件存在，新消息仍可被检测到。若会话未在 `sessions.json` 中但文件存在，仍可被监听                                                                                                                                   |

---

## Roadmap

见 **`ROADMAP.md`**。

### 近期已交付

- **v1.1.x** — 飞书 IM 推送（Thread 聚合、防抖、内存队列、熔断器、限流）
- **v1.1.x** — Winston 日志框架（每日轮转、自动清理、北京时间）
- **v1.1.x** — 路径配置热更新；设置页面保存后立即生效
- **v1.1.x** — 会话评估模板（eval-prompt-v1）+ 工作区引导评估
- **v1.1.x** — 贡献审计集成（agent-audit 配套 Skill）
- **v1.1.x** — 设置向导简化为单页配置
- **v1.1.x** — 性能优化：fingerprint 缓存用于工具/Skill 聚合，大文件首尾分片

---

## 参与贡献

欢迎 Issue / PR（Bug、功能、文档、UI、测试）。

---

## 许可证

MIT © [slashhuang](https://github.com/slashhuang)

---

### 作者链接

- [X](https://x.com/brucelee_1991)
- [小红书](https://www.xiaohongshu.com/user/profile/5845481182ec395656dfb393)
- [知乎](https://www.zhihu.com/people/huang-da-xian-14-14)
