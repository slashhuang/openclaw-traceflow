# claw-family 项目说明（CLAUDE）

本仓库为 **OpenClaw + 飞书** 的封装（wrapper），提供飞书机器人与阿布人设。架构与启动方式以 **docs/prd-bootstrap.md** 为准。

## 必读

- **架构约束**：见 `.cursor/rules/architecture.mdc`（运行时在 `openClawRuntime/`，环境由 `--env dev`/`prod` 指定，不用 `.env`）。
- **启动**：本地 `./scripts/start-openclaw.sh --env dev`；生产 `./bootstrap.sh`（详见 prd-bootstrap.md §3）。
- **可改**：`config/openclaw.partial.json`、`scripts/`、`skills/`、`workspace-defaults/`、`docs/`、`hooks/`。
- **不可改**：`openClawRuntime/`、`.env` 等 .gitignore 路径。

## 核心原则

- **先 PRD 后实现**：功能类变更先写 PRD（`docs/prd-*.md`），再按 PRD 实施。
- **实施过程中同步更新 PRD**：如果实现时调整了方案，提交前必须把 PRD 更新到与代码一致。
- **最终以代码为准**：PRD 是设计蓝图，但代码是最终事实。提交时若 PRD 与代码不一致，以代码为准更新 PRD。
- **不要靠脑子记**：重要的事写进文件（CLAUDE.md、MEMORY.md、对应文档），会话会重启，脑子会清空。
- **OpenClaw 修改必读源码**：涉及 OpenClaw 的修改，必须先查阅 `/openclaw/src/` 源码确认机制，不能靠猜测。核心模块：
  - 工具系统：`src/agents/tools/`（web-search.ts、browser/、fs/、exec/）
  - 配置 Schema：`src/config/types.tools.ts`、`src/config/schema.help.ts`
  - Gateway：`src/gateway/`
  - Agent 核心：`src/agents/`

## 重要架构说明

- **workspace-defaults/ 是单一事实来源**：`workspace-defaults/` 下的文件（`AGENTS.md`、`SOUL.md`、`USER.md`、`TOOLS.md`、`HEARTBEAT.md`、`IDENTITY.md`）是 agent system prompt 的源头。
- **`.workspace/` 是状态目录**：`openClawRuntime/.workspace/` 下的同名文件只是 OpenClaw 的状态/缓存，**不需要**与 `workspace-defaults/` 保持一致。
- **注入机制**：`agent-workspace-defaults` hook 在每次 `agent:bootstrap` 时从 `workspace-defaults/` 读取内容，注入到 `ctx.bootstrapFiles`，这才是 agent 实际收到的 system prompt。
- **BOOT.md 特殊处理**：由 `start-openclaw.sh` 复制到 `.workspace/`，因为 hook 不处理它。

## 配置

- 主配置：`config/openclaw.partial.json`；飞书账号：`bot.dev.json` / `bot.prod.json`。
- 运行时配置由脚本生成：`openClawRuntime/openclaw.generated.json`。详见 `config/README.md`。

## 实施与变更

功能/结构类变更需先有 PRD（`docs/prd-*.md`），再按 PRD 改代码。实施 prd-bootstrap 后已同步 architecture.mdc、config/README.md 与本文件。

---

## 快速参考

### 常用命令

```bash
# 本地开发
./scripts/start-openclaw.sh --env dev

# 生产部署
./bootstrap.sh

# 查看 PM2 状态
pm2 status

# 查看日志
pm2 logs claw-gateway --lines 100

# 重启服务
pm2 restart claw-gateway
```

### npm scripts

```bash
npm run dev    # 本地开发
npm run prod   # 生产部署
npm run prepare  # 安装依赖
```

### 环境映射

| 命令 | OPENCLAW_ENV | PM2 环境 | Bot 文件 |
|------|--------------|----------|----------|
| `npm run dev` | dev | dev | bot.dev.json |
| `npm run prod` | production | production | bot.prod.json |
| `./bootstrap.sh --env dev` | dev | dev | bot.dev.json |
| `./bootstrap.sh` | production | production | bot.prod.json |

---

## 开发约束

### 代码修改

1. **必须使用 git worktree**：禁止在 main 分支直接修改
2. **必须创建 PR**：所有改动需经过 Pull Request 合并
3. **先 PRD 后实现**：功能类变更先写 `docs/prd-*.md`

### 分支命名

```
feat/<功能名>       # 新功能
fix/<问题名>        # Bug 修复
docs/<主题名>       # 文档更新
chore/<任务名>      # 配置/工具变更
refactor/<模块名>   # 重构
```

### 提交规范

```
<type>: <description>

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```

---

## 故障排查速查

| 问题 | 检查项 |
|------|--------|
| Gateway 无法启动 | 端口占用：`lsof -i :18789` |
| Skills 未加载 | 检查 `openclaw.generated.json` 中 `skills.load.extraDirs` |
| 飞书无响应 | 检查 `bot.prod.json` 的 `appId`/`appSecret` |
| 模型调用失败 | 检查 `openclaw.partial.json` 中的 `apiKey` |
| Browser 配置错误 | 不支持 `userDataDir`、`args` 选项 |

详细排查见 [docs/troubleshooting.md](docs/troubleshooting.md)。

---

## 文档索引

| 文档 | 用途 |
|------|------|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 系统架构、数据流 |
| [docs/prd-bootstrap.md](docs/prd-bootstrap.md) | 启动方式规格 |
| [config/README.md](config/README.md) | 配置说明 |
| [docs/troubleshooting.md](docs/troubleshooting.md) | 故障排查 |
| [docs/PR-WORKFLOW.md](docs/PR-WORKFLOW.md) | PR 开发流程 |

---

## 用户与 Agent

| 角色 | 飞书账号 | 说明 |
|------|----------|------|
| 阿布 | - | Agent，2 岁小女孩人设，中文回复 |
| jojo | 妈妈 | 喜欢金融炒股、关注金价 |
| slashhuang | 爸爸 | 程序员，关注 AI 前沿 |

---

## 技能列表

| Skill | 语言 | 功能 |
|-------|------|------|
| `git-workflow` | TS | Git 分支管理、PR 自动化 |
| `smart-trading-assistant` | TS | 交易简报生成 |
| `stock-assistant` | Python | 股票监控助手 |
| `self-improving-agent` | TS | 自我学习与改进 |
| `code-sync` | TS | 代码同步 |
| `inspiration-hub` | TS | 灵感中心 |
