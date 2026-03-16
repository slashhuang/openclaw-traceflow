# claw-family 架构文档

**版本**: 1.0
**最后更新**: 2026-03-15
**定位**: OpenClaw + 飞书的封装项目，提供飞书机器人和自定义 Agent 人设

---

## 一、项目概述

**claw-family** 是基于 [OpenClaw](https://github.com/openclaw/openclaw) 的二次封装项目，核心目标：

1. **飞书集成**：通过飞书机器人提供聊天式 AI 服务
2. **人设定制**：Agent「阿布」是一个 2 岁小女孩，使用中文回复
3. **用户服务**：服务于两个用户 — **jojo**（妈妈，喜欢金融炒股）和 **slashhuang**（爸爸，程序员）
4. **技能扩展**：通过 Skills 机制扩展股票监控、交易简报等功能

---

## 二、系统架构

### 2.1 整体架构图

```
┌─────────────────────────────────────────────────────────────────────┐
│                          claw-family                                 │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                        用户层                                   │ │
│  │         jojo (妈妈)              │        slashhuang (爸爸)       │ │
│  └────────────────────────┼───────────────────────────────────────┘ │
│                           │ 飞书消息                                  │
│  ┌────────────────────────▼───────────────────────────────────────┐ │
│  │                    通道层：Feishu Plugin                         │ │
│  │   Accounts: test (dev)  │  jojo/slashhuang (prod)              │ │
│  └────────────────────────┼───────────────────────────────────────┘ │
│                           │                                         │
│  ┌────────────────────────▼───────────────────────────────────────┐ │
│  │                 Gateway 层：OpenClaw Gateway                     │ │
│  │   Port: 18789 (default)                                        │ │
│  │   Config: openClawRuntime/openclaw.generated.json              │ │
│  └────────────────────────┼───────────────────────────────────────┘ │
│                           │                                         │
│  ┌────────────────────────▼───────────────────────────────────────┐ │
│  │                  Agent 层：阿布                                   │ │
│  │   人设：2 岁小女孩，可爱、天真，所有回复使用中文                   │ │
│  │   模型：Qwen3.5-Plus (通义千问)                                 │ │
│  │   Workspace: openClawRuntime/.workspace/                        │ │
│  └────────────────────────┼───────────────────────────────────────┘ │
│                           │                                         │
│  ┌────────────────────────▼───────────────────────────────────────┐ │
│  │                  Skills 层（可插拔）                             │ │
│  │   git-workflow │ smart-trading │ stock-monitor │ self-improving │ │
│  └────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 核心模块

| 模块 | 职责 | 位置 |
|------|------|------|
| **Feishu Channel** | 飞书消息收发、会话管理 | OpenClaw 插件 `@openclaw/feishu` |
| **Gateway** | 消息路由、Agent 调度、技能加载 | OpenClaw 核心 |
| **Agent 阿布** | 用户交互、任务执行 | `config/openclaw.partial.json` 定义 |
| **Skills** | 功能扩展（股票监控、PR 工作流等） | `skills/` 目录 |
| **Hooks** | 启动钩子、工作区初始化 | `hooks/` 目录 |

---

## 三、目录结构

```
claw-family/
├── config/                          # 配置文件
│   ├── openclaw.partial.json        # 主配置（模型、Gateway、Agent）
│   ├── openclaw.env.json            # 固定环境变量（路径、端口等）
│   └── README.md                    # 配置说明
│
├── bot.dev.json                     # 飞书开发账号（test）
├── bot.prod.json                    # 飞书生产账号（jojo, slashhuang）
├── bot.local.json                   # 飞书本地账号（可选）
│
├── docs/                            # 文档
│   ├── ARCHITECTURE.md              # 本文档
│   ├── prd-bootstrap.md             # 启动方式规格
│   ├── prd-workflow-*.md            # 功能 PRD
│   └── ...
│
├── scripts/                         # 启动脚本
│   ├── start-openclaw.sh            # 主启动脚本（--env dev/prod）
│   ├── ensure-openclaw-runtime.sh   # 生成运行时配置
│   ├── bootstrap.sh                 # 生产入口（PM2 + 代码同步）
│   ├── check-skill-commands.js      # 检查 Skill 依赖
│   └── install-skill-deps.sh        # 安装 Skill 依赖
│
├── skills/                          # 技能目录（可插拔）
│   ├── git-workflow/                # Git 工作流与 PR 自动化
│   ├── smart-trading-assistant/     # 智能交易简报（jojo）
│   ├── stock-assistant/             # 股票监控助手（Python）
│   ├── self-improving-agent/        # 自我学习与改进
│   ├── code-sync/                   # 代码同步
│   └── inspiration-hub/             # 灵感中心
│
├── hooks/                           # 钩子目录
│   └── agent-workspace-defaults/    # 工作区默认值初始化
│
├── workspace-defaults/              # Workspace 模板
│   ├── BOOT.md                      # 启动说明
│   ├── IDENTITY.md                  # 阿布人设
│   ├── USER.md                      # 用户说明
│   ├── SOUL.md                      # 核心原则
│   └── AGENTS.md                    # Agent 配置
│
├── openClawRuntime/                 # 运行时目录（.gitignore）
│   ├── openclaw.generated.json      # 运行时配置（脚本生成）
│   ├── .workspace/                  # 实际工作区
│   └── .clawStates/                 # 运行时状态
│
├── ecosystem.config.cjs             # PM2 配置
├── package.json                     # 项目元信息
└── CLAUDE.md                        # 开发约束
```

---

## 四、配置体系

### 4.1 配置文件

| 文件 | 用途 | 编辑方式 |
|------|------|----------|
| `config/openclaw.partial.json` | 主配置：模型、Gateway、Agents、Hooks | 手动编辑 |
| `config/openclaw.env.json` | 固定环境变量：路径、VERBOSE 等 | 手动编辑 |
| `bot.dev.json` | 飞书开发账号凭证 | 手动编辑（不提交） |
| `bot.prod.json` | 飞书生产账号凭证 | 手动编辑（不提交） |
| `openClawRuntime/openclaw.generated.json` | 最终运行时配置 | 脚本生成 |

### 4.2 配置合并逻辑

```
┌─────────────────────┐
│ openclaw.partial.json │  (主配置：模型、Gateway、Agents)
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│   bot.dev.json      │  (根据 --env 选择)
│   或 bot.prod.json   │
└──────────┬──────────┘
           │ merge: channels.feishu
           ▼
┌─────────────────────┐
│  注入 skills 路径     │  (skills.load.extraDirs)
│  注入 workspace 路径  │  (agents.defaults.workspace)
│  注入 hooks 路径     │  (hooks.internal.load.extraDirs)
└──────────┬──────────┘
           │
           ▼
┌─────────────────────────────────┐
│ openClawRuntime/                │
│ openclaw.generated.json         │  (最终运行时配置)
└─────────────────────────────────┘
```

### 4.3 环境隔离

| 环境 | 启动命令 | Bot 文件 | 飞书账号 | 用途 |
|------|----------|----------|----------|------|
| **dev** | `./scripts/start-openclaw.sh --env dev` | `bot.dev.json` | test | 本地开发调试 |
| **prod** | `./bootstrap.sh` | `bot.prod.json` | jojo, slashhuang | 生产部署 |

---

## 五、启动流程

### 5.1 本地开发

```bash
cd /path/to/claw-family
./scripts/start-openclaw.sh --env dev
```

**执行流程**：

1. 解析 `--env dev` 参数
2. 加载 `config/openclaw.env.json`（固定环境变量）
3. 选择 `bot.dev.json`（飞书开发账号）
4. 调用 `ensure-openclaw-runtime.sh` 生成 `openClawRuntime/openclaw.generated.json`
5. 从 `workspace-defaults/` 覆盖文件到 `openClawRuntime/.workspace/`：
   - `BOOT.md`：由 `start-openclaw.sh` 直接复制
   - `AGENTS.md`、`SOUL.md`、`USER.md`、`TOOLS.md`、`HEARTBEAT.md`、`IDENTITY.md`：由 `agent-workspace-defaults` hook 在运行时注入（不复制文件，直接注入内容）
6. 停止旧 Gateway 进程（避免端口占用）
7. 启动 `openclaw gateway run --verbose`

### 5.2 生产部署

```bash
cd /path/to/claw-family
./bootstrap.sh
```

**执行流程**：

1. 解析环境（默认 production）
2. `git pull --ff-only` 同步代码
3. 安装 Python 依赖（`skills/*/requirements.txt`）
4. 重启旧 PM2 进程（使用新依赖）
5. `pm2 start ecosystem.config.cjs --env production`
6. PM2 执行 `./scripts/start-openclaw.sh`（不传参，默认 prod）

### 5.3 调用链（生产环境）

```
用户执行：./bootstrap.sh
              │
              ▼
        bootstrap.sh
        - git pull
        - 安装依赖
        - pm2 start ecosystem.config.cjs --env production
              │
              ▼
        ecosystem.config.cjs
        script: ./scripts/start-openclaw.sh (无参数 → 默认 prod)
              │
              ▼
        start-openclaw.sh
        - 生成 openclaw.generated.json
        - openclaw gateway run
```

---

## 六、核心模块详解

### 6.1 Agent 阿布

**位置**: `config/openclaw.partial.json` → `agents.list[]`

```json
{
  "id": "main",
  "identity": {
    "name": "阿布",
    "theme": "2 岁小女孩，可爱、天真、爱帮忙",
    "emoji": "👧"
  }
}
```

**人设文件**: `workspace-defaults/IDENTITY.md`（启动时同步到 workspace）

### 6.2 模型配置

**主模型**: Qwen3.5-Plus（通义千问），通过 Bailian 平台调用

```json
{
  "models": {
    "providers": {
      "bailian": {
        "baseUrl": "https://coding.dashscope.aliyuncs.com/v1",
        "apiKey": "sk-sp-xxx",
        "models": [
          { "id": "qwen3.5-plus", "name": "qwen3.5-plus", ... }
        ]
      }
    }
  }
}
```

### 6.3 Skills

**加载机制**: 启动时通过 `skills.load.extraDirs` 注入 `skills/` 目录

| Skill | 功能 | 技术栈 |
|-------|------|--------|
| `git-workflow` | Git 分支管理、PR 自动化 | TypeScript |
| `smart-trading-assistant` | 交易简报生成（jojo） | TypeScript |
| `stock-assistant` | 股票监控助手 | Python |
| `self-improving-agent` | 自我学习与改进 | TypeScript |

### 6.4 Hooks

**位置**: `hooks/`

- **`agent-workspace-defaults`**: 监听 `agent:bootstrap` 事件，从 `workspace-defaults/` 读取 `AGENTS.md`、`SOUL.md`、`USER.md`、`TOOLS.md`、`HEARTBEAT.md`、`IDENTITY.md` 的内容，注入到 `ctx.bootstrapFiles`。
  - **不处理**: `BOOT.md`、`README.md`（由脚本处理）、`MEMORY.md`（保持 OpenClaw 原有行为）
  - **去重逻辑**: 同名文件以 `workspace-defaults/` 为准，确保 system prompt 中不重复注入
  - **代码实现**: `hooks/agent-workspace-defaults/handler.js`

---

## 七、数据流

### 7.1 消息处理流程

```
飞书用户消息
      │
      ▼
Feishu Channel (WebSocket)
      │
      ▼
Gateway 鉴权与路由
      │
      ▼
Agent 阿布（加载人设）
      │
      ├── 直接回复（闲聊）
      │
      └── 技能调用
            │
            ▼
        Skills 执行
            │
            ▼
        结果返回 Agent
            │
            ▼
        格式化回复
            │
            ▼
      Feishu Channel 发送
```

### 7.2 配置数据流

```
启动命令 (--env)
      │
      ▼
选择 Bot 文件 (dev/prod)
      │
      ▼
合并 partial.json + bot.json
      │
      ▼
注入 paths (skills, workspace, hooks)
      │
      ▼
输出 openclaw.generated.json
      │
      ▼
Gateway 加载配置
```

---

## 八、部署与运维

### 8.1 部署清单

**前置条件**:
- Node.js >= 22
- Python 3.x（用于 Python Skills）
- jq（配置合并）
- PM2（生产环境）
- OpenClaw 全局安装：`npm install -g openclaw`

**部署步骤**:

```bash
# 1. 克隆仓库
git clone <repo-url> claw-family
cd claw-family

# 2. 安装依赖
npm install && npm run prepare

# 3. 全局安装 OpenClaw 和飞书插件
npm install -g openclaw
openclaw plugins install @openclaw/feishu

# 4. 配置飞书凭证
# 编辑 bot.prod.json，填入 appId 和 appSecret

# 5. 生产启动
./bootstrap.sh
```

### 8.2 运维命令

| 操作 | 命令 |
|------|------|
| 查看状态 | `pm2 status` |
| 查看日志 | `pm2 logs claw-gateway --lines 200` |
| 重启服务 | `pm2 restart claw-gateway` |
| 停止服务 | `pm2 stop claw-gateway` |
| 删除服务 | `pm2 delete claw-gateway` |

### 8.3 更新流程

```bash
# 1. 拉取最新代码
git pull

# 2. 重启服务（自动重新生成配置）
pm2 restart claw-gateway
```

---

## 九、安全与最佳实践

### 9.1 凭证管理

- 飞书凭证（`appId`、`appSecret`）不提交到 Git
- 仅提交 example 模板：`bot.prod.json.example`
- 生产环境建议通过环境变量或密钥管理服务注入

### 9.2 目录权限

- `openClawRuntime/` 为运行时生成，已加入 `.gitignore`
- 不要手动修改 `openClawRuntime/` 内的文件
- **Workspace 目录（`.workspace/`）性质**：
  - 这是 OpenClaw 的状态/缓存目录
  - 其中的文件（如 `AGENTS.md`、`SOUL.md`）由 `agent-workspace-defaults` hook 在运行时从 `workspace-defaults/` 注入
  - **`.workspace/` 下的文件内容不影响实际运行** — hook 直接从 `workspace-defaults/` 读取并注入
  - 不需要手动同步 `.workspace/` 与 `workspace-defaults/` 的内容

### 9.3 代码变更

- 所有代码变更必须通过 **git worktree + PR** 流程
- 禁止在主分支直接修改
- 由 `git-workflow` Skill 和 `BOOT.md` 约束行为

---

## 十、故障排查

| 问题 | 可能原因 | 排查方法 |
|------|----------|----------|
| Gateway 无法启动 | 端口占用 | `lsof -i :18789` 检查端口 |
| Skills 未加载 | 路径不对 | 检查 `openclaw.generated.json` 中 `skills.load.extraDirs` |
| 飞书收不到消息 | 凭证错误 | 检查 `bot.prod.json` 的 `appId`/`appSecret` |
| 模型调用失败 | API Key 无效 | 检查 `openclaw.partial.json` 中的 `apiKey` |
| Python Skill 报错 | 依赖缺失 | 执行 `npm run prepare` 或 `./scripts/install-skill-deps.sh` |

---

## 附录

### A. 相关文档

- [启动方式规格](prd-bootstrap.md)
- [配置说明](../config/README.md)
- [开发约束](../CLAUDE.md)
- [OpenClaw 官方文档](https://github.com/openclaw/openclaw)

### B. 关键路径

```
项目根目录：/Users/huangxiaogang/claw-sources/claw-family
运行时目录：/Users/huangxiaogang/claw-sources/claw-family/openClawRuntime/
Workspace:   /Users/huangxiaogang/claw-sources/claw-family/openClawRuntime/.workspace/
配置路径：   /Users/huangxiaogang/claw-sources/claw-family/openClawRuntime/openclaw.generated.json
```

### C. 端口分配

| 服务 | 默认端口 | 说明 |
|------|----------|------|
| Gateway | 18789 | OpenClaw 默认 |
| Browser Control | 18791 | Gateway + 2 |
| Browser Relay | 18792 | Gateway + 3 |
