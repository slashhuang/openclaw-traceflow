# CLAUDE.md

本文件面向在 **`openclaw-traceflow/`** 仓库内工作的 Claude Code / Cursor 等助手。**本仓库是独立开源项目**：克隆本仓库即可开发与发布，**不要求**任何 Monorepo、subtree 或私有配套仓。

- **用户文档**：[README.md](README.md)（英文）、[README.zh-CN.md](README.zh-CN.md)（中文）
- **上游发布**：`git@github.com:slashhuang/openclaw-traceflow.git`（以你 `git remote -v` 为准）

## 项目概述

OpenClaw TraceFlow：面向 OpenClaw Agent 的 **可观测** Web 应用（NestJS + React）。通过 **Gateway WebSocket（长连接）** 与 **本机 OpenClaw 数据目录** 提供会话、Skill、Token、延迟、System Prompt、价格与日志等能力。

**新增 IM 推送功能**（v1.1.0+）：支持飞书机器人实时推送会话记录，按会话聚合展示，便于搜索和回溯。详见 [docs/IM_PUSH.md](docs/IM_PUSH.md)。

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
- **IM 推送**: Feishu Bot API + EventEmitter2 事件驱动

## 目录结构（核心）

```
src/
├── main.ts, app.module.ts, app.controller.ts
├── config/
├── openclaw/          # Gateway WS、health 映射、路径解析
├── auth/, setup/, health/, dashboard/, sessions/, logs/, metrics/
├── traceflow-skills/  # 内置 skills 清单 API
├── im/                # IM 推送模块（v1.1.0+）
│   ├── base.channel.ts
│   ├── channels/feishu/
│   ├── session-manager.ts
│   ├── im-push.service.ts
│   └── im-push.module.ts
├── adapters/openclaw/ # OpenClaw 数据源适配器
│   ├── file-watcher.adapter.ts
│   ├── event-bridge.service.ts
│   └── openclaw.adapter.module.ts
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

**新增 IM 推送配置**（v1.1.0+）：

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
          "sessionMessages": true,
          "sessionEnd": true,
          "errorLogs": true
        }
      }
    }
  }
}
```

配置示例：[config/openclaw.runtime.example.json](config/openclaw.runtime.example.json)

## 路径解析（本仓库内）

**本仓库事实源**：`src/common/resolveOpenClawPaths.ts`。所有 OpenClaw 数据路径须通过此处解析，**禁止**硬编码 `~/.openclaw/...`。

若在其他项目（如 Agent 部署仓）维护同名逻辑，应保持**语义一致**；TraceFlow **不依赖**那些仓库即可构建运行。

### 更新 `resolveOpenClawPaths` 时

1. 改 `src/common/resolveOpenClawPaths.ts`
2. 若有伙伴仓库拷贝了同文件，按需手动同步
3. 跑相关测试与审计扫描路径校验

---

## IM 推送开发指南（v1.1.0+）

### 架构概览

```
OpenClaw Gateway (agents/*/sessions/*.jsonl)
         │
         ▼
SessionManager (直接监听文件系统)
         │
         ▼ (emit audit.session.* events)
ImPushService (推送协调)
         │
         ▼
FeishuChannel (飞书 API + 限流)
         │
         ▼
飞书审计机器人
```

### 核心组件

| 组件                       | 职责                                                        | 文件                                         |
| -------------------------- | ----------------------------------------------------------- | -------------------------------------------- |
| **SessionManager**         | 监听 `agents/*/sessions/*.jsonl` 文件变化，管理会话生命周期 | `src/im/session-manager.ts`                  |
| **ImPushService**          | 订阅 `audit.session.*` 事件，协调推送逻辑                   | `src/im/im-push.service.ts`                  |
| **FeishuChannel**          | 飞书 API 封装（限流 + 重试）                                | `src/im/channels/feishu/feishu.channel.ts`   |
| **FeishuMessageFormatter** | 消息格式化（富文本）                                        | `src/im/channels/feishu/feishu.formatter.ts` |

**架构说明**（v1.1.1+）：

- 已移除冗余的 `OpenClawFileWatcher` 和 `OpenClawEventBridge`
- `SessionManager` 直接监听 OpenClaw 的 `agents/*/sessions/*.jsonl` 文件
- 事件流简化为：`SessionManager` → `ImPushService`（通过 `audit.session.*` 事件）

### 事件流

```typescript
// 1. SessionManager 直接监听 agents/*/sessions/*.jsonl 文件变化
//    检测到新会话时触发：
eventEmitter.emit('audit.session.start', session);

//    检测到新消息时触发：
eventEmitter.emit('audit.session.message', { sessionId, message, session });

//    会话结束（5 分钟无活动）时触发：
eventEmitter.emit('audit.session.end', session);

// 2. ImPushService 处理
handleSessionStart() → FeishuChannel.send(parentMessage)
handleSessionMessage() → FeishuChannel.send(message, { reply_id: parentId })
handleSessionEnd() → FeishuChannel.update(parentId, updatedMessage)
handleErrorLog() → FeishuChannel.send(errorMessage)
```

### 限流与重试

**限流**：令牌桶算法（10 条/秒，突发容量 20 条）

```typescript
// FeishuChannel 内部实现
private async acquireToken(): Promise<void> {
  while (true) {
    this.refill();
    if (this.tokenBucket >= 1) {
      this.tokenBucket--;
      return;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
}
```

**重试**：待实现（当前版本无重试队列，网络抖动时消息可能丢失）

### 推送策略

```typescript
pushStrategy: {
  sessionStart: false,     // 不推送会话开始通知
  sessionMessages: true,   // 推送会话消息
  sessionEnd: true,        // 推送会话结束汇总
  errorLogs: true,         // 推送 ERROR 日志
  warnLogs: false          // 不推送 WARN 日志
}
```

### 会话结束检测

**超时机制**：5 分钟无活动视为会话结束

```typescript
// SessionManager 内部实现
private readonly SESSION_END_TIMEOUT_MS = 5 * 60 * 1000;
private cleanupInterval = setInterval(() => {
  for (const [sessionId, session] of this.activeSessions.entries()) {
    const inactiveTime = Date.now() - session.lastActivity;
    if (inactiveTime > this.SESSION_END_TIMEOUT_MS) {
      this.completeSession(sessionId);
    }
  }
}, 60000); // 每分钟检查一次
```

### 模块依赖关系

```typescript
// AppModule（唯一调用 forRoot() 的地方）
EventEmitterModule.forRoot({
  wildcard: true,
  maxListeners: 20,
  verboseMemoryLeak: true,
})

// 其他模块只导入，不调用 forRoot()
ImPushModule → imports: [SessionsModule]
OpenClawAdapterModule → imports: [ConfigModule]
LogsModule → imports: [ConfigModule]
```

### 配置验证

**必填字段**（运行时检查）：

- `im.channels.feishu.appId`
- `im.channels.feishu.appSecret`
- `im.channels.feishu.targetUserId`

缺失时会在日志中输出错误，但不会阻止服务启动。

### 测试方法

1. **配置飞书凭证**：编辑 `config/openclaw.runtime.im.json`
2. **启动开发环境**：`pnpm run start:dev`
3. **触发会话**：在飞书与 OpenClaw 机器人对话
4. **检查日志**：`tail -f data/traceflow.log`
5. **验证推送**：查看飞书审计机器人是否收到消息

### 故障排查

| 问题             | 检查点                                                   |
| ---------------- | -------------------------------------------------------- |
| 收不到推送       | 检查 `im.enabled`、飞书凭证、日志中的 `Feishu API error` |
| 推送延迟高       | 检查网络、限流配置、重试日志                             |
| 会话未聚合       | 检查 `reply_id` 是否正确传递、SessionManager 日志        |
| ERROR 日志未推送 | 检查 `LogsService` 是否触发 `audit.log.error` 事件       |

---

## 维护者备忘（可选）

TraceFlow 可与 **OpenClaw Gateway**、**agent-audit** 等技能配合使用；集成方自行决定目录布局。**开源文档与 README 中不要假设**读者拥有 `claw-brains`、`claw-commons` 等私有或并列仓库。

---

## 飞书 SDK 源码参考

飞书官方 Node.js SDK 源码已保存在 `sourceCode/feishu-node-sdk/` 目录下，用于查阅 API 用法和参数说明。

**飞书 IM 消息方式**: `openclaw-traceflow/sourceCode/feishu-node-sdk/code-gen/projects/im.ts`

**回复消息 API（形成 thread）**：

- 接口位置：`sourceCode/feishu-node-sdk/code-gen/projects/im.ts` (第 3744 行)
- 调用方式：

```typescript
client.im.v1.message.reply({
  data: {
    content: string;
    msg_type: string;
    reply_in_thread?: boolean;  // 设置为 true 形成 thread
    uuid?: string;
  },
  path: { message_id: string }  // 指定被回复的消息 ID
}, options)
```

- 响应中包含 `thread_id`、`root_id`、`parent_id` 等字段
- **单聊和群聊都支持 thread 聚合**
