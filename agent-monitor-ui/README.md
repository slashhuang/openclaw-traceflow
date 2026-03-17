# Agent Monitor UI

OpenClaw Agent 监控仪表盘 - NestJS + React + Socket.IO

## 功能

- **健康检查** (`/api/health`): Gateway 状态、技能列表、API 配额
- **会话管理** (`/api/sessions`): 会话列表、历史回溯、上下文查看
- **实时日志** (`/api/logs`): WebSocket 日志流
- **Metrics 监控** (`/api/metrics`): Hook 耗时、P50/P95、工具调用统计
- **快速操作** (`/api/actions`): 重启 Gateway、终止会话等

## 技术栈

- **后端**: NestJS + TypeScript
- **前端**: React + TailwindCSS (待实现)
- **实时通信**: Socket.IO
- **数据存储**: sql.js (SQLite)
- **进程管理**: PM2

## 开发

```bash
# 安装依赖
npm install

# 开发模式
npm run start:dev

# 生产模式
npm run build
npm run start:prod
```

## API 文档

### REST API

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/health` | GET | Gateway 健康状态 |
| `/api/sessions` | GET | 会话列表 |
| `/api/sessions/:id` | GET | 会话详情 |
| `/api/logs` | GET | 最近日志 |
| `/api/metrics/latency` | GET | 延迟指标 |
| `/api/metrics/tools` | GET | 工具调用统计 |
| `/api/actions/restart` | POST | 重启 Gateway |

### WebSocket

连接：`ws://localhost:3001/logs`

事件：
- `logs:subscribe` - 订阅日志流
- `logs:unsubscribe` - 取消订阅
- `logs:new` - 新日志推送

## 部署

```bash
# PM2 启动
pm2 start dist/main.js --name agent-monitor-ui
```

## License

MIT
