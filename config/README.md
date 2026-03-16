# OpenClaw 配置说明

## 配置架构

按 **docs/prd-bootstrap.md**：环境由启动命令的 **`--env dev` / `--env prod`** 指定，不用 `.env`。运行时落在 **`openClawRuntime/`**。

| 配置文件 | 用途 | 生成方式 |
|----------|------|----------|
| `openclaw.partial.json` | 主配置（模型、gateway、Agent；飞书由 bot 文件提供） | 手动编辑 |
| `openclaw.env.json`（config/ 或根目录） | 固定环境变量（工作区路径、VERBOSE 等） | 手动编辑 |
| `openClawRuntime/openclaw.generated.json` | 运行时配置（注入 skills、飞书 bot、workspace） | 启动时由脚本生成 |

### 配置合并逻辑

1. 由 **`--env dev` / `--env prod`**（默认 prod）确定 bot 文件：dev → `bot.dev.json`，prod → `bot.prod.json`。
2. 合并 `openclaw.partial.json` + 所选 bot 的飞书 → 注入 `skills.load.extraDirs`、`agents.defaults.workspace`（绝对路径）、`hooks.internal.load.extraDirs`（仓库 `hooks/` 绝对路径）及 hook `agent-workspace-defaults`（含 `workspaceDefaultsPath`，见 **docs/prd-workspace-defaults-bootstrap-hook-2026-03-09.md**）。
3. 输出到 `openClawRuntime/openclaw.generated.json`。

相对路径（如 `.workspace`、`.clawStates`）在 **openClawRuntime** 下解析。

> **注意**：`openClawRuntime/` 已加入 `.gitignore`，不应提交。

---

## 主要配置项

### models.providers

配置 AI 模型提供商和 API 密钥：

```json
{
  "models": {
    "providers": {
      "bailian": {
        "baseUrl": "https://coding.dashscope.aliyuncs.com/v1",
        "apiKey": "sk-sp-xxx",
        "models": [
          { "id": "qwen3.5-plus", "name": "qwen3.5-plus" }
        ]
      }
    }
  }
}
```

### agents

配置 Agent 人设和默认行为：

```json
{
  "agents": {
    "defaults": {
      "model": { "primary": "bailian/qwen3.5-plus" }
    },
    "list": [
      {
        "id": "main",
        "identity": {
          "name": "阿布",
          "theme": "2 岁小女孩，可爱、天真、爱帮忙",
          "emoji": "👧"
        }
      }
    ]
  }
}
```

### channels.feishu

飞书通道配置（由 bot 文件提供）：

```json
{
  "channels": {
    "feishu": {
      "enabled": true,
      "defaultAccount": "slashhuang",
      "connectionMode": "websocket",
      "accounts": {
        "slashhuang": {
          "appId": "cli_xxx",
          "appSecret": "xxx"
        }
      }
    }
  }
}
```

### browser

浏览器控制配置（**跨平台自动检测**）：

```json
{
  "browser": {
    "enabled": true
  }
}
```

> **注意**：`executablePath` 由启动脚本 `scripts/ensure-openclaw-runtime.sh` 根据操作系统自动检测并注入到运行时配置。

**跨平台路径检测**：

| 系统 | 检测路径（按优先级） |
|------|---------------------|
| **macOS** | `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` → `/Applications/Chromium.app/Contents/MacOS/Chromium` |
| **Linux** | `/usr/bin/google-chrome-stable` → `/usr/bin/google-chrome` → `/usr/bin/chromium-browser` → `/usr/bin/chromium` |

**支持的选项**：

| 选项 | 说明 | 默认值 |
|------|------|--------|
| `enabled` | 是否启用浏览器控制 | `true` |
| `executablePath` | Chrome 二进制路径 | **自动检测**（跨平台适配） |
| `headless` | 无头模式 | `false` |
| `attachOnly` | 仅附加已运行的浏览器 | `false` |

> **注意**：不支持 `userDataDir` 和 `args` 选项。浏览器配置文件由 OpenClaw 自动管理。

### gateway

Gateway 配置：

```json
{
  "gateway": {
    "mode": "local",
    "auth": {
      "mode": "token",
      "token": "your-token"
    }
  }
}
```

---

## 启动

- **本地开发**：`./scripts/start-openclaw.sh --env dev`
- **生产**：`./bootstrap.sh`（内部用 PM2 跑 `./scripts/start-openclaw.sh`，不传参即 prod）

启动脚本**默认开启 verbose 日志**；若需关闭可设环境变量 `OPENCLAW_VERBOSE=0` 或 `VERBOSE=0`。详见 **docs/prd-bootstrap.md** §3。

---

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `OPENCLAW_ENV` | 运行环境（dev/prod） | `production` |
| `OPENCLAW_VERBOSE` | 是否输出详细日志 | `1` |
| `OPENCLAW_CONFIG_PATH` | 配置文件路径 | `openClawRuntime/openclaw.generated.json` |
| `OPENCLAW_WORKSPACE_DIR` | Workspace 路径 | `.workspace` |
| `OPENCLAW_STATE_DIR` | State 路径 | `.clawStates` |

---

## 飞书接入

飞书账号由 `bot.dev.json` / `bot.prod.json` 提供，合并时整体替换 partial 的 `channels.feishu`。凭证建议不提交，仅提交 example 模板。

---

## 故障排查

### 配置未生效

检查 `openClawRuntime/openclaw.generated.json` 是否正确生成：

```bash
cat openClawRuntime/openclaw.generated.json | jq '.agents.defaults.model.primary'
```

### Browser 配置错误

如果看到 `Unrecognized keys` 错误，检查是否使用了不支持的选项（如 `userDataDir`、`args`）。

### 模型调用失败

1. 检查 `models.providers` 中的 `apiKey` 是否有效
2. 检查 `baseUrl` 是否可访问
3. 查看 gateway 日志：`pm2 logs claw-gateway`

---

## 相关文档

- [docs/prd-bootstrap.md](../docs/prd-bootstrap.md) - 启动方式规格
- [docs/troubleshooting.md](../docs/troubleshooting.md) - 故障排查
- [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md) - 系统架构
