# claw-sources — AI / 编码助手说明

> **受众**：Cursor、Claude Code、Codex 等；修改本仓库前优先读本文件。  
> **人类短入口**：[CLAUDE.md](./CLAUDE.md)（与本文件同策略，更短）。

---

## TL;DR（先读这段再动手）

| 用户要做的事 | 工作目录 | 必读补充 |
|-------------|----------|----------|
| TraceFlow（Nest/React、Gateway WS、仪表盘、设置/测试连接） | `openclaw-traceflow/` | [openclaw-traceflow/CLAUDE.md](openclaw-traceflow/CLAUDE.md) |
| claw-family（技能、部署等） | `claw-family/` | [docs/monorepo-workflow.md](docs/monorepo-workflow.md) |
| 富途 OpenD | `futu-openD/` | 同上 |
| 对照 OpenClaw 上游 | `external-refs/openclaw/` | **只读**，勿当业务依赖乱改 |

- **根目录没有 Nest 应用**：无根级 `package.json` / `src/` / `frontend/`；勿在根目录 `pnpm start` 找应用。
- **Git（本地优先）**：用户说**提交**→ 默认只做本地 `add`/`commit`，**不**自动 push、**不** `git subtree push`、**不**为 subtree 做 `git fetch`（workflow 不依赖 fetch subtree）。用户明确要**推送 / 同步远端**时再 push；**禁止**未要求时代提交、代推送。
- **TraceFlow 双远端（仅推送时）**：推 `main` 且含 `openclaw-traceflow/` 时，在仓库根**依次** `git push origin main` → `git subtree push --prefix=openclaw-traceflow openclaw-traceflow main`（只做第一步不会更新独立仓）。

---

## 仓库结构（Monorepo）

- 开发入口：仓库根 `.git`。
- **一方子项目（git subtree）**：

| 目录 | 说明 | 上游（示例） |
|------|------|----------------|
| `openclaw-traceflow/` | OpenClaw **可观测仪表盘**（NestJS + React），**默认工作目录** | `git@github.com:slashhuang/openclaw-traceflow.git` |
| `claw-family/` | OpenClaw + 飞书等 | 见 `docs/monorepo-workflow.md` |
| `futu-openD/` | 富途 OpenD | 同上 |

- **`external-refs/`**：参考源码，**不是** subtree 产品。

---

## TraceFlow 运行命令（仅在子目录执行）

```bash
cd openclaw-traceflow
pnpm install
pnpm run start:dev
```

- Docker：根目录 `docker-compose.yml` 构建上下文为 `./openclaw-traceflow`；或 `cd openclaw-traceflow && docker compose up -d`。

---

## TraceFlow × OpenClaw Gateway（必读）

### 背景：`missing scope: operator.read`

- TraceFlow 以 **`mode: backend`**、**无设备身份** 连接 Gateway 时，鉴权通过后 Gateway 会**清空该连接的 `scopes`**（未绑定设备不能保留自拟 operator scope）。
- 若在 `connect` 成功后再调 **`skills.status`** / **`status`** / **`usage.status`** / **`logs.tail`** 等需 **`operator.read`** 的 RPC，会失败并报 **`missing scope: operator.read`**（设置里「测试连接」曾走此路径）。

### 正确做法（已实现，修改时请保持）

| 场景 | 做法 |
|------|------|
| 路径 / 运行时目录探测 | 仅用 connect 响应 **snapshot**（`stateDir` / `configPath`）；**不要**依赖 `skills.status` 做路径探测 |
| 仪表盘 / 状态概览 | 用 Gateway **`health` RPC**（豁免 operator scope），再**映射**为仪表盘 `status` 形状 |
| 日志 | `logs.tail` **尽力而为**；失败则空日志 + debug，勿当作唯一数据源 |

### 代码入口（相对 `openclaw-traceflow/`）

| 主题 | 路径 |
|------|------|
| WebSocket / RPC | `src/openclaw/gateway-ws-paths.ts`、`gateway-persistent-client.ts`、`gateway-rpc.ts` |
| health → 概览映射 | `src/openclaw/gateway-overview-health.ts` |
| 连接测试 | `openclaw.service.ts` → `checkConnection` → `GatewayConnectionService.fetchRuntimePaths()` |

---

## AI 助手约束（DO / DON'T）

**DO**

- 改 TraceFlow 时同步考虑：**无设备 backend 连接无 operator scopes**。
- 需要 TraceFlow 细节（API、目录、i18n、双远端）时读 [openclaw-traceflow/CLAUDE.md](openclaw-traceflow/CLAUDE.md)。

**DON'T**

- 不要恢复根目录独立 Monitor 应用，除非刻意维护两套仪表盘。
- 不要在用户未明确要求时执行 `git add` / `commit` / `push` / `subtree push`。
- 用户只说「提交」时不要自动 push；不要为了 subtree 默认执行 `git fetch openclaw-traceflow`（除非用户单独要求）。

---

## 文档索引

- [README.md](README.md) — 根说明
- [docs/MONOREPO-SIMPLIFIED.md](docs/MONOREPO-SIMPLIFIED.md)
- [docs/monorepo-workflow.md](docs/monorepo-workflow.md)
- TraceFlow：[openclaw-traceflow/CLAUDE.md](openclaw-traceflow/CLAUDE.md)

---

## 检索关键词（embedding / 搜索用）

`monorepo` `subtree` `openclaw-traceflow` `TraceFlow` `NestJS` `React` `Gateway` `WebSocket` `operator.read` `health RPC` `backend mode` `missing scope` `git subtree push` `claw-family` `futu-openD` `external-refs`
