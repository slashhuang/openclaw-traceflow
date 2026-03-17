# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

Agent Monitor UI - OpenClaw Agent 监控仪表盘，基于 NestJS 的监控服务。

## 技术栈

- **框架**: NestJS 11 + TypeScript
- **实时通信**: Socket.IO (WebSocket)
- **数据存储**: sql.js (SQLite 内存数据库)
- **进程管理**: PM2

## 架构结构

```
src/
├── main.ts                 # 入口，监听 PM2 日志
├── app.module.ts           # 根模块，导入 5 个功能模块
├── health/                 # 健康检查模块
│   ├── health.controller   # GET /api/health
│   └── health.service      # 通过 PM2 API 检查 Gateway 状态
├── sessions/               # 会话管理模块
│   ├── sessions.controller # GET/POST /api/sessions
│   └── sessions.service    # 会话列表、详情、终止 (TODO: 对接 OpenClaw API)
├── logs/                   # 日志模块
│   ├── logs.controller     # GET /api/logs
│   ├── logs.gateway        # WebSocket: logs:subscribe/new/unsubscribe
│   └── logs.service        # tail -f PM2 日志文件
├── metrics/                # 指标监控模块
│   ├── metrics.controller  # GET /api/metrics/*
│   └── metrics.service     # sql.js 存储 Hook 耗时、工具调用统计
└── actions/                # 快速操作模块
    ├── actions.controller  # POST /api/actions/*
    └── actions.service     # PM2 重启、清理日志等
```

## 常用命令

```bash
# 安装依赖
npm install

# 开发模式 (监听)
npm run start:dev

# 调试模式
npm run start:debug

# 构建
npm run build

# 生产环境启动
npm run start:prod

# 运行测试
npm test

# 运行 E2E 测试
npm run test:e2e

# 代码格式化
npm run format

# Lint
npm run lint
```

## API 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/health` | GET | Gateway 健康状态 (PM2 进程、内存、CPU) |
| `/api/sessions` | GET | 会话列表 |
| `/api/sessions/:id` | GET | 会话详情 |
| `/api/sessions/:id/status` | GET | 会话状态 |
| `/api/sessions/:id/kill` | POST | 终止会话 |
| `/api/logs` | GET | 最近日志 |
| `/api/metrics/latency` | GET | P50/P95/P99 延迟指标 |
| `/api/metrics/tools` | GET | 工具调用统计 |
| `/api/metrics/concurrency` | GET | 并发指标 |
| `/api/actions/restart` | POST | 重启 Gateway |
| `/api/actions/kill-session/:id` | POST | 终止会话 |
| `/api/actions/update-concurrency` | POST | 更新并发配置 |
| `/api/actions/cleanup-logs` | POST | 清理旧日志 |

## WebSocket 事件

命名空间：`logs`

- `logs:subscribe` - 订阅日志流
- `logs:unsubscribe` - 取消订阅
- `logs:new` - 服务端推送新日志

## 核心依赖

- `pm2` - 监控和管理 OpenClaw Gateway 进程
- `sql.js` - 本地存储 Metrics 数据
- `socket.io` - 实时日志推送

## 外部依赖

- OpenClaw Gateway (PM2 管理) - 日志路径：`/root/.pm2/logs/openclaw-gateway-out.log`
- OpenClaw CLI - 部分操作依赖 `openclaw` 命令

## 开发注意

- 服务默认运行在 3001 端口
- 日志服务通过 `tail -f` 读取 PM2 日志文件
- Metrics 数据存储在 `data/metrics.db`
- 部分功能 (Sessions, Metrics) 标记为 TODO，需要对接 OpenClaw API
