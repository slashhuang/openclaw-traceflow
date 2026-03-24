# PRD — TraceFlow API 性能日志增强

**日期**：2026-03-24  
**作者**：阿布  
**状态**：待确认

---

## 背景

用户反馈 TraceFlow 的 API 接口响应慢，需要添加详细的性能日志来定位瓶颈。

---

## 目标

为 TraceFlow 的所有 API 添加详细的性能日志，便于分析：
1. **接口响应时间**：每个 API 的总耗时
2. **内部调用链**：Controller → Service → RPC/Gateway 的耗时分布
3. **慢操作定位**：识别哪个环节最慢（数据库、RPC、文件 IO 等）
4. **性能趋势**：长期监控性能变化

---

## 需求范围

### 覆盖率目标：**100%**（HTTP + WebSocket）

---

### 1. HTTP REST API

#### Sessions API (`/api/sessions`)
- `GET /api/sessions` - 列表查询
- `GET /api/sessions/:id` - 会话详情
- `GET /api/sessions/:id/status` - 会话状态
- `GET /api/sessions/:id/archive-epochs` - 归档轮次
- `POST /api/sessions/:id/kill` - 终止会话
- `GET /api/sessions/token-usage` - Token 使用统计
- `GET /api/sessions/:id/token-usage` - 单会话 Token 统计
- `POST /api/sessions/token-alerts/check` - Token 告警检查
- `GET /api/sessions/token-alerts/history` - Token 告警历史
- `GET /api/sessions/config/models` - 配置的模型列表

#### Dashboard API (`/api/dashboard`)
- `GET /api/dashboard/overview` - 概览数据

#### Health API (`/api/health`)
- `GET /api/health` - 健康检查
- `GET /api/status` - 状态查询

#### Setup API (`/api/setup`)
- `GET /api/setup/*` - 设置相关接口

#### Token Monitor API (`/api/sessions/token-*`)
- 所有 token 监控相关接口

---

### 2. WebSocket 接口（重点）

#### Gateway WebSocket 连接
- **连接建立**：记录连接时间、握手耗时
- **消息收发**：每条 WS 消息的收发时间、大小
- **心跳检测**：ping/pong 延迟
- **断开重连**：断开原因、重连次数、重连耗时

#### WS 事件类型
- `session:new` - 新会话创建
- `session:active` - 会话活动更新
- `session:completed` - 会话完成
- `session:error` - 会话错误
- `token:usage` - Token 使用更新
- `gateway:health` - Gateway 健康状态
- `rpc:*` - RPC 调用（请求/响应）

---

### 3. 内部服务调用

#### OpenClaw Service（核心服务）
- `getOverview()` - 概览数据获取
- `getSessionById()` - 会话详情查询
- `listSessions()` - 会话列表
- `listSessionsPaged()` - 分页会话列表
- `probeSystemPrompt()` - 系统提示探测
- `rebuildSystemPrompt()` - 系统提示重建
- `killSession()` - 终止会话
- RPC 调用（Gateway 通信）

#### Gateway RPC
- `getStatus()` - 获取状态
- `getSessions()` - 获取会话列表
- `sendMessage()` - 发送消息
- `streamMessage()` - 流式消息

#### Storage Layer
- JSONL 文件读取/写入
- Session 状态持久化
- Token 使用统计计算

---

## 日志格式设计

### 结构化日志（JSON 格式）

```json
{
  "timestamp": "2026-03-24T11:00:00.000Z",
  "level": "DEBUG",
  "module": "SessionsController",
  "operation": "listSessions",
  "phase": "request_start",
  "requestId": "req-123",
  "metadata": {
    "page": 1,
    "pageSize": 20,
    "filter": "all"
  }
}
```

```json
{
  "timestamp": "2026-03-24T11:00:01.500Z",
  "level": "DEBUG",
  "module": "SessionsController",
  "operation": "listSessions",
  "phase": "request_end",
  "requestId": "req-123",
  "durationMs": 1500,
  "breakdown": {
    "controllerMs": 50,
    "serviceMs": 1400,
    "rpcMs": 1200,
    "databaseMs": 100
  },
  "result": {
    "totalSessions": 150,
    "returnedItems": 20
  }
}
```

### 日志级别

| 级别 | 用途 | 示例 |
|------|------|------|
| **DEBUG** | 详细性能数据 | 每个 API 的开始/结束、耗时 |
| **INFO** | 关键操作 | 慢查询警告（>1s） |
| **WARN** | 性能告警 | 超时风险（>5s） |
| **ERROR** | 错误日志 | 请求失败、异常 |

---

## 实施方案

### 100% 覆盖率策略

| 层级 | 方案 | 覆盖率 |
|------|------|-------|
| **HTTP REST API** | NestJS Interceptor | 100% 自动覆盖 |
| **WebSocket** | WS Guard + 中间件 | 100% 覆盖 |
| **Service 层** | 关键方法手动日志 | 核心方法 100% |
| **RPC 层** | Gateway RPC 拦截器 | 100% 覆盖 |
| **Storage 层** | 文件 IO 日志 | 100% 覆盖 |

---

### 1. HTTP REST API — NestJS Interceptor（必选）

**优点**：
- ✅ 统一拦截所有 Controller
- ✅ 自动记录请求/响应时间
- ✅ 代码侵入性低
- ✅ 100% 覆盖所有 HTTP 接口

**实现**：
```typescript
@Injectable()
export class PerformanceLoggingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const startTime = Date.now();
    const requestId = `req-${Date.now()}-${Math.random()}`;
    
    return next.handle().pipe(
      tap(() => {
        const durationMs = Date.now() - startTime;
        Logger.log(`[${request.method}] ${request.url} - ${durationMs}ms`, 'PerformanceLogger');
        
        // 慢查询警告
        if (durationMs > 1000) {
          Logger.warn(`Slow API: ${request.url} took ${durationMs}ms`, 'PerformanceLogger');
        }
      }),
    );
  }
}

// 在 main.ts 中全局注册
app.useGlobalInterceptors(new PerformanceLoggingInterceptor());
```

---

### 2. WebSocket — WS Guard + 中间件（新增）

**优点**：
- ✅ 覆盖所有 WebSocket 事件
- ✅ 记录消息收发时间、大小
- ✅ 监控连接状态、心跳延迟

**实现**：
```typescript
// WebSocket 性能监控中间件
export class WsPerformanceMonitor implements NestMiddleware {
  use(socket: Socket, next: (err?: Error) => void) {
    const startTime = Date.now();
    const clientId = socket.id;
    
    // 连接建立日志
    Logger.debug(`[WS] Client ${clientId} connected`, 'WsPerformance');
    
    // 拦截所有 WS 事件
    const originalEmit = socket.emit;
    socket.emit = function (event: string, ...args: any[]) {
      const emitStart = Date.now();
      const result = originalEmit.apply(socket, [event, ...args]);
      const durationMs = Date.now() - emitStart;
      const dataSize = JSON.stringify(args).length;
      
      Logger.debug(
        `[WS] Emit "${event}" to ${clientId} - ${durationMs}ms, ${dataSize}bytes`,
        'WsPerformance',
      );
      
      // 慢事件警告
      if (durationMs > 500) {
        Logger.warn(`[WS] Slow emit "${event}": ${durationMs}ms`, 'WsPerformance');
      }
      
      return result;
    };
    
    // 监听客户端消息
    socket.onAny((event: string, ...args: any[]) => {
      const dataSize = JSON.stringify(args).length;
      Logger.debug(
        `[WS] Receive "${event}" from ${clientId} - ${dataSize}bytes`,
        'WsPerformance',
      );
    });
    
    // 心跳检测
    const pingStart = Date.now();
    socket.on('ping', () => {
      const latency = Date.now() - pingStart;
      Logger.debug(`[WS] Ping latency: ${latency}ms`, 'WsPerformance');
    });
    
    // 断开连接
    socket.on('disconnect', (reason: string) => {
      Logger.log(`[WS] Client ${clientId} disconnected: ${reason}`, 'WsPerformance');
    });
    
    next();
  }
}
```

---

### 3. Service 层 — 关键方法手动日志

**优点**：
- ✅ 最详细，可以记录内部每个步骤
- ✅ 可以识别 Service 内部的具体瓶颈

**实现**：
```typescript
async getSessionById(id: string, resetTimestamp?: string): Promise<SessionDetail | null> {
  const startTime = Date.now();
  this.logger.debug(`[getSessionById] Start for ${id}`, 'SessionsService');
  
  // 步骤 1：查询 session 元数据
  const metaStart = Date.now();
  const session = await this.findSession(id);
  this.logger.debug(`[getSessionById] Meta query: ${Date.now() - metaStart}ms`);
  
  // 步骤 2：读取 JSONL 文件
  const fileStart = Date.now();
  const messages = await this.readSessionMessages(id);
  this.logger.debug(`[getSessionById] File read: ${Date.now() - fileStart}ms`);
  
  // 步骤 3：计算 token 使用
  const tokenStart = Date.now();
  const tokenUsage = this.calculateTokenUsage(messages);
  this.logger.debug(`[getSessionById] Token calc: ${Date.now() - tokenStart}ms`);
  
  this.logger.debug(`[getSessionById] Total: ${Date.now() - startTime}ms`);
  
  return { ...session, messages, tokenUsage };
}
```

---

### 4. RPC 层 — Gateway RPC 拦截器

**实现**：
```typescript
// gateway-rpc.ts
async call<T>(method: string, params?: any): Promise<T> {
  const startTime = Date.now();
  const requestId = `rpc-${Date.now()}`;
  
  this.logger.debug(`[RPC] Call "${method}" start`, 'GatewayRpc');
  
  try {
    const result = await this.wsClient.send(method, params);
    const durationMs = Date.now() - startTime;
    
    this.logger.debug(
      `[RPC] "${method}" completed: ${durationMs}ms`,
      'GatewayRpc',
    );
    
    // 慢 RPC 警告
    if (durationMs > 1000) {
      this.logger.warn(`[RPC] Slow call "${method}": ${durationMs}ms`, 'GatewayRpc');
    }
    
    return result as T;
  } catch (error) {
    const durationMs = Date.now() - startTime;
    this.logger.error(
      `[RPC] "${method}" failed after ${durationMs}ms: ${error.message}`,
      'GatewayRpc',
    );
    throw error;
  }
}
```

---

### 5. Storage 层 — 文件 IO 日志

**实现**：
```typescript
// session-storage.ts
async readSessionMessages(sessionId: string): Promise<SessionMessage[]> {
  const startTime = Date.now();
  const filePath = this.getSessionPath(sessionId);
  
  this.logger.debug(`[Storage] Read session ${sessionId} start`, 'SessionStorage');
  
  try {
    const messages = await this.parseJsonlFile(filePath);
    const durationMs = Date.now() - startTime;
    const fileSize = fs.statSync(filePath).size;
    
    this.logger.debug(
      `[Storage] Read session ${sessionId}: ${durationMs}ms, ${fileSize}bytes`,
      'SessionStorage',
    );
    
    // 慢 IO 警告
    if (durationMs > 500) {
      this.logger.warn(
        `[Storage] Slow read session ${sessionId}: ${durationMs}ms`,
        'SessionStorage',
      );
    }
    
    return messages;
  } catch (error) {
    this.logger.error(`[Storage] Read session ${sessionId} failed: ${error.message}`);
    throw error;
  }
}
```

---

## 输出配置

### 日志文件

```
openclaw-traceflow/
└── logs/
    ├── traceflow.log          # 常规日志
    ├── traceflow-error.log    # 错误日志
    └── traceflow-performance.log  # 性能日志（新增）
```

### PM2 配置

在 `ecosystem.config.cjs` 中添加：
```javascript
{
  name: 'openclaw-traceflow',
  script: 'dist/main.js',
  cwd: '/root/githubRepo/claw-sources/openclaw-traceflow',
  error_file: './logs/traceflow-error.log',
  out_file: './logs/traceflow.log',
  log_date_format: 'YYYY-MM-DD HH:mm:ss.SSS',
  env: {
    LOG_LEVEL: 'debug',  // 开发环境
    PERFORMANCE_LOG: 'true',
  },
}
```

---

## 验收标准

### HTTP REST API
1. ✅ 所有 HTTP 接口都有耗时日志（Interceptor 自动覆盖）
2. ✅ 慢查询（>1s）有 WARN 级别警告
3. ✅ 日志包含：请求方法、URL、耗时、状态码

### WebSocket
4. ✅ 所有 WS 事件都有日志（连接、消息、断开）
5. ✅ WS 消息记录：事件名、耗时、数据大小
6. ✅ 心跳延迟记录（ping/pong）
7. ✅ 慢事件（>500ms）有 WARN 警告

### Service 层
8. ✅ 关键方法有详细的步骤分解日志
9. ✅ 每个步骤都有耗时记录
10. ✅ 总耗时 = 各步骤耗时之和（误差 <10%）

### RPC 层
11. ✅ 所有 RPC 调用都有耗时日志
12. ✅ 网络延迟单独记录
13. ✅ 慢 RPC（>1s）有 WARN 警告

### Storage 层
14. ✅ 文件 IO 操作有耗时日志
15. ✅ 慢 IO（>500ms）有 WARN 警告

### 整体
16. ✅ 日志可以通过 `pm2 logs` 或日志文件查看
17. ✅ 不影响正常业务性能（日志开销 <5%）
18. ✅ **覆盖率 100%**（HTTP + WS + Service + RPC + Storage）

---

## 实施计划

### 阶段 1：基础日志（1 个 PR）
- 添加 PerformanceLoggingInterceptor
- 配置日志输出
- 测试验证

### 阶段 2：详细日志（1-2 个 PR）
- Service 层关键方法添加详细日志
- RPC 层添加网络延迟日志
- 性能分析文档

### 阶段 3：监控告警（可选）
- 慢查询自动告警
- 性能趋势分析
- Dashboard 性能面板

---

## 风险与注意事项

1. **日志量**：DEBUG 级别日志可能很多，建议生产环境用 INFO
2. **性能开销**：日志本身有性能开销，需控制在 5% 以内
3. **隐私**：日志中不包含敏感信息（用户数据、token 等）
4. **日志轮转**：配置日志文件大小限制，避免磁盘占满

---

## 待确认问题

1. **日志级别**：生产环境用什么级别？（建议 INFO，开发用 DEBUG）
2. **日志存储**：是否需要集中式日志管理（如 ELK、Loki）？
3. **告警阈值**：慢查询告警阈值设为多少？（建议 1s 警告，5s 告警）

---

**请爸爸确认后，阿布开始实施～** 👧
