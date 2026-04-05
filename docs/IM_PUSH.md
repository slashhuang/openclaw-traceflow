# IM 推送功能

OpenClaw TraceFlow 的 IM 推送功能可以将 AI Agent 的会话记录实时推送到飞书、钉钉等 IM 平台，按会话聚合展示，便于搜索和回溯。

## 快速开始

### 1. 配置 IM 推送

编辑 `config/openclaw.runtime.json`（或创建新文件）：

```json
{
  "im": {
    "enabled": true,
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

### 2. 获取飞书机器人凭证

1. 访问 [飞书开放平台](https://open.feishu.cn/)
2. 创建企业自建应用
3. 获取 `App ID` 和 `App Secret`
4. 配置机器人发送消息权限
5. 获取目标用户的 `Open ID`（格式：`ou_xxx`）

### 3. 启动 TraceFlow

```bash
# 使用配置文件启动
pnpm run start:dev

# 或指定配置文件
OPENCLAW_RUNTIME_CONFIG=config/openclaw.runtime.im.json pnpm run start:dev
```

### 4. 验证推送

1. 在飞书与 OpenClaw 机器人对话
2. 检查飞书审计机器人是否收到推送消息
3. 点击 Thread 查看完整对话

## 推送策略配置

| 配置项            | 说明                         | 默认值  |
| ----------------- | ---------------------------- | ------- |
| `sessionStart`    | 推送会话开始通知             | `false` |
| `sessionMessages` | 推送会话消息（用户/AI/技能） | `true`  |
| `sessionEnd`      | 推送会话结束汇总             | `true`  |
| `errorLogs`       | 推送 ERROR 日志告警          | `true`  |
| `warnLogs`        | 推送 WARN 日志               | `false` |

## 消息格式

### 会话父消息（聊天列表）

```
【审计·会话】妈妈 @ 2026-04-05 10:30:00 🟢
━━━━━━━━━━━━━━━━━━━━━━
👤 用户：妈妈
🤖 账号：阿布
💬 会话：agent:main:feishu:direct:ou_xxx
📊 状态：进行中

【首条消息】
"帮我看看茅台"

━━━━━━━━━━━━━━━━━━━━━━
📎 点击展开查看完整对话
🔗 在 TraceFlow 中查看：http://localhost:3001/sessions/...
```

### Thread 内消息

```
💬 【用户消息】
📅 10:30:00.123

帮我看看茅台

---
📎 消息 ID: msg_abc123
```

```
🤖 【AI 回复】
📅 10:30:05.456
🧠 qwen3.5-plus
🪙 Token: 100→200

好的，茅台现价 1750 元...
```

## 环境变量

也可以通过环境变量配置：

```bash
# IM 推送开关
TRACEFLOW_IM_ENABLED=true
TRACEFLOW_IM_FEISHU_ENABLED=true

# 飞书凭证
TRACEFLOW_FEISHU_APP_ID=cli_xxx
TRACEFLOW_FEISHU_APP_SECRET=xxx
TRACEFLOW_FEISHU_TARGET_USER_ID=ou_xxx

# 推送策略
TRACEFLOW_FEISHU_PUSH_SESSION_START=false
TRACEFLOW_FEISHU_PUSH_SESSION_MESSAGES=true
TRACEFLOW_FEISHU_PUSH_SESSION_END=true
TRACEFLOW_FEISHU_PUSH_ERROR_LOGS=true
```

## 故障排查

### 日志查看

```bash
# 查看 TraceFlow 日志
tail -f data/traceflow.log

# 或查看 PM2 日志
pm2 logs openclaw-traceflow
```

### 常见问题

**问题 1：收不到推送消息**

- 检查 `im.enabled` 是否为 `true`
- 检查飞书凭证是否正确
- 查看日志是否有 `Feishu API error`

**问题 2：推送延迟高**

- 检查网络连接到飞书 API
- 检查限流配置（默认 10 条/秒）
- 查看日志中的重试信息

**问题 3：会话未聚合**

- 检查 `reply_id` 是否正确传递
- 查看 SessionManager 是否正确创建父消息
- 检查会话超时时间（默认 5 分钟）

## 架构说明

```
OpenClaw Gateway (sessions/*.jsonl)
         │
         ▼
FileWatcher (监听文件变化)
         │
         ▼
SessionManager (会话生命周期管理)
         │
         ▼
ImPushService (推送服务)
         │
         ▼
FeishuChannel (飞书 API)
         │
         ▼
飞书审计机器人
```

## 下一步

- [ ] 支持钉钉通道
- [ ] 支持企业微信通道
- [ ] Web 界面配置 IM 推送
- [ ] 推送历史记录查询
