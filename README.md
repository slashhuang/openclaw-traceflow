# 🦞 OpenClaw TraceFlow

[![License](https://img.shields.io/badge/license-MIT-blue)](/LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20.11.0-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-%3E%3D9.0.0-F69220?logo=pnpm&logoColor=white)](https://pnpm.io/)
[![NestJS](https://img.shields.io/badge/NestJS-11-E0234E?logo=nestjs&logoColor=white)](https://nestjs.com/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)](https://vite.dev/)

**让 AI 助手更可观测——OpenClaw 追踪流（进行中）**

> 💡 **为什么需要监控？** 当你的 AI 助手每天处理 100+ 会话时，你需要知道：
> - 🎯 哪个 Skill 被频繁调用？哪个在浪费 Token？
> - ⚠️ 用户的 Token 消耗是否在失控边缘？
> - 🐌 SystemPrompt 是否过于臃肿导致响应变慢？
> 
> OpenClaw TraceFlow 给你**可观测性**，而不是另一个控制面板。
>
> 说明：该项目仍在持续开发中，功能与文档可能会随版本迭代更新。
>
---

## 📋 环境要求

启动前请先确认本机版本，避免依赖安装失败或运行报错：

- Node.js：`>= 20.11.0`（推荐 Node.js 20 LTS）
- pnpm：`>= 9.0.0`（本仓库 lockfile 为 v9）
- PM2（可选）：若使用 PM2 部署

可用以下命令快速检查：

```bash
node -v
pnpm -v
```

若未安装 pnpm，可执行（更常见）：

```bash
npm i -g pnpm
```

> 说明：也可用 Corepack（Node 自带）来启用 pnpm，但这里默认用更常见的全局安装方式，减少陌生概念。

---

## 🛠️ 构建与部署

### 一键部署命令

| 命令 | 说明 |
|------|------|
| `pnpm run build:all` | 构建后端 + 前端全部代码 |
| `pnpm run deploy:pm2` | **一键 PM2 部署（推荐）**：构建 → PM2 启动（带重启保护） |
| `pnpm run release` | 构建并打包成 npm 包 |

### PM2 部署（生产环境，推荐）

```bash
# 一键部署（推荐）
pnpm run deploy:pm2

# 或手动执行
pnpm run build:all
pm2 start dist/main.js --name openclaw-traceflow \
  --restart-delay=3000 \
  --max-restarts=10
```

## 🚀 30 秒快速开始（先部署）

### 方式一：PM2（推荐）

```bash
# 在 openclaw-traceflow 目录下执行
pnpm install
pnpm run deploy:pm2
```

浏览器打开 `http://localhost:3001`

### 方式二：源码运行（开发者）

```bash
# 进入 openclaw-traceflow 目录
cd openclaw-traceflow

# 安装依赖并启动
pnpm install

# 启动
pnpm run start:dev

# 访问 http://localhost:3001
```

---

## ✨ 核心能力

| 能力 | Control-UI | OpenClaw TraceFlow | 优势 |
|------|-----------|------------------|------|
| **Skill 调用追踪** | ❌ | ✅ 基于 read 工具反推 | 告别黑盒，知道哪个 skill 在被使用 |
| **用户维度分析** | ❌ | ✅ 按用户统计 Skill 使用 | 了解每个用户的使用习惯 |
| **Token 预警** | 基础查询 | ✅ 5 级阈值 + 消耗速率排行 | 防患于未然，避免账单失控 |
| **SystemPrompt 优化** | ❌ | ✅ Token 分解 + 优化建议 | 基于分析结果给出建议 |
| **延迟指标** | ❌ | ✅ P50/P95/P99 | 定位性能瓶颈 |
| **部署难度** | 手动配置 | ✅ 源码本地启动（`pnpm install` + `pnpm run start:dev`） | 快速上手 |

---

## 📌 页面概览

| 路由 | 页面功能 |
|------|----------|
| `/` | Dashboard：Gateway 状态 + Token/延迟/工具调用等概览 |
| `/sessions` | Sessions：会话列表（含类型、状态、最近活跃时间） |
| `/sessions/:id` | SessionDetail：会话详情（消息、工具调用、invoked skills 等） |
| `/skills` | Skills：Skill 使用统计（按工具/按用户/usage 分布） |
| `/system-prompt` | SystemPrompt：SystemPrompt 解析、分析与探测 |
| `/tokens` | TokenMonitor：Token 使用排行与告警历史 |
| `/pricing` | Pricing：模型价格配置（支持自定义价格） |
| `/logs` | Logs：实时日志（WebSocket 推送） |
| `/settings` | Settings：Gateway/路径/访问控制配置、重启与清理操作 |

## 📸 界面预览

下面截图用于帮助理解本项目的“布局与数据展示”直观效果（入口以本仓库实际路由为准）：

- `./docs/traceFlowSnapshots/screenshot.png`（总体预览）
- `./docs/traceFlowSnapshots/overview.png`（概览）
- `./docs/traceFlowSnapshots/sessions.png`（会话）
- `./docs/traceFlowSnapshots/limits.png`（限流/阈值）
- `./docs/traceFlowSnapshots/logs.png`（日志）

## 📊 功能亮点

### 1. Skill 调用追踪 — 告别黑盒

**解决的问题：**

| 问题 | 解决方案 |
|------|---------|
| "为什么 SystemPrompt 变慢？" | 定位可能影响较大的 skills（基于分析/统计结果） |
| "哪个 Skill 最常用？" | 按调用频次/触发情况进行统计，便于优化优先级 |
| "有没有僵尸 Skills？" | 30 天未调用标记，一键清理 |

**技术实现：**

```typescript
// src/skill-invocation.ts
// 基于 read 工具调用反推 Skill 触发
export function inferInvokedSkillsFromToolCalls(toolCalls) {
  const counts = new Map();
  for (const tc of toolCalls || []) {
    if (tc.name !== 'read') continue;
    const skill = findSkillPathInArgs(tc.input ?? {});
    if (skill) {
      counts.set(skill, (counts.get(skill) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([skillName, readCount]) => ({ skillName, readCount }))
    .sort((a, b) => b.readCount - a.readCount);
}
```

**输出示例：**

```typescript
[
  { skillName: 'example-skill', readCount: 15 },
  { skillName: 'another-skill', readCount: 8 }
]
```

---

### 2. Token 阈值预警 — 防患于未然

**5 级阈值预警：**

| 级别 | 阈值 | 颜色 | 行动建议 |
|------|------|------|---------|
| 🟢 Normal | <50% | 绿色 | 健康，无需干预 |
| 🟡 Warning | 50-80% | 黄色 | 注意，准备优化 |
| 🟠 Serious | 80-95% | 橙色 | 严重，立即优化 |
| 🔴 Critical | 95-100% | 红色 | 告警，可能触顶 |
| ⚫ Limit | 100% | 黑色 | 触顶，无法继续 |

**告警历史：**

- 页面会定时刷新并展示最新告警记录（默认 30 秒轮询）

---

### 3. SystemPrompt 优化 — 分析与优化建议

**优化建议示例：**

```
当前 SystemPrompt tokens：<number>
预计节省 tokens：<number>（<percent>%）

建议：
- 建议移除（僵尸 skills）
- 建议合并（重复 skills）
```

**一键复制：**

- 完整 SystemPrompt Markdown
- Skills Snapshot 的 prompt（用于注入/复用）

---

### 4. 用户维度分析 — 了解你的用户

按会话数据统计：

- 按用户统计 Skill 使用情况
- 用户堆叠柱状图与交叉分析表（用于比较不同用户/skill 的趋势）
- 会话类型识别（heartbeat/cron/boot/Wave/多平台）

**会话类型识别：**

| 类型 | 说明 |
|------|------|
| heartbeat | 定时心跳会话 |
| cron | 定时任务会话 |
| boot | 启动引导会话 |
| Wave | Wave 用户会话 |
| Slack/Telegram/Discord/飞书 | 各平台用户会话 |

---

## 🏗️ 技术架构

```
┌─────────────────┐      ┌──────────────────┐      ┌─────────────┐
│ OpenClaw Gateway│ ───▶ │  文件系统读取     │ ───▶ │ TraceFlow │
│   (PM2 管理)     │      │  (零侵入)        │      │  (NestJS)   │
└─────────────────┘      └──────────────────┘      └──────┬──────┘
                                                          │
                                                          ▼
                                                 ┌─────────────────┐
                                                 │   Dashboard     │
                                                 │ (React + Vite)  │
                                                 └─────────────────┘
```

**核心优势：**

| 特性 | 说明 |
|------|------|
| **零侵入集成** | 通过文件系统读取会话数据，无需修改 OpenClaw |
| **独立部署** | 不依赖 Gateway 进程，可独立运行 |
| **数据持久化** | `sql.js` 数据统计并定期导出，落盘到 `./data/metrics.db`（用于历史聚合） |
| **实时更新** | WebSocket 推送 + 3 秒自动轮询 |

---

## 📈 谁在用 OpenClaw TraceFlow？

### 👨‍💻 个人开发者

用于监控个人 AI 助手，查看 token 消耗与僵尸/重复 skills 等分析结果，辅助优化配置。

---

### 👥 小团队（3-5 人）

适合团队共享 Gateway 时查看各自的使用情况与分析结果。

---

### 🏢 插件开发者
可以基于 Skill/工具调用统计与系统提示分析结果，辅助迭代与优化。

---

## ⚙️ 配置

### 环境变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `OPENCLAW_GATEWAY_URL` | OpenClaw Gateway 地址 | `http://localhost:18789` |
| `OPENCLAW_GATEWAY_TOKEN` | Gateway 侧鉴权 Token（可选，用于 WS/RPC） | 无 |
| `OPENCLAW_GATEWAY_PASSWORD` | Gateway 侧鉴权 Password（可选，用于 WS/RPC） | 无 |
| `OPENCLAW_STATE_DIR` | OpenClaw state 目录（可选；留空会自动解析） | 自动解析 |
| `OPENCLAW_WORKSPACE_DIR` | 工作目录（可选；留空会自动解析） | 自动解析 |
| `OPENCLAW_LOG_PATH` | OpenClaw 输出日志文件路径（可选；Gateway 不可用时的回退） | 无 |
| `OPENCLAW_CLI` | `openclaw` CLI 可执行文件名（可选，用于写入配置） | `openclaw` |
| `OPENCLAW_RUNTIME_ACCESS_TOKEN` | Dash/API Access Token（仅在 `OPENCLAW_ACCESS_MODE=token` 时用于 `api/setup/*`） | 无 |
| `OPENCLAW_ACCESS_MODE` | 访问模式：`local-only` \| `token` \| `none` | `none` |
| `HOST` | 监听地址 | `0.0.0.0`（支持 IP 访问） |
| `PORT` | 监听端口 | `3001` |
| `DATA_DIR` | 数据目录（metrics/快照等；相对启动目录） | `./data` |

### 价格配置

模型价格用于 Token 页面的费用估算。支持通过配置文件或 API 自定义。

- **默认价格表**：内置 100+ 主流模型价格（Anthropic Claude、OpenAI GPT、Google Gemini、xAI Grok 等）
- **配置文件**：`config/model-pricing.json`（可选，覆盖默认值）
- **示例配置**：`config/model-pricing.example.json`

**价格来源**：基于 2026 年 3 月各厂商官方定价（USD per million tokens）

| 模型系列 | Input | Output | Cache Read | Cache Write |
|----------|-------|--------|------------|-------------|
| Claude Opus 4.6/4.5 | $15 | $75 | $1.875 | $18.75 |
| Claude Sonnet 4.6/4.5 | $3 | $15 | $0.30 | $3.75 |
| Claude Haiku 3.5 | $0.8 | $4.0 | $0.08 | $1.00 |
| GPT-4o | $2.5 | $10 | $0.25 | $2.50 |
| GPT-4o-mini | $0.15 | $0.6 | $0.075 | $0.30 |
| Gemini 2.5 Pro | $1.25 | $10 | $0.31 | $4.50 |
| Gemini 2.5 Flash | $0.15 | $0.6 | $0.04 | $0.15 |
| Grok 4 Fast | $0.2 | $0.5 | $0.05 | $0.20 |

---

## 🔐 安全与鉴权（Access Mode）

后端鉴权目前只保护 `api/setup/*`（用于首次引导/保存配置）。其余读取类 API 暂不做统一拦截。

| 模式 | 行为 |
|------|------|
| `local-only` | 只允许来自本机（`127.0.0.1` / `::1`）的请求，其它来源会被拒绝 |
| `token` | 需要 `Authorization: Bearer <OPENCLAW_RUNTIME_ACCESS_TOKEN>` 才能访问 `api/setup/*` |
| `none` | 不校验，允许所有访问 |

示例（`token` 模式下访问受保护接口）：

```bash
curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:3001/api/setup/status
```

## 📡 API 端点（REST）

| Path | Method | 说明 |
|------|--------|------|
| `/api/health` | `GET` | 服务健康检查 |
| `/api/status` | `GET` | Gateway 状态概览 |
| `/api/sessions` | `GET` | 会话列表 |
| `/api/sessions/:id` | `GET` | 会话详情 |
| `/api/sessions/:id/status` | `GET` | 单个会话状态 |
| `/api/sessions/:id/kill` | `POST` | 终止会话 |
| `/api/sessions/token-usage` | `GET` | 所有会话 token 使用概览 |
| `/api/sessions/:sessionKey/token-usage` | `GET` | 单个 sessionKey token 使用 |
| `/api/sessions/token-alerts/check` | `POST` | 生成/检查 token 告警 |
| `/api/sessions/token-alerts/history` | `GET` | 告警历史 |
| `/api/logs` | `GET` | 最近日志（可选 `?limit=`） |
| `/api/skills/usage` | `GET` | Skills 使用情况 |
| `/api/skills/skill-tool-usage` | `GET` | skill × tool 调用分布 |
| `/api/skills/usage-by-user` | `GET` | skill × 用户 调用分布 |
| `/api/skills/system-prompt/analysis` | `GET` | system prompt 分析 |
| `/api/skills/system-prompt/probe` | `GET` | 通过 Gateway 探测并离线重建 system prompt |
| `/api/pricing` | `GET` | 获取所有模型价格配置 |
| `/api/pricing/config` | `GET` | 获取当前价格配置（含元数据） |
| `/api/pricing/config` | `POST` | 更新价格配置 |
| `/api/pricing/model/:name` | `POST` | 更新单个模型价格 |
| `/api/pricing/model/:name` | `DELETE` | 删除模型价格 |
| `/api/pricing/reset` | `POST` | 重置为默认配置 |
| `/api/metrics/latency` | `GET` | P50/P95/P99 延迟（可选 `?timeRangeMs=`） |
| `/api/metrics/tools` | `GET` | 工具调用 Top 8（可选 `?timeRangeMs=`） |
| `/api/metrics/concurrency` | `GET` | 并发指标（当前为占位数据） |
| `/api/metrics/session-keys` | `GET` | sessionKey 统计（当前为占位数据） |
| `/api/metrics/token-summary` | `GET` | token 汇总（进行中/归档） |
| `/api/metrics/token-usage` | `GET` | token 用量排行（按 sessionKey，Top） |
| `/api/metrics/token-usage-by-session-key` | `GET` | 汇总 token（含归档拆分） |
| `/api/metrics/archive-count-by-session-key` | `GET` | sessionKey 归档次数 |
| `/api/metrics/subagents` | `GET` | 子 Agent 统计（当前为占位数据） |
| `/api/actions/restart` | `POST` | 重启 Gateway |
| `/api/actions/kill-session/:id` | `POST` | 终止会话 |
| `/api/actions/update-concurrency` | `POST` | 更新并发限制（body: `maxConcurrent`） |
| `/api/actions/cleanup-logs` | `POST` | 清理日志 |
| `/api/setup/status` | `GET` | 首次引导配置状态（受保护） |
| `/api/setup/test-connection` | `POST` | 测试并保存 Gateway 连接（受保护） |
| `/api/setup/configure` | `POST` | 更新配置（受保护） |
| `/api/setup/generate-token` | `GET` | 生成随机 `OPENCLAW_RUNTIME_ACCESS_TOKEN`（受保护） |

## 📺 WebSocket（日志流）

Socket.IO 命名空间：`logs`

- `logs:subscribe`：订阅日志流（payload: `{ limit?: number }` 可选）
- `logs:unsubscribe`：取消订阅
- `logs:new`：服务端推送新日志条目（`timestamp/level/content`）

## 🧰 常见故障排查

- Gateway 不可用/页面显示错误：
  - 检查 `OPENCLAW_GATEWAY_URL` 是否可达
  - 若 Gateway 需要鉴权，在 `Settings` 填写 `OPENCLAW_GATEWAY_TOKEN` 或 `OPENCLAW_GATEWAY_PASSWORD` 并保存
- 日志为空或不刷新：
  - 读取优先走 Gateway 的 `logs.tail`
  - Gateway 不可用且配置了 `OPENCLAW_LOG_PATH` 时才会从本地文件回退读取
- `token` 模式下无法打开设置页：
  - 因为受保护的是 `api/setup/*`，前端当前不会自动携带 `Authorization`，需要你用带 header 的方式请求或先切回 `local-only`
- Token 显示为 `0`：
  <details>
  <summary>展开查看：可能原因与核对方式（点击可收起）</summary>

  - 常见原因：
    - 当前会话还没有产生可统计的 token 事件（例如刚启动、仅心跳会话）。
    - Gateway 返回的会话中缺少 token 字段，或字段值本身就是 `0`。
    - 你查看的时间窗口内暂无有效数据（例如筛选范围过窄）。
  - 核对方式（建议按顺序）：
    - 打开 `Dashboard` 看 `token summary` 是否有总量增长。
    - 访问 `GET /api/metrics/token-summary`，确认 `active/archived/total` 是否都为 `0`。
    - 访问 `GET /api/sessions/token-usage`，确认会话级 token 是否有非零记录。
    - 切换到有真实对话负载的 session，等待 1~2 个轮询周期后刷新再看。
  - 结论判断：
    - 如果上述接口也都是 `0`，通常是上游暂未产生日志/指标，不是前端展示问题。
    - 如果接口有值但页面为 `0`，请提 issue 并附上接口返回片段便于排查。

  </details>

## 🎯 Roadmap

### ✅ 已完成（V4.0）

- [x] Skill 调用追踪（基于 read 工具反推）
- [x] 用户维度分析（按用户统计）
- [x] 会话类型识别增强（heartbeat/cron/boot/Wave/多平台）
- [x] Token 阈值预警（5 级）
- [x] SystemPrompt 优化建议

### 🚧 进行中（V5.0）

- [ ] Memory 可视化（时间线、关键词云）
- [ ] Inspiration 管理（状态跟踪、转化流程）
- [ ] 独立 Workspace 文件管理页面

### 📅 规划中（V6.0+）

- [ ] 多实例聚合（统一入口、实例切换）
- [ ] 历史数据分析（SQLite 持久化、长期趋势）
- [ ] 成本优化建议（按会话/模型分组）

**有想法？** 欢迎在当前仓库内提交 issue 或 PR。

---

## 🤝 贡献指南

我们欢迎各种形式的贡献！

### 快速开始

```bash
# 进入 openclaw-traceflow 目录
cd openclaw-traceflow
pnpm install
pnpm run start:dev
```

### 开发资源
请以仓库内代码与接口实现为准（如需帮助请在 issue 中提问）。

### 贡献类型

| 类型 | 说明 |
|------|------|
| 🐛 Bug 修复 | 发现并修复问题 |
| ✨ 新功能 | 添加新功能或改进现有功能 |
| 📚 文档改进 | 改进文档、添加示例 |
| 🎨 UI/UX 优化 | 改进界面设计、用户体验 |
| 🧪 测试用例 | 添加或改进测试 |

---

## 个人主页

- X: https://x.com/brucelee_1991
- 小红书: https://www.xiaohongshu.com/user/profile/5845481182ec395656dfb393
- 知乎: https://www.zhihu.com/people/huang-da-xian-14-14

---

## 📄 License

MIT © [slashhuang](https://github.com/slashhuang)

---

<div align="center">

**Made with ❤️ by <a href="https://github.com/slashhuang" target="_blank" rel="noreferrer">slashhuang</a>**

</div>
