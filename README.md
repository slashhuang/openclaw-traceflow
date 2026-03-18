# OpenClaw Monitor

OpenClaw Agent 监控仪表盘 - **开箱即用**，3 分钟上手。

## 快速开始

### 方式一：Docker（推荐）

```bash
# 一条命令启动
docker run -d -p 3001:3001 \
  -v openclaw-monitor-data:/data \
  --name openclaw-monitor \
  clawfamily/openclaw-monitor:latest

# 访问 http://localhost:3001
```

### 方式二：npx（无需安装）

```bash
npx openclaw-monitor

# 访问 http://localhost:3001
```

### 方式三：源码运行（开发者）

```bash
# 1. 克隆项目
git clone https://github.com/claw-family/openclaw-monitor.git
cd openclaw-monitor

# 2. 安装依赖
pnpm install

# 3. 启动
pnpm run start:dev

# 访问 http://localhost:3001
```

## 功能

### 前端仪表盘

- **Dashboard**: 系统概览、会话统计、实时状态
  - 统计卡片（系统状态、会话数、活跃/空闲）
  - 延迟指标（P50/P95/P99）
  - 会话状态分布饼图
  - 工具调用 Top 8 柱状图
  - 系统健康信息（Gateway、OpenClaw 连接、内存、CPU）
  - 最近会话表格
  - 实时日志预览
  - **3 秒自动轮询刷新**

- **会话管理**: 列表/详情查看、Token 用量可视化、会话终止
- **实时日志**: WebSocket 推送、日志级别过滤、自动滚动
- **系统设置**: Gateway 配置、访问模式切换、快速操作（重启/清理日志）
- **首次启动向导**: 3 步快速配置

### 后端 API

- **健康检查** (`/api/health`): Gateway 状态、PM2 进程信息、技能列表
- **会话管理** (`/api/sessions`): 会话列表、历史回溯、上下文查看、Token 用量
- **实时日志** (`/api/logs`): PM2 日志文件读取，支持 limit 参数
- **Metrics 监控** (`/api/metrics`):
  - `latency` - Hook 耗时、P50/P95/P99（过去 1 小时）
  - `tools` - 工具调用统计（按调用次数分组，计算成功率）
  - `concurrency` - 并发指标
- **快速操作** (`/api/actions`): 重启 Gateway、终止会话、清理日志
- **开箱即用**: 默认 local-only 模式，可选 Access Token 保护
- **零侵入集成**: 通过文件系统读取 OpenClaw 会话数据，无需修改 OpenClaw 代码

## 配置

### 环境变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `OPENCLAW_GATEWAY_URL` | OpenClaw Gateway 地址 | `http://localhost:18789` |
| `OPENCLAW_STATE_DIR` | 状态目录（会话在 `…/agents/*/sessions/`） | 未设时自动解析，见下 |
| `OPENCLAW_CONFIG_PATH` | 配置文件路径（与 Gateway 一致） | 未设时执行 `openclaw config file` |
| `OPENCLAW_CLI` | openclaw 可执行文件名或绝对路径 | `openclaw` |
| `OPENCLAW_RUNTIME_ACCESS_TOKEN` | 访问令牌（可选） | 无 |
| `OPENCLAW_ACCESS_MODE` | 访问模式：local-only \| token \| none | `local-only` |
| `PORT` | 监听端口 | `3001` |
| `HOST` | 监听地址 | `127.0.0.1` |
| `DATA_DIR` | 数据目录 | `./data` |
| `PM2_LOG_PATH` | PM2 日志路径（可选） | 未设则不读文件日志 |

**状态目录 / 配置路径如何解析（推荐依赖「正在跑的 Gateway」）：**

1. **首选：WebSocket 连 Gateway**（与 `OPENCLAW_GATEWAY_URL` 一致）  
   握手后上游在 `hello-ok.snapshot` 里带上 **`stateDir`、`configPath`**，与 Gateway 进程内实际使用的一致（PM2 自定义目录也能对上）。  
   仅当本机存在 **`${stateDir}/agents`** 时才采用（避免监控连的是**远程** Gateway 却误用远端路径读本地盘）。  
   若 Gateway 开了 token/password，请配置 **`OPENCLAW_GATEWAY_TOKEN` / `OPENCLAW_GATEWAY_PASSWORD`**。
2. 显式 **`openclawStateDir`** 或 **`OPENCLAW_STATE_DIR`**
3. **`OPENCLAW_CONFIG_PATH`** 或 **`openclaw config file`** + 目录启发式
4. 最后回退 `~/.openclaw`（若存在 `agents/`）

上游 CLI 补充：`openclaw config file`、`openclaw config get agents.defaults.workspace`（无单独 `openclaw paths`）。

### Docker Compose

```yaml
services:
  openclaw-monitor:
    image: clawfamily/openclaw-monitor:latest
    ports:
      - "3001:3001"
    environment:
      - OPENCLAW_GATEWAY_URL=http://your-gateway:3000
      # - OPENCLAW_RUNTIME_ACCESS_TOKEN=your-token
    volumes:
      - openclaw-monitor-data:/data
```

## API 文档

### REST API

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/health` | GET | Gateway 健康状态 |
| `/api/sessions` | GET | 会话列表 |
| `/api/sessions/:id` | GET | 会话详情 |
| `/api/sessions/:id/kill` | POST | 终止会话 |
| `/api/logs` | GET | 最近日志 |
| `/api/metrics/latency` | GET | 延迟指标 (P50/P95/P99，默认过去 1 小时) |
| `/api/metrics/tools` | GET | 工具调用统计（按调用次数分组） |
| `/api/metrics/concurrency` | GET | 并发指标 |
| `/api/actions/restart` | POST | 重启 Gateway |
| `/api/actions/kill-session/:id` | POST | 终止会话 |
| `/api/setup/status` | GET | 配置状态 |
| `/api/setup/configure` | POST | 更新配置 |
| `/api/setup/test-connection` | POST | 测试 Gateway 连接 |

### WebSocket

连接：`ws://localhost:3001/logs`

事件：
- `logs:subscribe` - 订阅日志流
- `logs:unsubscribe` - 取消订阅
- `logs:new` - 新日志推送

## 开发

```bash
# 安装依赖
pnpm install

# 开发模式（后端）
pnpm run start:dev

# 开发模式（前端）
pnpm run dev:frontend

# 构建后端
pnpm run build

# 构建前端
pnpm run build:frontend

# 构建全部
pnpm run build:all

# 生产启动
pnpm run start:prod

# Docker 构建
pnpm run docker:build
```

## 技术栈

- **后端**: NestJS 11 + TypeScript
- **前端**: React 19 + Vite 8 + React Router DOM 7
- **数据可视化**: Recharts 3
- **实时通信**: Socket.IO (WebSocket)
- **数据存储**: sql.js (SQLite 内存数据库)
- **进程管理**: PM2

## 访问保护

### 默认模式（local-only）

仅允许本机访问，适合个人开发使用。

### Token 模式

```bash
docker run -d -p 3001:3001 \
  -e OPENCLAW_RUNTIME_ACCESS_TOKEN=my-secret-token \
  clawfamily/openclaw-monitor:latest

# 访问时需要 Header: Authorization: Bearer my-secret-token
```

### 反向代理（生产环境）

使用 Nginx/Caddy 配置 Basic Auth 或 OAuth，参考 [部署指南](docs/deployment.md)。

## License

MIT
