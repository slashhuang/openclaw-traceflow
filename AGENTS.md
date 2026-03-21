# claw-sources — AI / 编码助手说明

本文件供 **Cursor、Claude Code、Codex** 等助手在修改本仓库时阅读；**CLAUDE.md** 为同内容的简短入口。

## 仓库是什么

- **Monorepo**，开发入口在仓库根 `.git`。
- **一方子项目（git subtree）**：
  | 目录 | 说明 | 上游（示例） |
  |------|------|----------------|
  | `openclaw-traceflow/` | OpenClaw **可观测仪表盘**（NestJS + React），**默认工作目录** | `git@github.com:slashhuang/openclaw-traceflow.git` |
  | `claw-family/` | OpenClaw + 飞书等 | 见 `docs/monorepo-workflow.md` |
  | `futu-openD/` | 富途 OpenD | 同上 |
- **`external-refs/`**：参考源码，**不是** subtree 产品。
- **根目录**没有独立 Nest 应用：无根级 `package.json` / `src/` / `frontend/`；已删除历史 Monitor 重复目录。

## 任务该改哪里

| 你要做的事 | 目录 |
|------------|------|
| TraceFlow 后端、前端、Gateway WebSocket、设置/测试连接、仪表盘 | **`openclaw-traceflow/`** |
| claw-family 技能、部署脚本 | `claw-family/` |
| futu-openD | `futu-openD/` |
| 对照 OpenClaw 上游实现 | `external-refs/openclaw/`（只读参考，勿当业务依赖随意改） |

在 **`openclaw-traceflow/`** 内安装与运行：

```bash
cd openclaw-traceflow
pnpm install
pnpm run start:dev
```

Docker：根目录 `docker-compose.yml` 构建上下文为 `./openclaw-traceflow`；或 `cd openclaw-traceflow && docker compose up -d`。

## TraceFlow 与 OpenClaw Gateway（必读）

### `missing scope: operator.read` 与「测试连接」

- TraceFlow 以 **`mode: backend`**、**无设备身份** 连 Gateway 时，Gateway 会在鉴权通过后 **清空该连接的 `scopes`**（安全策略：未绑定设备的客户端不能保留自拟 operator scope）。
- 旧逻辑在 `connect` 成功后又调 **`skills.status`** / **`status`** / **`usage.status`** / **`logs.tail`** 等需要 **`operator.read`** 的 RPC，会在清空 scopes 后失败，报错 **`missing scope: operator.read`**（**设置里「测试连接」**即走此路径）。
- **修复方向**（已实现）：
  - **路径探测**（`fetchRuntimePathsFromGateway` / `fetchRuntimePaths`）：只用 connect 响应里的 **snapshot**（`stateDir` / `configPath`），**不再**调 `skills.status`。
  - **状态概览与仪表盘**：用 Gateway 对 **`health` RPC 的豁免**（不按 operator scope 拦截），将结果 **映射**为仪表盘可用的 `status` 形状；`logs.tail` **尽力而为**，失败则空日志并打 debug。

### 代码入口（TraceFlow）

- WebSocket 路径：`openclaw-traceflow/src/openclaw/gateway-ws-paths.ts`、`gateway-persistent-client.ts`、`gateway-rpc.ts`
- 概览映射：`openclaw-traceflow/src/openclaw/gateway-overview-health.ts`
- 连接测试：`openclaw.service.ts` → `checkConnection` → `GatewayConnectionService.fetchRuntimePaths()`

## 文档索引

- [README.md](README.md) — 根说明
- [docs/MONOREPO-SIMPLIFIED.md](docs/MONOREPO-SIMPLIFIED.md)
- [docs/monorepo-workflow.md](docs/monorepo-workflow.md)
- TraceFlow 细节：[openclaw-traceflow/CLAUDE.md](openclaw-traceflow/CLAUDE.md)

## 约束

- 不要恢复根目录独立 Monitor 应用，除非刻意维护两套仪表盘。
- 改 Gateway 对接时同步考虑：**无设备 backend 连接无 operator scopes**。
