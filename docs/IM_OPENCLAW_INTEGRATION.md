# IM 推送与 OpenClaw 集成详解

**文档类型**：技术架构说明
**最后更新**：2026-04-05

---

## 核心定位

**重要**：IM 推送只关注 **OpenClaw 产生的数据**，不推送 TraceFlow 自身的日志。

### 数据范围

| 数据类型 | 来源 | 是否推送 |
|----------|------|----------|
| **会话记录** | OpenClaw `sessions/*.jsonl` | ✅ 推送 |
| **用户消息** | OpenClaw `sessions/*.jsonl` | ✅ 推送 |
| **AI 回复** | OpenClaw `sessions/*.jsonl` | ✅ 推送 |
| **技能调用** | OpenClaw `sessions/*.jsonl` | ✅ 推送 |
| **Token 用量** | OpenClaw `sessions/*.jsonl` | ✅ 推送（汇总） |
| **TraceFlow 日志** | TraceFlow 自身 | ❌ 不推送 |

---

## 会话开始点位实现

### 实现原理

**核心思路**：监听 OpenClaw 的 `sessions.json` 索引文件变化，检测新会话创建。

### 数据流

```
┌─────────────────────────────────────────────────────────────┐
│                    OpenClaw Gateway                          │
│  1. 用户发送消息                                              │
│  2. 创建新会话                                                │
│  3. 写入 sessions.json（索引文件）                              │
│  4. 写入 sessions/{sessionId}.jsonl（会话记录）                 │
└───────────────────┬─────────────────────────────────────────┘
                    │
                    │ fs.watch 监听 sessions.json
                    ▼
┌─────────────────────────────────────────────────────────────┐
│               OpenClawFileWatcher                            │
│  1. 检测到 sessions.json 变化                                  │
│  2. 读取新的 sessionKey                                       │
│  3. 触发 session:start 事件                                    │
└───────────────────┬─────────────────────────────────────────┘
                    │
                    │ EventEmitter2
                    ▼
┌─────────────────────────────────────────────────────────────┐
│                   SessionManager                             │
│  1. 接收 session:start 事件                                    │
│  2. 创建会话记录                                              │
│  3. 触发 audit.session.start 事件                              │
└───────────────────┬─────────────────────────────────────────┘
                    │
                    │ audit.session.start
                    ▼
┌─────────────────────────────────────────────────────────────┐
│                   ImPushService                              │
│  1. 检查 pushStrategy.sessionStart                            │
│  2. 格式化父消息                                              │
│  3. 发送到飞书                                                │
└───────────────────┬─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────┐
│                   飞书审计机器人                               │
│  【审计·会话】妈妈 @ 10:30:00 🟢                               │
└─────────────────────────────────────────────────────────────┘
```

### 代码实现

#### 1. 监听 sessions.json 变化

```typescript
// src/adapters/openclaw/file-watcher.adapter.ts:58-72
private watchSessionsIndex(): void {
  const indexPath = path.join(this.sessionsDir, 'sessions.json');

  if (!fs.existsSync(indexPath)) {
    this.logger.warn(`sessions.json not found: ${indexPath}`);
    return;
  }

  // 使用 fs.watch 监听文件变化
  fs.watch(indexPath, (eventType) => {
    if (eventType === 'change') {
      this.checkNewSessions();
    }
  });

  this.logger.debug('Watching sessions.json');
}
```

#### 2. 检测新会话

```typescript
// src/adapters/openclaw/file-watcher.adapter.ts:106-125
private checkNewSessions(): void {
  try {
    const indexPath = path.join(this.sessionsDir, 'sessions.json');
    const indexData = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));

    for (const [sessionKey, entry] of Object.entries(indexData)) {
      // 检查是否是新会话
      if (!this.knownSessions.has(sessionKey)) {
        this.knownSessions.add(sessionKey);
        this.watchSessionFile((entry as any).sessionFile, sessionKey);

        // 触发 session:start 事件
        this.eventEmitter.emit('session:start', {
          sessionKey,
          sessionId: sessionKey,
          sessionFile: (entry as any).sessionFile,
        });

        this.logger.debug(`New session detected: ${sessionKey}`);
      }
    }
  } catch (error) {
    // 忽略解析错误（可能是写入中）
  }
}
```

#### 3. sessions.json 格式

```json
{
  "agent:main:feishu:direct:ou_xxx": {
    "sessionId": "agent:main:feishu:direct:ou_xxx",
    "sessionFile": "agent:main:feishu:direct:ou_xxx.jsonl",
    "createdAt": 1743825000000,
    "updatedAt": 1743825005000,
    "systemPromptReport": {
      "workspaceDir": "/Users/huangxiaogang/.openclaw/workspace"
    }
  }
}
```

**关键点**：
- **Key**: `sessionKey`（格式：`agent:{agentId}:{channel}:{chatType}:{userId}`）
- **sessionFile**: 会话记录文件名
- **createdAt**: 会话创建时间（用于检测新会话）

#### 4. 触发推送

```typescript
// src/im/im-push.service.ts:48-56
onModuleInit(): void {
  // ...

  // 订阅会话事件
  this.eventEmitter.on('audit.session.start', (session) =>
    this.handleSessionStart(session),
  );
  this.eventEmitter.on('audit.session.message', (data) =>
    this.handleSessionMessage(data),
  );
  this.eventEmitter.on('audit.session.end', (session) =>
    this.handleSessionEnd(session),
  );

  this.logger.log('IM Push Service event listeners registered');
}
```

---

## 会话消息点位实现

### 实现原理

监听 `sessions/{sessionId}.jsonl` 文件变化，检测新消息写入。

### 代码实现

```typescript
// src/adapters/openclaw/file-watcher.adapter.ts:127-180
private watchSessionFile(filename: string, sessionKey: string): void {
  const filePath = path.join(this.sessionsDir, filename);
  let lastSize = 0;
  let lastProcessedLine = '';

  const watcher = fs.watch(filePath, (eventType) => {
    if (eventType !== 'change') return;

    try {
      const stats = fs.statSync(filePath);
      
      // 检测文件大小变化
      if (stats.size <= lastSize) return;

      // 读取新增内容
      const buffer = Buffer.alloc(stats.size - lastSize);
      const fd = fs.openSync(filePath, 'r');
      fs.readSync(fd, buffer, 0, stats.size - lastSize, lastSize);
      fs.closeSync(fd);

      const newContent = buffer.toString('utf-8');
      const lines = newContent.split('\n').filter((line) => line.trim());

      for (const line of lines) {
        if (line === lastProcessedLine) continue;

        try {
          const record = JSON.parse(line);
          
          // 触发 session:message 事件
          this.eventEmitter.emit('session:message', {
            sessionKey,
            sessionId: sessionKey,
            record,
          });
          
          lastProcessedLine = line;
        } catch (parseError) {
          // 可能是写入中，忽略
        }
      }

      lastSize = stats.size;
    } catch (error) {
      // 文件可能被删除
    }
  });

  this.watchers.set(sessionKey, watcher);
}
```

### JSONL 记录格式

```json
{"type":"user","role":"user","content":"帮我看看茅台","senderId":"ou_xxx","senderName":"妈妈","timestamp":1743825000123}
{"type":"assistant","role":"assistant","content":"好的...","model":"qwen3.5-plus","tokens":{"input":100,"output":200},"timestamp":1743825005456}
{"type":"skill","name":"stock-assistant","action":"fetch","input":{"symbols":["600519"]},"timestamp":1743825000500}
```

---

## 会话结束点位实现

### 实现原理

**超时机制**：5 分钟无新消息视为会话结束。

### 代码实现

```typescript
// src/im/session-manager.ts:120-140
private startCleanupTimer(): void {
  this.cleanupInterval = setInterval(() => {
    const now = Date.now();

    for (const [sessionId, session] of this.activeSessions.entries()) {
      if (session.status === 'completed') continue;

      // 检测 5 分钟无活动
      const inactiveTime = now - (session.lastActivity || session.startTime);
      if (inactiveTime > this.SESSION_END_TIMEOUT_MS) {
        this.completeSession(sessionId);
      }
    }
  }, 60000); // 每分钟检查一次
}

private async completeSession(sessionId: string): Promise<void> {
  const session = this.activeSessions.get(sessionId);
  if (!session || session.status === 'completed') return;

  session.status = 'completed';
  session.endTime = Date.now();

  // 触发 audit.session.end 事件
  this.eventEmitter.emit('audit.session.end', session);

  // 从活跃会话移除
  this.activeSessions.delete(sessionId);
}
```

---

## 与 OpenClaw 的结合方式

### 集成点

| 集成点 | OpenClaw 组件 | TraceFlow 组件 |
|--------|--------------|----------------|
| **会话索引** | `sessions/sessions.json` | `OpenClawFileWatcher.watchSessionsIndex()` |
| **会话记录** | `sessions/*.jsonl` | `OpenClawFileWatcher.watchSessionFile()` |
| **会话状态** | `sessions.json` 中的 `updatedAt` | `SessionManager.activeSessions` |

### 依赖关系

```
TraceFlow IM 推送
    ↓ 依赖
OpenClawFileWatcher
    ↓ 监听
OpenClaw sessions/*.jsonl
    ↓ 由 OpenClaw Gateway 写入
OpenClaw Gateway
    ↓ 处理
用户消息 / AI 回复 / 技能调用
```

### 不依赖的内容

- ❌ 不依赖 OpenClaw WebSocket
- ❌ 不依赖 OpenClaw HTTP API
- ❌ 不依赖 OpenClaw 事件系统
- ✅ **只依赖文件系统**（sessions/*.jsonl）

---

## 优势

### 1. 解耦

- TraceFlow 和 OpenClaw Gateway 完全解耦
- 不需要修改 OpenClaw 代码
- 不需要 OpenClaw 支持特定事件

### 2. 可靠

- 文件系统是持久化的
- 即使 Gateway 重启，数据不会丢失
- 可以回溯历史会话

### 3. 简单

- 不需要复杂的集成
- 只需要读取 JSONL 文件
- 易于调试和维护

---

## 配置示例

```json
{
  "sources": [
    {
      "type": "openclaw",
      "enabled": true,
      "config": {
        "sessionsDir": "/Users/huangxiaogang/.openclaw/agents/main/sessions"
      }
    }
  ],
  "im": {
    "enabled": true,
    "channels": {
      "feishu": {
        "enabled": true,
        "appId": "cli_xxx",
        "appSecret": "xxx",
        "targetUserId": "ou_xxx",
        "pushStrategy": {
          "sessionStart": false,
          "sessionMessages": true,
          "sessionEnd": true,
          "errorLogs": true,
          "warnLogs": false
        }
      }
    }
  }
}
```

---

*本文档为技术架构说明，具体实现以代码为准。*
