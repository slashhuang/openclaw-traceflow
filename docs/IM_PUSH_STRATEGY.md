# IM 推送策略实现详解

**文档类型**：技术实现说明
**最后更新**：2026-04-05

---

## 推送策略配置

```json
{
  "im": {
    "channels": {
      "feishu": {
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

## 各策略项实现详解

### 1. sessionStart（会话开始通知）

**配置项**：`pushStrategy.sessionStart`

**默认值**：`false`（不推送）

**实现逻辑**：

```typescript
// src/im/im-push.service.ts:63-90
private async handleSessionStart(session: SessionEvent): Promise<void> {
  const config = this.configService.getConfig();
  const pushStrategy = config?.im?.channels?.feishu?.pushStrategy || {};

  // 检查推送策略
  if (pushStrategy.sessionStart === false) {
    this.logger.debug('Session start push disabled');
    return;  // ← 策略为 false 时直接返回，不推送
  }

  try {
    // 发送父消息到飞书
    const parentMessage = this.formatter.formatSessionParent(session, 'active');
    const result = await this.channelManager.sendToChannel('feishu', parentMessage);

    if (result) {
      // 记录父消息 ID 到会话（用于后续 Thread 回复）
      (session as any).parentId = result.message_id;
      this.logger.log(
        `Session parent message created: ${session.sessionId} -> ${result.message_id}`,
      );
    }
  } catch (error) {
    this.logger.error(
      `Failed to send session start: ${session.sessionId}`,
      error as Error,
    );
  }
}
```

**推送内容**（飞书父消息）：
```
【审计·会话】妈妈 @ 2026-04-05 10:30:00 🟢
━━━━━━━━━━━━━━━━━━━━━━
👤 用户：妈妈
🤖 账号：jojo
💬 会话：agent:main:feishu:direct:ou_xxx
📊 状态：进行中

【首条消息】
"帮我看看茅台"

━━━━━━━━━━━━━━━━━━━━━━
📎 点击展开查看完整对话
🔗 在 TraceFlow 中查看：http://localhost:3001/sessions/xxx
```

**触发时机**：
- 用户发送第一条消息时
- OpenClaw 创建新 Session 时

**为什么默认关闭**：
- 避免消息刷屏（每个会话都会创建一条消息）
- 用户更关注会话内容，而不是会话开始

---

### 2. sessionMessages（会话消息推送）

**配置项**：`pushStrategy.sessionMessages`

**默认值**：`true`（推送）

**实现逻辑**：

```typescript
// src/im/im-push.service.ts:92-138
private async handleSessionMessage(data: {
  sessionId: string;
  message: any;
  session: SessionEvent;
}): Promise<void> {
  const parentId = (data.session as any).parentId;
  if (!parentId) {
    this.logger.warn(`No parent ID for session: ${data.sessionId}`);
    return;
  }

  try {
    let message;

    // 根据消息类型格式化
    switch (data.message.type) {
      case 'user':
        message = this.formatter.formatUserMessage(data.message);
        break;
      case 'assistant':
        message = this.formatter.formatAssistantMessage(data.message);
        break;
      case 'skill:start':
        message = this.formatter.formatSkillStart(data.message);
        break;
      case 'skill:end':
        message = this.formatter.formatSkillEnd(data.message);
        break;
      default:
        this.logger.warn(`Unknown message type: ${data.message.type}`);
        return;
    }

    // 发送到 Thread（使用 reply_id 聚合到父消息）
    await this.channelManager.sendToChannel('feishu', message, { 
      reply_id: parentId 
    });
  } catch (error) {
    this.logger.error(
      `Failed to send message: ${data.sessionId}`,
      error as Error,
    );
  }
}
```

**推送内容**（Thread 内消息）：

**用户消息**：
```
💬 【用户消息】
📅 10:30:00.123

帮我看看茅台

---
📎 消息 ID: msg_abc123
```

**AI 回复**：
```
🤖 【AI 回复】
📅 10:30:05.456
🧠 qwen3.5-plus
🪙 Token: 100→200
⏱️ 耗时：5.3s

好的，茅台现价 1750 元...

---
🔧 技能：stock-assistant
```

**技能调用开始**：
```
🔧 【技能开始】
📅 10:30:00.500
📦 技能：stock-assistant
📝 动作：fetch_quotes

【输入】
symbols: ["600519"]
```

**技能调用结束**：
```
✅ 【技能结束】
📅 10:30:03.700
📦 技能：stock-assistant
✅ 状态：success
⏱️ 耗时：3.2s

【输出】
600519: { price: 1750.00 }
```

**触发时机**：
- 用户发送消息
- AI 回复消息
- 技能调用开始/结束
- 工具使用

**推送方式**：
- 使用 `reply_id` 参数发送到父消息的 Thread
- 所有消息聚合在一个 Thread 内，避免刷屏

---

### 3. sessionEnd（会话结束汇总）

**配置项**：`pushStrategy.sessionEnd`

**默认值**：`true`（推送）

**实现逻辑**：

```typescript
// src/im/im-push.service.ts:140-172
private async handleSessionEnd(session: SessionEvent): Promise<void> {
  const parentId = (session as any).parentId;
  if (!parentId) {
    this.logger.warn(`No parent ID for session: ${session.sessionId}`);
    return;
  }

  try {
    // 1. 发送会话结束消息到 Thread
    const endMessage = this.formatter.formatSessionEnd(session);
    await this.channelManager.sendToChannel('feishu', endMessage, { 
      reply_id: parentId 
    });

    // 2. 更新父消息为完成状态
    const updatedParent = this.formatter.formatSessionParent(
      session,
      'completed',
    );
    await this.channelManager.sendToChannel('feishu', updatedParent);

    this.logger.log(`Session completed: ${session.sessionId}`);
  } catch (error) {
    this.logger.error(
      `Failed to end session: ${session.sessionId}`,
      error as Error,
    );
  }
}
```

**推送内容**：

**Thread 内的结束消息**：
```
✅ 【会话结束】
📅 10:35:05.500
📊 统计：
  • 总消息：5 条
  • 总耗时：5.5s
  • Token：输入 100，输出 200
```

**更新的父消息**（聊天列表显示）：
```
【审计·会话】妈妈 @ 2026-04-05 10:30:00 ✅
━━━━━━━━━━━━━━━━━━━━━━
👤 用户：妈妈
🤖 账号：jojo
💬 会话：agent:main:feishu:direct:ou_xxx
📊 状态：✅ 已完成

【会话摘要】
• 消息数：5 条
• 技能调用：1 次
• 耗时：5.5s
• Token：输入 100，输出 200

【首条消息】
"帮我看看茅台"

━━━━━━━━━━━━━━━━━━━━━━
📎 点击展开查看完整对话（5 条）
```

**触发时机**：
- 会话超时（5 分钟无活动）
- 用户主动结束会话

**为什么默认开启**：
- 提供会话摘要，便于快速了解会话概况
- 更新父消息状态，聊天列表显示"已完成"

---

### 4. errorLogs（ERROR 日志推送）

**配置项**：`pushStrategy.errorLogs`

**默认值**：`true`（推送）

**实现逻辑**：

```typescript
// src/im/im-push.service.ts:174-196
private async handleErrorLog(log: any): Promise<void> {
  const config = this.configService.getConfig();
  const pushStrategy = config?.im?.channels?.feishu?.pushStrategy || {};

  // 检查推送策略
  if (pushStrategy.errorLogs === false) {
    return;
  }

  try {
    const message = this.formatter.formatErrorLog(log);
    await this.channelManager.sendToChannel('feishu', message);

    this.logger.log(`Error log pushed: ${log.component} - ${log.message}`);
  } catch (error) {
    this.logger.error('Failed to send error log:', error as Error);
  }
}
```

**推送内容**（独立消息，不聚合到 Thread）：
```
❌【审计·错误告警】
━━━━━━━━━━━━━━━━━━━━━━
📅 2026-04-05 10:40:00.000
📦 组件：skill:stock-assistant
💬 会话：agent:main:feishu:direct:ou_xxx

【错误内容】
API timeout after 30s

【堆栈跟踪】
Error: Timeout
    at StockService.fetch (...:45:12)

━━━━━━━━━━━━━━━━━━━━━━
🔗 在 TraceFlow 中查看：http://localhost:3001/logs?level=error
```

**触发时机**：
- OpenClaw Gateway 产生 ERROR 级别日志
- 技能调用失败
- API 调用超时
- 系统错误

**推送方式**：
- **独立消息**（不使用 `reply_id`）
- 直接发送到聊天列表，确保及时可见
- 不聚合到任何 Thread

**为什么默认开启**：
- 错误需要及时发现和处理
- 独立消息确保告警可见性

---

### 5. warnLogs（WARN 日志推送）

**配置项**：`pushStrategy.warnLogs`

**默认值**：`false`（不推送）

**实现逻辑**：
```typescript
// 目前未实现 WARN 日志推送
// 预留配置项，未来可实现
```

**为什么不实现**：
- WARN 日志通常较多，容易造成刷屏
- 重要性不如 ERROR 日志
- 可在 TraceFlow Web GUI 中查看

**未来实现方案**（如需）：
```typescript
private async handleWarnLog(log: any): Promise<void> {
  const config = this.configService.getConfig();
  const pushStrategy = config?.im?.channels?.feishu?.pushStrategy || {};

  if (pushStrategy.warnLogs === false) {
    return;
  }

  // 聚合 WARN 日志（例如每 10 条或每 5 分钟发送一次）
  // 避免刷屏
}
```

---

## 事件流图

```
┌─────────────────────────────────────────────────────────────┐
│                    OpenClaw Gateway                          │
│  (sessions/*.jsonl)                                          │
└───────────────────┬─────────────────────────────────────────┘
                    │
                    │ fs.watch 监听
                    ▼
┌─────────────────────────────────────────────────────────────┐
│                  OpenClawFileWatcher                         │
│  - 监听 JSONL 文件变化                                         │
│  - 触发事件：session:start, session:message, session:end    │
└───────────────────┬─────────────────────────────────────────┘
                    │
                    │ EventEmitter2
                    ▼
┌─────────────────────────────────────────────────────────────┐
│                   SessionManager                             │
│  - 管理会话生命周期                                           │
│  - 检测会话结束（5 分钟超时）                                  │
└───────────────────┬─────────────────────────────────────────┘
                    │
                    │ audit.session.* 事件
                    ▼
┌─────────────────────────────────────────────────────────────┐
│                   ImPushService                              │
│  - 检查推送策略                                              │
│  - 格式化消息                                                │
│  - 调用 Channel 发送                                          │
└───────────────────┬─────────────────────────────────────────┘
                    │
                    │ ChannelManager.sendToChannel()
                    ▼
┌─────────────────────────────────────────────────────────────┐
│                   FeishuChannel                              │
│  - 限流控制（10 条/秒）                                        │
│  - 重试机制                                                  │
│  - 飞书 API 调用                                               │
└───────────────────┬─────────────────────────────────────────┘
                    │
                    │ 飞书 API
                    ▼
┌─────────────────────────────────────────────────────────────┐
│                   飞书审计机器人                               │
│  - 父消息（会话开始）                                         │
│  - Thread 消息（会话消息）                                     │
│  - 独立消息（ERROR 告警）                                      │
└─────────────────────────────────────────────────────────────┘
```

---

## 配置示例

### 最小化推送（只推送 ERROR）

```json
{
  "pushStrategy": {
    "sessionStart": false,
    "sessionMessages": false,
    "sessionEnd": false,
    "errorLogs": true,
    "warnLogs": false
  }
}
```

### 标准推送（推荐）

```json
{
  "pushStrategy": {
    "sessionStart": false,
    "sessionMessages": true,
    "sessionEnd": true,
    "errorLogs": true,
    "warnLogs": false
  }
}
```

### 完整推送（调试用）

```json
{
  "pushStrategy": {
    "sessionStart": true,
    "sessionMessages": true,
    "sessionEnd": true,
    "errorLogs": true,
    "warnLogs": true
  }
}
```

---

## 性能优化

### 限流控制

```typescript
// FeishuChannel 内部实现
private async acquireToken(): Promise<void> {
  while (true) {
    this.refill();
    if (this.tokenBucket >= 1) {
      this.tokenBucket--;
      return;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
}
```

- 令牌桶算法
- 10 条/秒
- 突发容量 20 条

### Thread 聚合

- 使用 `reply_id` 参数
- 所有会话消息聚合到一个 Thread
- 避免聊天列表刷屏

### 错误处理

```typescript
try {
  await this.channelManager.sendToChannel('feishu', message);
} catch (error) {
  this.logger.error('Failed to send message:', error);
  // 不抛出错误，避免影响主流程
}
```

- 推送失败不影响主流程
- 记录日志便于排查

---

*本文档为技术实现说明，具体实现以代码为准。*
