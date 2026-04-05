# IM Channel 插件使用指南

**版本**：v1.1.0
**最后更新**：2026-04-05

---

## 一、快速开始

### 1.1 启用飞书推送

编辑 `config/openclaw.runtime.json`：

```json
{
  "im": {
    "enabled": true,
    "channels": {
      "feishu": {
        "enabled": true,
        "appId": "cli_xxx",
        "appSecret": "xxx",
        "targetUserId": "ou_xxx"
      }
    }
  }
}
```

重启服务：
```bash
pnpm run start:dev
```

### 1.2 查看 Channel 状态

```bash
# 查看已启用的 Channel
curl http://localhost:3001/api/im/channels

# 查看 Channel 健康状态
curl http://localhost:3001/api/im/channels/health

# 检查飞书是否启用
curl http://localhost:3001/api/im/channels/feishu/enabled
```

### 1.3 测试消息推送

```bash
# 发送测试消息到飞书
curl -X POST http://localhost:3001/api/im/channels/feishu/test \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello from TraceFlow!"}'

# 广播到所有 Channel
curl -X POST http://localhost:3001/api/im/broadcast/test \
  -H "Content-Type: application/json" \
  -d '{"message": "Broadcast test!"}'
```

---

## 二、配置说明

### 2.1 飞书配置

```json
{
  "im": {
    "channels": {
      "feishu": {
        "enabled": true,
        "appId": "cli_xxx",
        "appSecret": "xxx",
        "targetUserId": "ou_xxx",
        "rateLimit": 10,
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

**参数说明**：
- `appId` - 飞书应用 App ID
- `appSecret` - 飞书应用 App Secret
- `targetUserId` - 接收者 ID（open_id 或 user_id）
- `rateLimit` - 限流（条/秒）
- `pushStrategy` - 推送策略
  - `sessionStart` - 是否推送会话开始通知
  - `sessionMessages` - 是否推送会话消息
  - `sessionEnd` - 是否推送会话结束汇总
  - `errorLogs` - 是否推送 ERROR 日志
  - `warnLogs` - 是否推送 WARN 日志

### 2.2 钉钉配置

```json
{
  "im": {
    "channels": {
      "dingtalk": {
        "enabled": false,
        "appKey": "ding_xxx",
        "appSecret": "xxx",
        "agentId": 1000001,
        "targetUserId": "@all",
        "pushStrategy": {
          "sessionMessages": false,
          "errorLogs": true
        }
      }
    }
  }
}
```

**参数说明**：
- `appKey` - 钉钉应用 AppKey
- `appSecret` - 钉钉应用 AppSecret
- `agentId` - 钉钉应用 AgentId
- `targetUserId` - 接收者 ID（@all 表示所有人）

---

## 三、API 参考

### 3.1 Channel 管理

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/im/channels` | GET | 获取已启用的 Channel 列表 |
| `/api/im/channels/health` | GET | 获取 Channel 健康状态 |
| `/api/im/channels/:type/enabled` | GET | 检查 Channel 是否启用 |
| `/api/im/channels/:type/test` | POST | 发送测试消息 |
| `/api/im/broadcast/test` | POST | 广播测试消息 |

### 3.2 示例

```bash
# 获取已启用的 Channel
curl http://localhost:3001/api/im/channels
# 响应：{"channels":["feishu"]}

# 获取健康状态
curl http://localhost:3001/api/im/channels/health
# 响应：{"channels":{"feishu":{"healthy":true,"last_check":1234567890}}}

# 发送测试消息
curl -X POST http://localhost:3001/api/im/channels/feishu/test \
  -H "Content-Type: application/json" \
  -d '{"message":"Test"}'
# 响应：{"success":true,"message_id":"xxx"}
```

---

## 四、扩展新 Channel

### 4.1 实现接口

```typescript
// src/im/channels/wecom/wecom.channel.ts
import { Injectable, Logger } from '@nestjs/common';
import {
  ImChannel,
  FormattedMessage,
  SendMessageOptions,
  SendResult,
  HealthStatus,
} from '../../channel.interface';

@Injectable()
export class WeComChannel implements ImChannel {
  readonly type = 'wecom';
  private readonly logger = new Logger(WeComChannel.name);

  async initialize(config: Record<string, any>): Promise<void> {
    // 初始化逻辑
  }

  async send(content: FormattedMessage, options?: SendMessageOptions): Promise<SendResult> {
    // 发送逻辑
  }

  async healthCheck(): Promise<HealthStatus> {
    return { healthy: true, last_check: Date.now() };
  }

  destroy(): void {}
}
```

### 4.2 注册模块

```typescript
// src/im/im.module.ts
import { WeComChannel } from './channels/wecom/wecom.channel';

@Module({
  providers: [
    // ...
    {
      provide: 'CHANNEL_PLUGINS',
      useFactory: (
        feishuChannel: FeishuChannel,
        dingtalkChannel: DingTalkChannel,
        wecomChannel: WeComChannel, // 新增
      ) => [feishuChannel, dingtalkChannel, wecomChannel],
      inject: [FeishuChannel, DingTalkChannel, WeComChannel],
    },
    WeComChannel, // 新增
  ],
})
export class ImModule {}
```

### 4.3 添加配置

```json
{
  "im": {
    "channels": {
      "wecom": {
        "enabled": true,
        "corpId": "xxx",
        "agentSecret": "xxx",
        "agentId": 1000001
      }
    }
  }
}
```

---

## 五、故障排查

### 5.1 常见问题

**问题 1：Channel 未启用**
```bash
curl http://localhost:3001/api/im/channels
# 返回：{"channels":[]}
```
**解决**：检查配置文件中 `im.enabled` 和 `channels.*.enabled` 是否为 `true`

**问题 2：消息发送失败**
```bash
curl -X POST http://localhost:3001/api/im/channels/feishu/test
# 返回：{"success":false,"error":"xxx"}
```
**解决**：检查飞书凭证是否正确，查看日志 `tail -f data/traceflow.log`

**问题 3：健康检查失败**
```bash
curl http://localhost:3001/api/im/channels/health
# 返回：{"channels":{"feishu":{"healthy":false,"error":"xxx"}}}
```
**解决**：检查网络连接和 API 凭证

### 5.2 日志查看

```bash
# 查看 TraceFlow 日志
tail -f data/traceflow.log | grep -E "Channel|IM|feishu|dingtalk"

# 查看 PM2 日志
pm2 logs openclaw-traceflow --lines 100
```

---

## 六、最佳实践

### 6.1 推送策略

**推荐配置**：
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

**说明**：
- 不推送会话开始（避免刷屏）
- 推送会话消息（Thread 聚合）
- 推送会话结束汇总
- 推送 ERROR 日志（实时告警）
- 不推送 WARN 日志（避免过多）

### 6.2 限流配置

**推荐配置**：
```json
{
  "rateLimit": 10
}
```

飞书限流为 10 条/秒，设置为 10 可充分利用配额。

### 6.3 多 Channel 路由

未来可以支持按用户类型路由：
```json
{
  "manager": {
    "routing": {
      "match": { "userType": "family" },
      "channel": "feishu"
    }
  }
}
```

---

*本文档为使用指南，具体实现以代码为准。*
