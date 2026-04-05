# OpenClaw 路径配置指南

**问题**：访问 `/api/sessions` 返回空或 `/api/states/tree` 报错 `ENOENT: no such file or directory`

**原因**：TraceFlow 无法找到 OpenClaw 的 state 目录

---

## 解决方案

### 方案 1：编辑配置文件（推荐）

编辑 `config/openclaw.runtime.json`：

```json
{
  "openclawStateDir": "/your/path/to/.openclaw/state",
  "openclawWorkspaceDir": "/your/path/to/.openclaw/workspace"
}
```

**示例**（macOS）：
```json
{
  "openclawStateDir": "/Users/your-username/.openclaw/state",
  "openclawWorkspaceDir": "/Users/your-username/.openclaw/workspace"
}
```

**示例**（Linux）：
```json
{
  "openclawStateDir": "/home/your-username/.openclaw/state",
  "openclawWorkspaceDir": "/home/your-username/.openclaw/workspace"
}
```

重启服务：
```bash
pnpm run start:dev
```

### 方案 2：使用环境变量

```bash
export OPENCLAW_STATE_DIR=/your/path/to/.openclaw/state
export OPENCLAW_WORKSPACE_DIR=/your/path/to/.openclaw/workspace

pnpm run start:dev
```

### 方案 3：使用 .env 文件

创建 `.env` 文件：
```bash
OPENCLAW_STATE_DIR=/your/path/to/.openclaw/state
OPENCLAW_WORKSPACE_DIR=/your/path/to/.openclaw/workspace
```

---

## 查找你的 OpenClaw 路径

### macOS
```bash
# 默认路径
ls -la ~/.openclaw/state
ls -la ~/.openclaw/workspace

# 如果不存在，检查 OpenClaw 配置
openclaw config file
```

### Linux
```bash
# 默认路径
ls -la ~/.openclaw/state
ls -la ~/.openclaw/workspace

# 如果不存在，检查 OpenClaw 配置
openclaw config file
```

### Windows
```powershell
# 默认路径
ls $HOME\.openclaw\state
ls $HOME\.openclaw\workspace
```

---

## 验证配置

配置后，访问以下 API 验证：

```bash
# 检查 sessions
curl http://localhost:3001/api/sessions

# 检查 states tree
curl http://localhost:3001/api/states/tree

# 检查健康状态
curl http://localhost:3001/api/health
```

---

## 常见问题

### Q: 我没有 `.openclaw` 目录怎么办？

A: 运行一次 OpenClaw Agent 会自动创建：
```bash
openclaw agent run
```

或者手动创建：
```bash
mkdir -p ~/.openclaw/state
mkdir -p ~/.openclaw/workspace
```

### Q: 我使用了自定义路径怎么办？

A: 在配置文件中指定：
```json
{
  "openclawStateDir": "/custom/path/to/state",
  "openclawWorkspaceDir": "/custom/path/to/workspace"
}
```

### Q: 配置后仍然报错怎么办？

A: 检查：
1. 路径是否正确（`ls /your/path`）
2. 是否有权限访问（`ls -la /your/path`）
3. TraceFlow 是否重启（`pnpm run start:dev`）
4. 查看日志（`tail -f data/traceflow.log`）

---

## 未来改进

计划在设置页面添加路径配置 UI，无需手动编辑配置文件。

---

*本文档为配置指南，具体路径以你的实际环境为准。*
