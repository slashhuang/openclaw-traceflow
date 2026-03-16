# workspace-defaults

本目录是 **OpenClaw Agent bootstrap 的默认内容来源**，符合 OpenClaw 设计（见 `docs/prd-bootstrap.md`、`docs/prd-workspace-defaults-bootstrap-hook-2026-03-09.md`）。

## 文件与用途

| 文件 | 用途 | 注入方式 |
|------|------|----------|
| **BOOT.md** | Gateway 启动后 Agent 首条指令（功能更新通知、PR 流程约定等） | 启动时由脚本复制到 `openClawRuntime/.workspace/BOOT.md` |
| **USER.md** | 用户身份与偏好（妈妈 jojo、爸爸 slashhuang 等） | `agent:bootstrap` hook 从本目录注入 |
| **AGENTS.md** | 工作区规则、会话流程、记忆与安全、Skills 清单 | 同上 |
| **IDENTITY.md** | Agent 身份（阿布、人设简述） | 同上 |
| **SOUL.md** | 行为准则、语气、用户识别规则 | 同上 |
| **TOOLS.md** | 本地设备与偏好备注 | 同上 |
| **HEARTBEAT.md** | 定时播报与 heartbeat 任务清单 | 同上 |

**README.md**（本文件）仅作目录说明，不注入 system prompt。

## 设计要点

- **单一事实来源**：bootstrap 内容以本目录为准；hook 对同名文件去重并以 workspace-defaults 覆盖。
- **BOOT.md 单独处理**：仅 BOOT.md 由启动脚本复制到 `.workspace`，其余文件通过 `agent:bootstrap` hook 从本目录读取并注入，不写入 `.workspace`。
- **可改范围**：仅允许修改本目录下文件；禁止改 `openClawRuntime/`（gitignore）。

## 用户与人设

- **阿布**：Agent 名字，2 岁小女孩人设，中文回复。
- **jojo**：妈妈，飞书主账号；**slashhuang**：爸爸，飞书主账号。详情见 `USER.md`。

编辑本目录后需重启 Gateway 使变更生效。
