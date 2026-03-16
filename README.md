# claw-family

**claw-family** 是 [OpenClaw](https://github.com/openclaw/openclaw) 的封装项目，提供飞书机器人集成和自定义 Agent 人设。

Agent「**阿布**」是一个 2 岁小女孩 persona，使用中文回复，服务于两个用户：**jojo**（妈妈，喜欢金融炒股）和 **slashhuang**（爸爸，程序员）。

## 快速开始

### 前置条件

```bash
# 全局安装 OpenClaw
npm install -g openclaw

# 安装飞书插件
openclaw plugins install @openclaw/feishu
```

### 一键启动

```bash
# 本地开发
npm run dev

# 生产部署
npm run prod
```

详细文档：
- **架构说明**：[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- **配置说明**：[config/README.md](config/README.md)
- **故障排查**：[docs/troubleshooting.md](docs/troubleshooting.md)

---

## 文档索引

| 文档 | 用途 | 目标读者 |
|------|------|----------|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 系统架构、数据流、部署运维 | 新成员、运维 |
| [config/README.md](config/README.md) | 配置体系、合并逻辑 | 开发者 |
| [docs/troubleshooting.md](docs/troubleshooting.md) | 故障排查、已知问题 | 运维 |
| [CLAUDE.md](CLAUDE.md) | 开发约束、快速参考 | 维护者 |
| [docs/PR-WORKFLOW.md](docs/PR-WORKFLOW.md) | PR 驱动开发流程 | 开发者 |

---

## 核心功能

### 飞书机器人

- 支持多账号（开发/生产隔离）
- WebSocket 长连接，实时响应
- 私聊/群聊消息处理

### Agent 阿布

- 人设：2 岁小女孩，可爱、天真
- 语言：所有回复使用中文
- 用户：jojo（妈妈）、slashhuang（爸爸）

### Skills（可扩展）

| Skill | 功能 |
|-------|------|
| `git-workflow` | Git 分支管理、PR 自动化 |
| `smart-trading-assistant` | 交易简报生成 |
| `stock-assistant` | 股票监控（Python） |
| `self-improving-agent` | 自我学习与改进 |

---

## 部署与运维

### 服务器部署

```bash
# 1. 克隆仓库
git clone <repo-url> claw-family
cd claw-family

# 2. 安装依赖
npm install && npm run prepare

# 3. 全局安装 OpenClaw 与飞书插件
npm install -g openclaw
openclaw plugins install @openclaw/feishu

# 4. 生产启动
./bootstrap.sh
```

### 运维速查

| 操作 | 命令 |
|------|------|
| 查看状态 | `pm2 status` |
| 查看日志 | `pm2 logs claw-gateway --lines 200` |
| 重启服务 | `pm2 restart claw-gateway` |
| 停止服务 | `pm2 stop claw-gateway` |

代码或配置变更后：在服务器上 `git pull`，再 `pm2 restart claw-gateway`。

---

## 环境配置

- **环境由 `--env` 指定**：不用 `.env`
- **本地开发**：`./scripts/start-openclaw.sh --env dev`
- **生产部署**：`./bootstrap.sh`（默认 prod）

| 环境 | Bot 文件 | 飞书账号 |
|------|----------|----------|
| dev | `bot.dev.json` | test |
| prod | `bot.prod.json` | jojo, slashhuang |

详细启动说明见 [docs/prd-bootstrap.md](docs/prd-bootstrap.md)。

---

## 开发约束

> **重要**：所有涉及本仓库代码/配置的修改，都必须通过 **git worktree + PR** 流程完成。

详见 [docs/PR-WORKFLOW.md](docs/PR-WORKFLOW.md)。

---

## License

MIT
