# CLAUDE.md

本文件面向在 **`openclaw-traceflow/`** 仓库内工作的 AI 助手。**本仓库是独立开源项目**：克隆本仓库即可开发与发布，**不要求**任何 Monorepo、subtree 或私有配套仓。

- **用户文档**：[README.md](README.md)（英文）、[README.zh-CN.md](README.zh-CN.md)（中文）
- **上游发布**：`git@github.com:slashhuang/openclaw-traceflow.git`（以 `git remote -v` 为准）

---

## 开源项目原则

**本仓库是纯粹的开源项目**，以下规则必须遵守：

1. **禁止硬编码个人路径** — 所有路径必须通过 `src/common/resolveOpenClawPaths.ts` 解析，不得出现 `~/.openclaw`、`/Users/xxx` 等个人路径。
2. **代码中立** — 所有代码和文档应以开源项目本身为准，不依赖外部私有仓库。假设读者**只拥有本仓库**，不拥有其他并列仓库。
3. **文档面向贡献者** — 文档和注释应让任何外部贡献者都能理解，不使用仅内部才知道的术语或缩写。
4. **README 不假设私有生态** — 开源 README 中不要提及 `claw-brains`、`claw-commons` 等私有仓库。
5. **配置用占位符** — 示例配置中的 appId、secret 等使用 `cli_xxx`、`xxx` 占位，不使用真实值。

---

## 项目概述

OpenClaw TraceFlow：面向 OpenClaw Agent 的 **可观测** Web 应用（NestJS + React）。通过 **Gateway WebSocket（长连接）** 与 **本机 OpenClaw 数据目录** 提供会话、Skill、Token、延迟、System Prompt、价格与日志等能力。

**IM 推送功能**（v1.1.0+）：支持飞书/钉钉等 IM 平台实时推送会话记录，按会话 Thread 聚合展示。详见 [docs/IM_PUSH.md](docs/IM_PUSH.md)。

### Gateway scopes（修改 OpenClaw 集成时必读）

当 TraceFlow 以 **backend** 且无设备身份连接 Gateway 时，OpenClaw 可能在 `connect` 后 **清空 scopes**。依赖 **`operator.read`** 的 RPC 会报 **`missing scope: operator.read`**。

实现约定（勿破坏）：

- **路径 / 运行时目录**：用 `connect` 响应的 **snapshot**（`stateDir` / `configPath`），不要只靠需 operator 权限的探测。
- **仪表盘 health / 概览**：用 Gateway **`health` RPC**（豁免 scope），再映射为 UI 所需结构。

代码入口：`src/openclaw/gateway-overview-health.ts`、`gateway-persistent-client.ts`、`gateway-ws-paths.ts`。

---

## 技术栈

| 层      | 技术                                                            |
| ------- | --------------------------------------------------------------- |
| 后端    | NestJS 11 + TypeScript                                          |
| 前端    | React 18 + Vite 5 + React Router 6 + Ant Design 5               |
| 图表    | Recharts 3                                                      |
| 实时    | Socket.IO（日志流）；仪表盘 HTTP 轮询（~10s）                   |
| 存储    | sql.js（SQLite），`data/metrics.db`                             |
| 日志    | Winston + `winston-daily-rotate-file`（每日轮转）               |
| Gateway | `GatewayConnectionService` + `TraceflowGatewayPersistentClient` |
| IM 推送 | EventEmitter2 事件驱动 + Channel 插件架构（飞书/钉钉）          |

---

## 目录结构

```
src/
├── main.ts, app.module.ts, app.controller.ts
├── common/resolveOpenClawPaths.ts    # 路径解析（唯一事实源）
├── config/                           # 配置管理
├── openclaw/                         # Gateway WS、health 映射
├── im/                               # IM 推送模块
│   ├── channel.interface.ts          # Channel 接口定义
│   ├── channel-manager.ts            # Channel 管理器
│   ├── channels/feishu/              # 飞书 Channel 实现
│   ├── channels/dingtalk/            # 钉钉 Channel 实现
│   ├── session-manager.ts            # 会话生命周期管理
│   ├── im-push.service.ts            # 推送协调服务
│   ├── message-dispatcher.service.ts # 消息分发
│   ├── circuit-breaker.service.ts    # 熔断器
│   └── im-push.module.ts
├── adapters/openclaw/                # OpenClaw 数据源适配
├── dashboard/, sessions/, logs/, metrics/, health/
├── audit/                            # 贡献审计
├── evaluators/                       # 评估模板
├── workspace/                        # 工作区文件管理
├── settings/                         # 设置管理
├── setup/                            # 首次设置向导
├── onboarding/                       # 引导
├── auth/                             # 鉴权
├── logger/                           # Winston 日志
├── stores/                           # 数据存储
└── types/, utils/                    # 类型与工具函数

resources/                                  # 静态资源
sourceCode/feishu-node-sdk/           # 飞书 SDK 源码参考
frontend/src/                         # 前端 React 应用
```

---

## 常用命令

```bash
pnpm install              # 安装依赖
pnpm run dev              # 后端 watch + 前端 Vite 开发服务器
pnpm run start:dev        # 仅后端 watch
pnpm run build:all        # 构建后端 + 前端
pnpm run deploy:pm2       # 安装 + 构建 + PM2 启动/重载
pnpm run restart:prod     # 生产环境重启（PM2 自动重启）
pnpm test                 # 运行测试
pnpm run clean            # 清理构建产物
```

---

## 前端注意

- Dashboard 页签 **visible** 时约 **10s** 轮询 `GET /api/dashboard/overview`（非 3s）。
- `fetchData` 用 **ref** 防并发，勿把 `inFlight` 放进 `useCallback` 依赖链。
- **i18n**：前端使用 `react-intl`，翻译文件位于 `frontend/src/locales/`。新增 UI 文案时必须同步添加中英文翻译。

---

## 路径解析

**本仓库事实源**：`src/common/resolveOpenClawPaths.ts`。所有 OpenClaw 数据路径须通过此处解析，**禁止**硬编码 `~/.openclaw/...` 或任何个人绝对路径。

---

## IM 推送架构要点

- **仅依赖文件系统** — 直接监听 `agents/*/sessions/*.jsonl`，不依赖 OpenClaw WS/HTTP/事件。
- **Channel 插件化** — 实现 `ImChannel` 接口（`initialize`、`send`、`healthCheck`、`destroy`）即可扩展新 IM 平台。
- **内存队列** — 按会话串行发送，避免竞态；无 SQLite 持久化。
- **重启不补推历史** — 从当前位置开始监听，不回溯历史消息。
- **防抖 + 限流** — JSONL 流式写入带防抖；令牌桶算法（10 msg/s，突发容量 20）。
- **推送策略** — 可配置 `sessionStart`、`sessionMessages`、`sessionEnd`、`errorLogs`、`warnLogs`。

详细实现见 [docs/IM_PUSH.md](docs/IM_PUSH.md)、[docs/IM_CHANNELS_GUIDE.md](docs/IM_CHANNELS_GUIDE.md)。

---

## 配置

见 `config.service.ts`：`OPENCLAW_GATEWAY_URL` 默认 `http://localhost:18789`，`PORT` 默认 `3001`，`DATA_DIR` 默认 `./data`。详见 [config/README.md](config/README.md)。

IM 推送配置示例见 `config/openclaw.runtime.example.json`。

---

## API（以 controller 为准）

| 端点                                               | 说明                     |
| -------------------------------------------------- | ------------------------ |
| `GET /api/health`                                  | 健康（含 Gateway 摘要）  |
| `GET /api/dashboard/overview`                      | 仪表盘聚合（前端主入口） |
| `GET /api/sessions` · `GET /api/sessions/:id`      | 会话列表 / 详情          |
| `POST /api/sessions/:id/kill`                      | 终止会话                 |
| `GET /api/logs`                                    | 最近日志                 |
| `GET /api/metrics/*`                               | 延迟 / 工具 / Token 汇总 |
| `GET /api/audit/snapshot` · `POST /api/audit/scan` | 贡献审计                 |
| `GET /api/im/channels`                             | 已启用的 IM Channel 列表 |
| `GET /api/im/channels/health`                      | IM Channel 健康状态      |
| `POST /api/im/channels/:type/test`                 | 发送 IM 测试消息         |
| `GET /api/workspace/*`                             | 工作区文件读写           |

完整列表见 README；新增端点后同步 README 与本表。

---

## WebSocket

- **Gateway**：单例长连接 `TraceflowGatewayPersistentClient`。
- **服务端日志**：`logs` 命名空间 — `logs:subscribe` / `logs:unsubscribe` / server push `logs:new`。

---

## Git 行为

用户说「提交」→ 默认只做本地 `git add` / `git commit`，**不要**自动 `push`。

---

## README 维护约定

修改 **README.md** / **README.zh-CN.md** 时：**保持现有章节顺序与顶级 `##` 标题层级不变**。中英文同步**语义**；新内容优先写入已有小节。

---

## 飞书 SDK 参考

飞书官方 Node.js SDK 源码保存在 `sourceCode/feishu-node-sdk/` 目录下。回复消息使用 `client.im.v1.message.reply` 接口，设置 `reply_in_thread: true` 可形成 Thread 聚合。具体参数以 SDK 源码为准。
