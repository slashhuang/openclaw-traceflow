# docs — 需求与说明文档

本文件夹存放本仓库（claw-family）的**产品需求（PRD）和说明文档**，用于在动手改代码之前把背景、目标、流程和约定写清楚。

## 定位

- **PRD 驱动**：功能或结构性变更应先有已批准的需求文档，再动手实现
- **与代码/配置分离**：文档放在 `docs/`，便于只读查阅和版本追溯

## 文档类型与命名

| 类型 | 命名规则 | 说明 |
|------|----------|------|
| **产品需求（PRD）** | `prd-<英文主题>-YYYY-MM-DD.md` | 产品级需求 |
| **架构文档** | `ARCHITECTURE.md` | 系统架构、数据流 |
| **故障/已知问题** | `troubleshooting.md` 等 | 已知问题、原因与应对 |
| **技术/约定** | 其它命名 | 非需求类说明 |

完整规范见 [prd-workflow-2025-03-07.md](prd-workflow-2025-03-07.md)。

## 当前文档一览

### 核心文档

| 文档 | 简介 | 优先级 |
|------|------|--------|
| **[prd-bootstrap.md](prd-bootstrap.md)** | 启动方式与配置体系（--env dev/prod、openClawRuntime、bootstrap.sh、bot 文件） | 🔴 必读 |
| **[ARCHITECTURE.md](ARCHITECTURE.md)** | 系统架构、数据流、部署运维 | 🔴 新成员必读 |
| **[troubleshooting.md](troubleshooting.md)** | 故障排查与已知问题 | 🟡 运维参考 |

### 开发规范

| 文档 | 简介 |
|------|------|
| **[prd-workflow-2025-03-07.md](prd-workflow-2025-03-07.md)** | PRD 与需求文档规范 |
| **[PR-WORKFLOW.md](PR-WORKFLOW.md)** | 代码修改操作指南（worktree、分支命名） |
| **[prd-workspace-defaults-bootstrap-hook-2026-03-09.md](...)** | workspace 默认值与 hook 机制 |

### 功能 PRD

| 文档 | 简介 |
|------|------|
| `prd-feishu-github-sync-2025-03-07.md` | 飞书 GitHub 同步 |
| `prd-workflow-2025-03-07.md` | 工作流设计 |
| `prd-auto-merge-pr-2026-03-10.md` | 自动合并 PR |
| `prd-heartbeat-trading-alerts-2026-03-10.md` | 心跳交易提醒 |
| `prd-smart-trading-assistant-2026-03-08.md` | 智能交易助手 |
| `prd-smart-stock-skill-2026-03-11-v3.md` | 股票技能 |

### 技术说明

| 文档 | 简介 |
|------|------|
| **[openclaw-integration.md](openclaw-integration.md)** | OpenClaw 集成说明 |
| **[chrome-extension-browser.md](chrome-extension-browser.md)** | Chrome 浏览器配置 |
| **[prd-futu-opend-indep.md](prd-futu-opend-indep.md)** | 富途 OpenD 独立部署 |

## 相关文档（仓库根目录）

| 文档 | 说明 |
|------|------|
| **[../README.md](../README.md)** | 项目说明：快速开始、文档索引 |
| **[../CLAUDE.md](../CLAUDE.md)** | 开发约束、快速参考 |
| **[../config/README.md](../config/README.md)** | OpenClaw 配置说明 |
