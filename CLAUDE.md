# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

OpenClaw Monitor - OpenClaw Agent 监控仪表盘，开箱即用的 NestJS 服务。

## 技术栈

- **框架**: NestJS 11 + TypeScript
- **前端**: React 19 + Vite 8 + React Router DOM 7 + **Ant Design 5 + Pro Layout** + react-intl（浅色/深色/跟随系统 + 中/英）
- **数据可视化**: Recharts 3
- **实时通信**: Socket.IO (WebSocket)
- **数据存储**: sql.js (SQLite 内存数据库)
- **进程管理**: PM2
- **OpenClaw 对接**: 零侵入，通过 API + 日志文件

## 架构结构

```
src/
├── main.ts                 # 入口，读取配置并启动服务
├── app.module.ts           # 根模块，导入所有功能模块
├── app.controller.ts       # 路由控制器（处理 SPA 路由）
├── app.service.ts          # 根服务
├── config/                 # 配置模块
│   ├── config.service.ts   # 配置加载/保存/验证
│   └── config.module.ts
├── openclaw/               # OpenClaw API 客户端
│   ├── openclaw.service.ts # 调用 OpenClaw API
│   └── openclaw.module.ts
├── auth/                   # 认证模块
│   └── auth.guard.ts       # Access Token 验证
├── setup/                  # 首次启动引导
│   ├── setup.controller.ts # 配置 API
│   └── setup.module.ts
├── health/                 # 健康检查模块
│   ├── health.controller.ts # GET /api/health
│   ├── health.service.ts   # OpenClaw + PM2 状态
│   └── health.module.ts
├── sessions/               # 会话管理模块
│   ├── sessions.controller.ts # GET/POST /api/sessions
│   ├── sessions.service.ts # 对接 OpenClaw API
│   └── sessions.module.ts
├── logs/                   # 日志模块
│   ├── logs.controller.ts  # GET /api/logs
│   ├── logs.gateway.ts     # WebSocket: logs:subscribe
│   ├── logs.service.ts     # tail -f PM2 日志
│   └── logs.module.ts
├── metrics/                # 指标监控模块
│   ├── metrics.controller.ts # GET /api/metrics/*
│   ├── metrics.service.ts  # sql.js 存储 Metrics
│   └── metrics.module.ts
└── actions/                # 快速操作模块
    ├── actions.controller.ts # POST /api/actions/*
    ├── actions.service.ts  # PM2 重启、清理日志
    └── actions.module.ts

frontend/                   # React 前端
├── src/
│   ├── pages/
│   │   ├── Dashboard.jsx   # 仪表盘（3 秒轮询刷新）
│   │   ├── Sessions.jsx    # 会话列表
│   │   ├── SessionDetail.jsx # 会话详情
│   │   ├── Logs.jsx        # 实时日志（WebSocket）
│   │   └── Settings.jsx    # 系统设置
│   ├── api/                # API 客户端
│   └── App.jsx             # 路由配置
└── vite.config.js          # Vite 配置
```

## 常用命令

```bash
# 安装依赖
pnpm install

# 开发模式 (监听)
pnpm run start:dev

# 构建后端
pnpm run build

# 构建前端
pnpm run build:frontend

# 构建全部
pnpm run build:all

# 生产环境启动
pnpm run start:prod

# Docker 构建
pnpm run docker:build

# Docker 运行
pnpm run docker:run

# 测试
pnpm test

# E2E 测试
pnpm run test:e2e
```

## API 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/health` | GET | Gateway 健康状态 |
| `/api/sessions` | GET | 会话列表 |
| `/api/sessions/:id` | GET | 会话详情 |
| `/api/sessions/:id/kill` | POST | 终止会话 |
| `/api/logs` | GET | 最近日志 |
| `/api/metrics/latency` | GET | P50/P95/P99 延迟（默认过去 1 小时） |
| `/api/metrics/tools` | GET | 工具调用统计（按调用次数分组） |
| `/api/metrics/concurrency` | GET | 并发指标 |
| `/api/actions/restart` | POST | 重启 Gateway |
| `/api/actions/kill-session/:id` | POST | 终止会话 |
| `/api/setup/status` | GET | 配置状态 |
| `/api/setup/configure` | POST | 更新配置 |
| `/api/setup/test-connection` | POST | 测试 Gateway 连接 |

## WebSocket

命名空间：`logs`

- `logs:subscribe` - 订阅日志流
- `logs:unsubscribe` - 取消订阅
- `logs:new` - 服务端推送新日志

## 前端页面

| 路径 | 组件 | 功能 |
|------|------|------|
| `/` | App.jsx | 根路由，重定向到 Dashboard |
| `/dashboard` | Dashboard.jsx | 仪表盘（3 秒轮询刷新） |
| `/sessions` | Sessions.jsx | 会话列表 |
| `/sessions/:id` | SessionDetail.jsx | 会话详情 |
| `/logs` | Logs.jsx | 实时日志（WebSocket 推送） |
| `/settings` | Settings.jsx | 系统设置 |

## Dashboard 指标说明

### 延迟指标（`/api/metrics/latency`）
- **P50**: 50% 请求的响应时间（中位数）
- **P95**: 95% 请求的响应时间
- **P99**: 99% 请求的响应时间
- **count**: 总请求数（过去 1 小时）

### 工具调用统计（`/api/metrics/tools`）
- **计算逻辑**: 从 `hook_metrics` 表查询过去 1 小时数据
- **分组**: 按 `tool_name` 分组统计调用次数
- **成功率**: `success_count / count * 100`
- **Top 8**: 前端截取前 8 个显示

## 配置

### 环境变量

- `OPENCLAW_GATEWAY_URL` - OpenClaw 地址 (默认：http://localhost:3000)
- `OPENCLAW_STATE_DIR` - 状态目录（可选；未设时通过 `openclaw config file` + 目录推断）
- `OPENCLAW_CONFIG_PATH` / `OPENCLAW_CLI` - 与 Gateway 对齐的配置与 CLI
- `OPENCLAW_RUNTIME_ACCESS_TOKEN` - Access Token (可选)
- `OPENCLAW_ACCESS_MODE` - local-only | token | none
- `PORT` - 监听端口 (默认：3001)
- `HOST` - 监听地址 (默认：127.0.0.1)
- `DATA_DIR` - 数据目录 (默认：./data)
- `PM2_LOG_PATH` - PM2 日志路径

### 配置文件

- **`config/openclaw.runtime.example.json`**：仓库内示例，可复制为本地配置。
- **`config/openclaw.runtime.json`**：本地可选覆盖（**已 `.gitignore`**，勿提交）。优先级：默认值 < 该文件 < 环境变量。
- **不写 `dataDir`** 时，数据目录为**启动目录**下的 `./data`；仅在本机需要固定路径时再写 `dataDir` 或设 `DATA_DIR`。

## 部署

### Docker

```bash
docker run -d -p 3001:3001 \
  -e OPENCLAW_GATEWAY_URL=http://your-gateway:3000 \
  clawfamily/openclaw-monitor:latest
```

### npx

```bash
npx openclaw-monitor
```

### 源码

```bash
pnpm install
pnpm run start:dev
```

## 核心依赖

- `pm2` - 监控和管理 OpenClaw Gateway 进程
- `sql.js` - 本地存储 Metrics 数据
- `socket.io` - 实时日志推送
- `socket.io-client` - 前端 WebSocket 客户端
- `react-router-dom` - 前端路由
- `recharts` - 数据可视化图表

## 外部依赖

- OpenClaw Gateway - 默认 http://localhost:3000
- PM2 (可选) - 日志路径：`/root/.pm2/logs/openclaw-gateway-out.log`

## 开发注意

- 服务默认运行在 3001 端口
- 默认只监听 localhost (安全)
- Access Token 模式需要 `Authorization: Bearer <token>`
- Metrics 数据存储在 `data/metrics.db`
- OpenClaw 零侵入对接（只读 API + 日志文件）
- 前端构建产物输出到 `public/app/`
- SPA 路由由 `app.controller.ts` 处理
