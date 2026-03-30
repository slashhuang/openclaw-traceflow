# PRD: TraceFlow 日志查看器

## 1. 背景

TraceFlow 部署后，查看日志需要 SSH 到服务器或使用 PM2 CLI，不方便快速排查问题。需要在 TraceFlow 前端增加日志查看功能，支持实时查看后端日志。

## 2. 目标

- ✅ 在 TraceFlow 前端增加日志查看页面
- ✅ 支持 10 秒自动刷新
- ✅ 支持日志级别过滤（error / warn / info / debug）
- ✅ 支持关键词搜索
- ✅ 自动滚动到最新日志

## 3. 技术方案

### 3.1 后端（NestJS）

**新增模块**：`logs/`

```
src/logs/
├── logs.module.ts
├── logs.controller.ts
├── logs.service.ts
└── types.ts
```

**API 设计**：

```typescript
GET /api/logs
Query Params:
  - lines?: number (默认 100, 最大 500)
  - level?: 'error' | 'warn' | 'info' | 'debug' (可选，过滤级别)
  - search?: string (可选，关键词搜索)
  - cursor?: number (可选，分页游标)

Response:
{
  "success": true,
  "data": {
    "lines": [
      {
        "timestamp": "2026-03-30T05:00:00.000Z",
        "level": "info",
        "message": "llm.generate 成功，原始响应：...",
        "context": { "sessionId": "xxx" }
      }
    ],
    "nextCursor": 1234,
    "hasMore": true
  }
}
```

**实现细节**：
- 读取 PM2 日志文件：`/root/.pm2/logs/openclaw-traceflow-*.log`
- 支持 tail 模式（从文件末尾读取）
- 日志解析：识别 NestJS 默认日志格式 `[timestamp] [level] message`
- 性能优化：限制最大读取行数（500），避免大文件阻塞

### 3.2 前端（React）

**新增路由**：`/logs`

```
frontend/src/pages/
└── LogsPage.tsx

frontend/src/components/
└── LogViewer/
    ├── LogViewer.tsx
    ├── LogLine.tsx
    ├── LogFilter.tsx
    └── index.ts
```

**UI 设计**：
- 侧边栏新增菜单项：📋 日志（Logs）
- 日志列表（类似终端样式，深色背景）
- 顶部工具栏：
  - 日志级别筛选（多选：Error / Warn / Info / Debug）
  - 搜索框（关键词）
  - 刷新控制（暂停/恢复，显示上次刷新时间）
  - 行数选择（100 / 200 / 500）
- 自动滚动到最新日志（可关闭）

**轮询逻辑**：
- 10 秒自动刷新
- 暂停时不刷新
- 刷新时显示加载状态

### 3.3 安全考虑

- ✅ 使用现有 Auth Guard（operator scope）
- ⚠️ 日志脱敏：隐藏 token、password 等敏感字段（后端处理）

## 4. 验收标准

- [ ] 访问 `/logs` 路由能看到后端日志
- [ ] 10 秒自动刷新正常工作
- [ ] 日志级别过滤正确
- [ ] 关键词搜索正确
- [ ] 自动滚动到最新日志
- [ ] 暂停/恢复刷新功能正常
- [ ] 移动端响应式（可选）

## 5. 实现计划

### Phase 1: 后端 API
- [ ] 创建 `logs/` 模块
- [ ] 实现日志读取服务
- [ ] 实现日志解析（级别、时间戳、消息）
- [ ] 实现过滤和搜索
- [ ] 添加日志脱敏

### Phase 2: 前端页面
- [ ] 创建 `LogsPage` 组件
- [ ] 创建 `LogViewer` 组件
- [ ] 实现轮询逻辑
- [ ] 实现过滤和搜索 UI
- [ ] 添加侧边栏菜单

### Phase 3: 测试和优化
- [ ] 测试大日志文件性能
- [ ] 测试长轮询稳定性
- [ ] 优化日志解析性能

## 6. 技术栈

- 后端：NestJS + fs/promises
- 前端：React + TailwindCSS
- 状态管理：Zustand（现有）

## 7. 风险

- **性能**：大日志文件（>100MB）可能导致读取缓慢
  - 缓解：限制最大读取行数，使用流式读取
- **敏感信息**：日志可能包含 token
  - 缓解：后端脱敏处理

## 8. 后续扩展（可选）

- 多日志文件切换（应用日志 / 错误日志 / 评估日志）
- 日志下载功能
- 日志统计（错误率、趋势图）
- WebSocket 实时推送（替代轮询）
