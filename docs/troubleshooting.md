# 故障排查与已知问题

本文档记录 claw-family 使用中的已知问题与应对方式。

---

## 快速诊断流程

```
 Gateway 无法启动？
 ├─ 检查端口占用：lsof -i :18789
 ├─ 检查配置文件：cat openClawRuntime/openclaw.generated.json
 └─ 查看详细日志：pm2 logs claw-gateway --lines 200

 飞书无响应？
 ├─ 检查凭证：bot.prod.json 的 appId/appSecret
 ├─ 检查连接模式：channels.feishu.connectionMode
 └─ 发送测试消息，观察日志

 模型调用失败？
 ├─ 检查 API Key：models.providers[*].apiKey
 ├─ 检查 baseUrl 是否可达
 └─ 查看是否有余额不足
```

---

## Gateway 无法启动

### 现象

执行 `./bootstrap.sh` 或 `./scripts/start-openclaw.sh` 后，Gateway 无法启动。

### 排查步骤

**1. 检查端口占用**

```bash
lsof -i :18789
# 或
netstat -nlp | grep 18789
```

若端口被占用，停止旧进程：

```bash
pm2 stop claw-gateway
# 或
kill -9 <PID>
```

**2. 检查配置文件**

```bash
# 确认运行时配置已生成
ls -la openClawRuntime/openclaw.generated.json

# 检查配置内容
cat openClawRuntime/openclaw.generated.json | jq '.agents.defaults.model.primary'
```

**3. 查看详细日志**

```bash
# PM2 方式
pm2 logs claw-gateway --lines 200

# 直接启动方式
./scripts/start-openclaw.sh --env dev
```

**4. 检查 openclaw 是否安装**

```bash
which openclaw
openclaw --version
```

若未安装：

```bash
npm install -g openclaw
```

---

## 飞书无响应

### 现象

在飞书中给机器人发消息，但没有收到回复。

### 排查步骤

**1. 检查日志**

```bash
pm2 logs claw-gateway --lines 100
```

观察是否有 `[feishu]` 开头的日志：
- 有 `received message` 但无回复 → 模型/Agent 问题
- 完全无 `[feishu]` 日志 → 飞书连接问题

**2. 检查飞书凭证**

```bash
cat bot.prod.json | jq '.feishu.accounts'
```

确认 `appId` 和 `appSecret` 已正确配置。

**3. 检查连接模式**

```bash
cat openClawRuntime/openclaw.generated.json | jq '.channels.feishu.connectionMode'
```

应为 `"websocket"`。

**4. 发送测试消息**

在飞书中给机器人发一条消息，观察日志是否有：

```
[feishu] feishu[xxx]: received message from ou_xxx in oc_xxx (p2p)
```

---

## 飞书：`open_id cross app` 报错

### 现象

飞书报错：`msg: 'open_id cross app'`。

### 原因

飞书中 **open_id 按应用（app）隔离**。本项目配置了多个飞书账号，若消息路由到错误的账号会导致此问题。

### 解决方案

- **defaultAccount 设置为主要账号**：当前配置为 `slashhuang`
- 如需支持多账号，使用 **bindings 按 peer（open_id/chat_id）路由**

相关配置：

```json
{
  "channels": {
    "feishu": {
      "defaultAccount": "slashhuang"
    }
  }
}
```

---

## 飞书：私聊有 dispatch 但无回复（replies=0）

### 现象

```
[feishu] dispatching to agent (session=agent:main:main)
[feishu] dispatch complete (queuedFinal=false, replies=0)
```

### 可能原因

1. **Agent/模型未返回**：模型 API 调用失败
2. **上游已知问题**：OpenClaw 2026.3.2 存在 [Feishu DM 回复回归](https://github.com/openclaw/openclaw/issues/32953)

### 排查步骤

1. 检查模型配置和 API Key
2. 关注 OpenClaw 上游 issue 修复进展

---

## 模型调用失败

### 现象

日志中出现模型相关错误，如 `401 Unauthorized`、`429 Too Many Requests` 等。

### 排查步骤

**1. 检查 API Key**

```bash
cat openClawRuntime/openclaw.generated.json | jq '.models.providers'
```

**2. 检查余额**

登录对应的模型提供商控制台（如阿里云百炼），确认账户余额充足。

**3. 测试 API 连通性**

```bash
curl -X POST "https://coding.dashscope.aliyuncs.com/v1/chat/completions" \
  -H "Authorization: Bearer sk-sp-xxx" \
  -H "Content-Type: application/json" \
  -d '{"model":"qwen3.5-plus","messages":[{"role":"user","content":"test"}]}'
```

---

## Browser 配置错误

### 现象

启动时报错：

```
Invalid config:
- browser: Unrecognized keys: "userDataDir", "args"
```

### 原因

OpenClaw 的 `browser` 配置**不支持** `userDataDir` 和 `args` 选项。

### 解决方案

修改 `config/openclaw.partial.json`：

```json
{
  "browser": {
    "enabled": true
  }
}
```

> **注意**：`executablePath` 会由启动脚本根据操作系统自动检测并注入，无需手动配置。
> - **macOS**: `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`
> - **Linux**: `/usr/bin/google-chrome-stable` 或 `/usr/bin/google-chrome`

---

## 网关日志显示 `agent model: anthropic/claude-opus-4-6`

### 现象

启动日志显示：

```
[gateway] agent model: anthropic/claude-opus-4-6
```

但配置的主模型是 `bailian/qwen3.5-plus`。

### 原因

这是 **OpenClaw 上游的已知行为**：日志显示的是默认占位符，不代表实际使用的模型。

**实际模型**以 `openClawRuntime/openclaw.generated.json` 中的 `agents.defaults.model.primary` 为准。

---

## PM2 相关

### 查看进程状态

```bash
pm2 status
```

### 查看日志

```bash
pm2 logs claw-gateway --lines 100
pm2 logs stock-assistant --lines 100
```

### 重启服务

```bash
pm2 restart claw-gateway
pm2 restart stock-assistant
```

### 清理旧进程

```bash
pm2 delete all
pm2 start ecosystem.config.cjs --env production
```

---

## 依赖问题

### Python Skill 报错

```bash
# 重新安装 Python 依赖
npm run prepare

# 或手动安装
pip3 install -r skills/stock-assistant/requirements.txt
```

### Node.js 依赖

```bash
# 清理并重新安装
rm -rf node_modules
npm install
```

---

## 已知问题汇总

| 问题 | 状态 | 相关链接 |
|------|------|----------|
| 飞书 `open_id cross app` | 部分缓解 | [openclaw#16354](https://github.com/openclaw/openclaw/issues/16354) |
| 飞书私聊无回复 | 上游问题 | [openclaw#32953](https://github.com/openclaw/openclaw/issues/32953) |
| Gateway 日志显示错误模型 | 上游问题 | [openclaw#13396](https://github.com/openclaw/openclaw/issues/13396) |
| Browser 不支持 userDataDir | 设计如此 | - |

---

## 相关文档

- [docs/ARCHITECTURE.md](ARCHITECTURE.md) - 系统架构
- [config/README.md](../config/README.md) - 配置说明
- [docs/prd-bootstrap.md](prd-bootstrap.md) - 启动方式
