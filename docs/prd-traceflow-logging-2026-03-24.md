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

### 需要添加日志的 API

#### 1. Sessions API (`/api/sessions`)
- `GET /api/sessions` - 列表查询
- `GET /api/sessions/:id` - 会话详情
- `GET /api/sessions/:id/status` - 会话状态
- `POST /api/sessions/:id/kill` - 终止会话
- `GET /api/sessions/token-usage` - Token 使用统计

#### 2. Dashboard API (`/api/dashboard`)
- `GET /api/dashboard/overview` - 概览数据

#### 3. Health API (`/api/health`)
- `GET /api/health` - 健康检查
- `GET /api/status` - 状态查询

#### 4. OpenClaw Service（核心服务）
- `getOverview()` - 概览数据获取
- `getSessionById()` - 会话详情查询
- `listSessions()` - 会话列表
- `probeSystemPrompt()` - 系统提示探测
- `rebuildSystemPrompt()` - 系统提示重建
- RPC 调用（Gateway 通信）

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

### 方案 A：NestJS Interceptor（推荐）

**优点**：
- ✅ 统一拦截所有 Controller
- ✅ 自动记录请求/响应时间
- ✅ 代码侵入性低

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
```

### 方案 B：Decorator + Logger

**优点**：
- ✅ 更细粒度的控制
- ✅ 可以针对特定方法添加详细日志

**实现**：
```typescript
export function LogPerformance() {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor,
  ) {
    const originalMethod = descriptor.value;
    descriptor.value = async function (...args: any[]) {
      const startTime = Date.now();
      const result = await originalMethod.apply(this, args);
      const durationMs = Date.now() - startTime;
      
      Logger.debug(
        `${target.constructor.name}.${propertyKey} took ${durationMs}ms`,
        'PerformanceLogger',
      );
      
      return result;
    };
    return descriptor;
  };
}
```

### 方案 C：Service 层手动日志

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

## 推荐方案

**组合使用**：
1. **Interceptor**：统一拦截所有 Controller，记录总耗时
2. **Service 层手动日志**：关键方法（如 `getSessionById`、`getOverview`）添加详细步骤日志
3. **RPC 层日志**：Gateway 通信单独记录（网络延迟可能是瓶颈）

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

1. ✅ 所有 API 请求都有耗时日志
2. ✅ 慢查询（>1s）有 WARN 级别警告
3. ✅ 关键 Service 方法有详细的步骤分解日志
4. ✅ RPC 调用有单独的网络延迟日志
5. ✅ 日志可以通过 `pm2 logs` 或日志文件查看
6. ✅ 不影响正常业务性能（日志开销 <5%）

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
