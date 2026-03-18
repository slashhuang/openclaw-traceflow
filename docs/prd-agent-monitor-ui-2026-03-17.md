# PRD：OpenClaw Monitor（Agent 监控仪表盘）

**文档状态：** ✅ **MVP 已完成**（2026-03-18）
**创建日期：** 2026-03-17
**更新日期：** 2026-03-18
**提出人：** 晓刚（爸爸）
**撰写人：** 阿布
**优先级：** P0（高）
**实施状态：** MVP 已交付，迭代中

---

## 📌 更新记录（2026-03-18）

**MVP 已完成功能：**
- ✅ 项目名称确定为 **open-openclaw**（位于 `claw-sources/open-openclaw/`）
- ✅ 技术栈：NestJS 11 + React 19 + Vite 8 + Recharts 3 + Socket.IO + sql.js
- ✅ 前端页面：Dashboard、会话管理、实时日志、系统设置、首次启动向导
- ✅ 后端 API：健康检查、会话管理、实时日志、Metrics 监控、快速操作
- ✅ 零侵入集成：通过文件系统读取 OpenClaw 会话数据
- ✅ 开箱即用：默认 local-only 模式，可选 Access Token 保护
- ✅ 3 秒自动轮询刷新
- ✅ PM2 进程管理集成

**待实现功能（二期）：**
- ⏳ Token 用量可视化与阈值预警
- ⏳ 会话规则匹配（按 Session Key 前缀）
- ⏳ 自动恢复策略配置
- ⏳ 多实例监控
- ⏳ Prometheus 集成

---

## 0. 用户体验设计（第一原则：开箱即用）

### 0.1 产品定位重申

**像 Open Web UI 一样简单** -- 一条命令启动，打开浏览器就能用。

参考 Open Web UI 的核心体验：
- ✅ 一条 `docker run` 或 `npx` 启动
- ✅ 首次访问自动引导（连接 Gateway、设置保护）
- ✅ 默认安全（只监听 localhost，不暴露公网）
- ✅ 需要时再配置高级选项（API Key、多实例等）

### 0.2 用户使用流程（理想状态）

**场景一：个人开发者快速体验（3 分钟内）**

```bash
# 方式 A: Docker
docker run -d -p 3001:3001 clawfamily/openclaw-monitor:latest

# 方式 B: npx（无需安装）
npx openclaw-monitor

# 方式 C: 源码
git clone https://github.com/claw-family/openclaw-monitor.git
cd openclaw-monitor
npm install && npm run dev
```

**场景二：已有 OpenClaw 实例，接入监控**

```bash
# 只需改一行配置
export OPENCLAW_GATEWAY_URL=http://你的 openclaw 地址：3000
npm run dev
```

**场景三：生产环境部署**

```yaml
# docker-compose.yml（改两行）
services:
  openclaw-monitor:
    environment:
      - OPENCLAW_GATEWAY_URL=http://你的 openclaw 地址：3000
      - OPENCLAW_RUNTIME_ACCESS_TOKEN=${MONITOR_TOKEN}
```

### 0.3 默认安全设计

| 风险 | 默认行为 | 用户可选增强 |
|------|---------|------------|
| 公网暴露 | 只监听 `127.0.0.1` | 需要公网时，设置 `HOST=0.0.0.0` |
| 未授权访问 | Local-only 模式（仅本机可访问） | Access Token / 反向代理 / Basic Auth |
| 数据丢失 | SQLite 持久化到 volume | 外接 PostgreSQL / 定期备份 |

### 0.4 首次启动引导流程

```
┌─────────────────────────────────────────────────────────┐
│  👋 欢迎使用 OpenClaw Monitor                           │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  第一步：连接到 OpenClaw Gateway                        │
│  ┌─────────────────────────────────────────────────┐   │
│  │ Gateway 地址：http://localhost:3000              │   │
│  │ [测试连接]                                       │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  第二步：设置访问保护（可选，推荐）                     │
│  □ 启用 Access Token（防止公网未授权访问）               │
│    ┌─────────────────────────────────────────────┐     │
│    │ Token: [••••••••••••••••]  [自动生成]        │     │
│    └─────────────────────────────────────────────┘     │
│                                                         │
│  第三步：完成                                           │
│  [跳过，以后再说]  [完成并进入仪表盘]                    │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 0.5 与竞品体验对比

| 项目 | 启动命令 | 默认配置 | 首次体验 | 我们的目标 |
|------|---------|---------|---------|-----------|
| Jarvis-dashboard | 手动部署 | 复杂 | 需要读文档 | **npx 一行命令** |
| ClawPanel | 下载二进制 | 较简单 | 需配置端口 | **自动检测 + 引导** |
| Open Web UI | `docker run` | 极简 | 自动创建账号 | **同样简单，3 种方式任选** |

---

## 1. 背景与目标

### 1.1 背景痛点

当前 OpenClaw 用户面临以下监控盲区：

| 痛点 | 现状 | 影响 |
|------|------|------|
| **任务等待焦虑** | 提交任务后不知道执行状态 | 用户反复检查日志、无法安心 |
| **健康状态不明** | Gateway 挂了才知道 | 服务中断时间长 |
| **执行进度黑盒** | 无法查看任务执行到哪一步 | 无法判断是否卡住 |
| **性能不可观测** | 无端到端延迟、工具耗时数据 | 无法优化慢的环节 |
| **多 Agent 管理困难** | 未来 10+ Agent 无统一入口 | 管理成本高 |
| **Token 消耗焦虑（晓浩痛点）** | 看不到会话 token 用量、预算与消耗速度 | 成本不可控、担心"烧 token" |
| **会话触顶无提醒（maxTokens）** | 某个 session 到达 maxTokens 才表现为质量下降/截断/失败 | 用户以为卡住或模型变笨，无法及时止损或调整策略 |

### 1.3 产品原则（借鉴 Open Web UI）

1. **开箱即用** - 一条命令启动，无需配置
2. **默认安全** - 只监听 localhost，需要时再开启公网访问
3. **渐进式复杂度** - 基础功能零配置，高级功能可选
4. **信息密度高** - 不追求漂亮，但求实用
5. **可插拔架构** - Runtime 为中心，UI/CLI/自动化运维复用
6. **OpenClaw 原生** - 零侵入接入，专属优化（Token 预警、Session Key 分析）

### 1.2 竞品调研（GitHub OpenClaw 生态）

**已调研 3 个成熟项目：**

| 项目 | 技术栈 | 核心优势 | 我们的差异化 |
|------|--------|---------|-------------|
| **Jarvis-dashboard** | FastAPI + Vue | 模型用量看板、API Key 管理 | Hook 生命周期 Metrics（更细粒度） |
| **OpenClawWatchdog** | Node.js + TS | 自动恢复、会话规则匹配 | Session Key 深度分析 + 并发控制可视化 |
| **ClawPanel** | Go + React | 单二进制、拓扑图、插件市场 | NestJS 企业级架构 + OpenClaw 原生集成 |

**OpenClaw 官方方案对比：**

| 方案 | 类型 | 优势 | 劣势 |
|------|------|------|------|
| **OpenClaw 原生日志** | CLI 查看 | 实时、准确 | 无可视化、无聚合 |
| **PM2 logs** | 日志工具 | 简单 | 无会话维度、无 Metrics |
| **本 Monitor** | 官方监控 | 可视化、Token 预警、会话管理 | 需要额外部署 |

### 1.3 产品定位

**Open Web UI for Agents** -- OpenClaw 的统一监控、管理、调试界面

- **不是**漂亮的 ToC 产品
- **是**信息密度高、实用的 ToB 监控工具
- **类比**：tmux（多会话管理）+ Wordpress /wp-admin（一站式管理）
- **学习借鉴**：Jarvis-dashboard（模型用量）、Watchdog（自动恢复）、ClawPanel（拓扑图）

### 1.4 核心交付物（MVP 已完成）

**项目名称：** `open-openclaw`（位于 `claw-sources/open-openclaw/`）

**MVP 交付物：**
- ✅ **后端（NestJS）**：健康检查、会话管理、实时日志、Metrics、快速操作 API
- ✅ **前端（React 19 + Vite 8）**：Dashboard、会话管理、实时日志、系统设置、启动向导
- ✅ **零侵入集成**：通过文件系统读取 OpenClaw 会话数据（`~/.openclaw/workspace/agents/*/sessions/`）
- ✅ **PM2 集成**：进程管理、日志读取、重启操作
- ✅ **开箱即用**：默认 local-only 模式，可选 Access Token 保护
- ✅ **实时通信**：Socket.IO WebSocket 推送日志
- ✅ **数据可视化**：Recharts 3 图表（延迟 P50/P95/P99、会话状态分布、工具调用 Top 榜）

**架构说明：**
```
┌─────────────────────────────────────────────────────────┐
│  OpenClaw Gateway（被监控方）                            │
│  - 业务执行：会话/工具/记忆/子 Agent                      │
│  - 会话数据：~/.openclaw/workspace/agents/*/sessions/   │
│  - PM2 日志：~/.pm2/logs/*.log                          │
└─────────────────────────────────────────────────────────┘
                          │（只读接入，不修改）
                          ▼
┌─────────────────────────────────────────────────────────┐
│  open-openclaw（监控方）                                 │
│  - 读取：OpenClaw 会话文件 + PM2 日志 + sessions API     │
│  - 展示：React 仪表盘、实时日志、会话管理                │
│  - 操作：PM2 重启、会话终止、配置修改                    │
└─────────────────────────────────────────────────────────┘
```

### 1.4.1 与 OpenClaw 的关系

```
┌─────────────────────────────────────────────────────────┐
│  OpenClaw Gateway（被监控方）                            │
│  - 业务执行：会话/工具/记忆/子 Agent                      │
│  - 产生事件：hooks、logs、session lifecycle              │
│  - 现有 API：sessions_list、sessions_history 等          │
└─────────────────────────────────────────────────────────┘
                          │（只读接入，不修改）
                          ▼
┌─────────────────────────────────────────────────────────┐
│  openClawMonitor（监控方）                               │
│  - 读取：OpenClaw API + 日志文件                         │
│  - 聚合：Runtime 状态、事件、指标                        │
│  - 展示：UI 仪表盘、实时日志、会话管理                   │
└─────────────────────────────────────────────────────────┘
```

**关键设计原则：**
- **零侵入**：Monitor 不修改 OpenClaw 代码
- **只读接入**：仅读取数据，不写入 OpenClaw
- **可选增强**：有 webhook 时性能更好，无 webhook 也能用
- **独立部署**：OpenClaw 和 Monitor 可分开部署

### 1.5 目标用户

| 用户 | 使用场景 | 核心需求 |
|------|---------|---------|
| **开发者**（爸爸） | 调试技能、监控任务、查看性能 | 实时日志、Metrics、会话回溯 |
| **运维人员** | 监控 Gateway 健康、API 配额 | 健康检查、告警、资源统计 |
| **高级用户**（妈妈） | 查看任务进度、管理配置 | 简单仪表盘、快速操作 |

### 1.6 成功指标

- [ ] 任务状态可实时查看（延迟 < 1s）
- [ ] Gateway 健康状态一目了然
- [ ] 端到端延迟 P95 < 5s（正常任务）
- [ ] 支持 10+ 并发会话监控
- [ ] 用户无需查看 PM2 日志即可定位问题
- [ ] **会话 token 用量可视化**（输入/输出/总量、消耗速率，刷新延迟 < 5s）
- [ ] **maxTokens 触顶可预警且可定位**（提前阈值提醒 + 触顶事件记录 + UI 明示原因）

---

## 2. 功能需求

### 2.1 功能范围（一期 MVP）

| 模块 | 功能 | 优先级 | 工期 |
|------|------|--------|------|
| **openClawRuntime（核心）** | 配置文件、workspace、state、事件与数据接口 | P0 | 3 天 |
| **健康检查** | Runtime 健康、实例信息、配额/限流态势 | P0 | 1 天 |
| **会话管理** | 会话列表、历史回溯、上下文/事件查看 | P0 | 2 天 |
| **实时日志** | 日志流、按会话/技能过滤 | P0 | 1 天 |
| **Metrics** | Hook 耗时、P50/P95、工具调用统计 | P1 | 2 天 |
| **快速操作** | 重启/重载、启用/禁用技能、终止会话 | P1 | 1 天 |
| **开箱即用访问保护（可选）** | 默认无需登录；可一键开启轻量保护（local-only / access token / 反向代理） | P2 | 0.5 天 |

### 2.2 详细功能说明

#### 2.2.1 健康检查（`/admin/health`）

**功能描述：** 展示 Runtime/Gateway 的运行健康、技能加载、配额与关键配置

**页面元素：**
- Runtime 状态卡片（运行中/异常、运行时长、版本、workspace 路径、配置来源）
- Gateway 状态卡片（若适用：运行中/已停止、内存、CPU、运行时长）
- 技能列表（名称、启用状态、版本、最后调用时间、失败率）
- API 配额卡片（今日调用次数、剩余额度、消耗速率、限流触发次数）
- 最后心跳时间（超过 5 分钟告警）

**数据来源：**
- `openClawRuntime`（统一数据面：实例信息、配置解析结果、技能清单、状态机、事件聚合）
- 进程管理器（可选：PM2/systemd/docker；以 adapter 形式接入）
- 环境变量/配置文件（配额与模型配置）

**验收标准：**
- [ ] 页面加载时间 < 2s
- [ ] 状态实时更新（每 10s 轮询或 WebSocket 推送）
- [ ] Gateway 停止时显示红色告警

---

#### 2.2.2 会话管理（`/admin/sessions`）

**功能描述：** 查看活跃会话、历史会话、会话详情

**OpenClaw 核心概念：**
- **Session Key**：每个会话的唯一标识（如 `calm-lagoon`、`tidal-bloom`）
- **Session ID**：底层会话 ID（用于 `sessions_history` 等 API）
- **会话状态**：active（活跃）、idle（空闲）、completed（已完成）、failed（失败）
- **并发控制**：Max Concurrent Sessions（最大并发会话数）

**页面元素：**
- 会话列表（Session Key、Session ID、用户、状态、最后活跃时间、耗时）
- 并发状态卡片（当前并发数 / 最大并发数、排队任务数）
- 搜索框（按 Session Key、用户、关键词搜索）
- 会话详情（对话记录、工具调用、子 Agent 状态、资源消耗、关键事件时间线）
- Token 摘要（本会话输入/输出/总 token、消耗速率、预算/上限、阈值预警标记）
- 导出按钮（导出会话为 JSON/Markdown）
- 终止按钮（终止卡住的会话）

**数据来源：**
- `openClawRuntime` 会话索引与事件存储（第一优先）
- OpenClaw sessions API（兼容/兜底：`sessions_list`、`sessions_history`、`session_status`）
- 进程/系统指标（资源消耗，按 adapter 接入）

**验收标准：**
- [ ] 支持按时间范围筛选
- [ ] 支持关键词搜索（记忆内容、工具调用）
- [ ] 会话详情支持展开/折叠
- [ ] 导出功能正常
- [ ] **显示 Session Key 和 Session ID 的映射关系**
- [ ] **显示当前并发数和最大并发数**
- [ ] **支持按状态筛选（active/idle/completed/failed）**
- [ ] **会话详情显示 token 用量与阈值状态**（例如 80%/95%/100%）
- [ ] **当会话触顶（maxTokens）时，详情页能看到明确原因与触发时间点**

---

#### 2.2.3 实时日志（`/admin/logs`）

**功能描述：** 实时查看 Gateway 日志、按会话/技能过滤

**页面元素：**
- 日志流（时间戳、级别、内容）
- 过滤条件（会话 ID、技能名称、日志级别）
- 暂停/继续按钮
- 下载按钮（下载日志文件）

**数据来源：**
- `openClawRuntime` 统一日志总线（支持按 session/tool/skill 维度打标签）
- workspace 日志（`workspace/logs/`）
- 进程管理器日志（可选：PM2 `~/.pm2/logs/`，以 adapter 接入）

**验收标准：**
- [ ] 日志延迟 < 1s
- [ ] 支持关键词高亮
- [ ] 支持暂停查看（不影响日志采集）
- [ ] 自动滚动到底部（未暂停时）

---

#### 2.2.4 Metrics 监控（`/admin/metrics`）

**功能描述：** 基于 Hook 生命周期的性能指标 + OpenClaw 特有指标

**Hook 埋点：**

| Hook | 采集指标 | 说明 |
|------|---------|------|
| `message:received` | 时间戳 | 用户消息接收时间 |
| `memory:search` | 耗时 | 记忆检索耗时 |
| `tool:call` | 耗时、成功率 | 按工具类型分组（web_search、feishu、exec...） |
| `subagent:spawn` | 耗时、成功率 | 子 Agent 启动耗时 |
| `subagent:complete` | 耗时 | 子 Agent 执行耗时 |
| `message:reply` | 耗时 | 回复生成耗时 |
| **端到端** | 总耗时 | 用户输入 → 回复发送 |

**OpenClaw 特有指标：**
- **Session Key 分布**：各 Session Key 的请求量、耗时分布
- **并发利用率**：当前并发数 / Max Concurrent、排队任务数
- **Agent 处理队列**：等待处理的任务数、平均等待时间
- **子 Agent 并发**：同时运行的 subagents 数量、失败率
- **会话生命周期**：会话创建 → 活跃 → 空闲 → 完成/失败的转化率
- **Token 维度指标（MVP 必须）**：
  - 会话 token 分布（P50/P95、TOP N session_key）
  - token 消耗速率（tokens/min）
  - 触顶与预警次数（near_max_tokens / max_tokens_reached）
  - 输入/输出 token 比例（prompt vs completion）

**页面元素：**
- 延迟仪表盘（P50、P95、P99）
- 工具调用成功率（饼图）
- **并发利用率（仪表盘：当前并发 / Max Concurrent）**
- **Session Key TOP 10（表格：Session Key、请求量、平均耗时）**
- 子 Agent 失败率（折线图）
- API 配额消耗速率（柱状图）
- 热点技能 TOP 10（表格）
- **会话状态分布（饼图：active/idle/completed/failed）**
- **Token 仪表盘**（今日总 token、成本估算可选、速率、触顶/预警计数）
- **Session Key Token TOP 10**（表格：session_key、总 token、速率、触顶次数）
- **健康状态分类**（参考 Watchdog）：HEALTHY ✅、DEGRADED ⚠️、UNHEALTHY 🔴、CRITICAL 🚨
- **会话规则匹配统计**（按 `default`、`agent:main:*`、`agent:sub:*` 分组）

**数据来源：**
- `openClawRuntime`（采集、聚合、查询接口）
- SQLite（或可插拔存储；MVP 用 SQLite 单文件）
- 聚合查询（计算 P50/P95/P99）

**验收标准：**
- [ ] 数据延迟 < 1 分钟
- [ ] 支持按时间范围筛选（最近 1 小时/24 小时/7 天）
- [ ] 图表支持缩放、导出
- [ ] **显示 Max Concurrent 配置值和当前利用率**
- [ ] **支持按 Session Key 筛选和分组**

---

#### 2.2.5 快速操作（`/admin/actions`）

**功能描述：** 常用操作快捷入口 + 自动恢复（参考 OpenClawWatchdog）

**功能列表：**
- 重启/重载（通过 `openClawRuntime` 触发，底层由 process adapter 实现：PM2/systemd/docker 等）
- 启用/禁用技能（通过 `openClawRuntime` 修改配置并触发 reload）
- 终止卡住的任务（通过 `openClawRuntime` 发起 kill/cancel）
- 查看/修改配置（OpenClaw 配置、skills 配置、并发/限流配置）
- 清理日志（释放磁盘空间）
- 调整 token 策略（通过配置热更新）：maxTokens、预警阈值、触顶处置策略
- **自动恢复策略配置**（参考 Watchdog）：
  - Gateway 故障自动重启（最大尝试次数、冷却时间）
  - 模型故障自动切换（备用模型优先顺序）
  - 会话规则匹配（`default`、`agent:main:*`、`agent:sub:*`）

**验收标准：**
- [ ] 操作前需二次确认
- [ ] 操作后显示执行结果
- [ ] 敏感操作需管理员权限
- [ ] **自动恢复策略可配置**
- [ ] **支持会话规则匹配（按 Session Key 前缀）**

---

#### 2.2.6 开箱即用访问保护（默认无需登录）

**功能描述：** 作为开源项目，默认"拉起即可用、零学习成本"。同时提供**可选的轻量保护**，避免用户把管理端暴露到公网导致风险。

**设计原则：**
- **默认可用**：本机开发/个人使用不需要账号体系、不需要登录页
- **安全可控**：一旦对外暴露（局域网/公网），能用最少配置快速加锁
- **不做用户系统**：不引入账号管理与 SSO 等复杂度

**保护模式（MVP）：**
- **模式 A：local-only（默认）**：仅监听 `127.0.0.1`
  - 若用户显式绑定到 `0.0.0.0`，UI 顶部强提示风险，并引导选择模式 B/C
- **模式 B：access token**：通过 `OPENCLAW_RUNTIME_ACCESS_TOKEN` 设置
  - UI/CLI/HTTP 请求携带 `Authorization: Bearer <token>`
- **模式 C：反向代理**（推荐生产）：交由 Nginx/Caddy/Traefik 做 Basic Auth / OAuth
  - runtime 只提供清晰的"如何接入反代"的示例与健康检查端点

**首次启动引导（UI/CLI 二选一即可）：**
- 展示当前监听地址（local vs public）与 workspace 路径
- 一键复制"安全建议配置"（设置 token、改回 127.0.0.1、反向代理示例）

**验收标准：**
- [ ] 默认安装启动后无需任何账号配置即可打开 UI
- [ ] 默认只监听本机（`127.0.0.1`），并在 UI 明示当前模式
- [ ] 启用 access token 后：未携带 token 的请求全部被拒绝（HTTP 401），且 UI 有明确提示
- [ ] 文档给出反向代理保护建议（不要求 runtime 内置 SSO）

---

### 3.2.5 错误场景处理流程

**问题：** 异常情况如何处理？当前 PRD 是否覆盖？

**错误场景与处理策略：**

| 错误场景 | 影响 | 处理策略 | UI 表现 |
|---------|------|---------|--------|
| **Runtime 挂了** | UI 无法获取数据 | - UI 显示"Runtime 离线"<br>- 支持手动重连按钮<br>- 每 30s 自动尝试重连 | 灰色状态卡片 + 重连按钮 |
| **WebSocket 断开** | 日志/事件无法实时推送 | - 自动重连（指数退避：1s→2s→4s→8s→30s）<br>- 降级为 HTTP 轮询（每 5s） | 顶部提示"实时连接已断开，切换到轮询模式" |
| **SQLite 写入失败** | Metrics 数据丢失 | - 降级为内存存储（Ring Buffer，保留最近 1000 条）<br>- 定期 dump 到文件（每 5 分钟）<br>- 告警通知 | 顶部警告"Metrics 存储异常，部分数据可能丢失" |
| **OpenClaw API 返回错误** | 会话列表/详情无法获取 | - adapter 层做错误转换<br>- 返回统一错误格式<br>- 缓存最后一份有效数据 | 显示"数据更新于 XX:XX" + 重试按钮 |
| **PM2 未安装/未运行** | 重启功能失败 | - 启动时检测 adapter 可用性<br>- 不可用时在 UI 隐藏相关操作<br>- 提示"当前环境不支持此操作" | 操作按钮置灰 + Tooltip 说明 |
| **会话接近 maxTokens** | 输出质量下降风险、可能很快触顶 | - runtime 计算 token 利用率<br>- 达到阈值触发 `token:near_limit` 事件<br>- 建议动作：压缩上下文/降低输出长度/切换模型 | Sessions 列表出现 ⚠️ 标记，详情页显示"预计剩余 token" |
| **会话触达 maxTokens** | 回复被截断/失败，用户误判为卡住 | - 触发 `token:limit_reached` 事件并落盘<br>- 将 session 标记为 `degraded` 或 `failed`（按策略）<br>- 给出下一步建议（继续/新开会话/压缩记忆） | 详情页红色提示"已触顶 maxTokens"，并展示触发点与上下文 |

**WebSocket 重连策略（详细）：**

```javascript
// 指数退避算法
const maxRetries = 5;
const baseDelay = 1000; // 1s

function reconnect(retryCount) {
  if (retryCount >= maxRetries) {
    // 降级为 HTTP 轮询
    switchToPolling();
    return;
  }
  const delay = Math.min(baseDelay * Math.pow(2, retryCount), 30000);
  setTimeout(() => {
    ws.connect();
    ws.onopen = () => { /* 连接成功 */ };
    ws.onerror = () => { reconnect(retryCount + 1); };
  }, delay);
}
```

**验收标准：**
- [ ] Runtime 离线时 UI 显示明确状态
- [ ] WebSocket 断开后自动重连（最多 5 次）
- [ ] 重连失败后降级为 HTTP 轮询
- [ ] SQLite 异常时自动降级为内存存储
- [ ] 所有错误场景有明确的用户提示

---

## 3. 技术方案

### 3.1 总体架构（Runtime 为中心）

```
┌──────────────────────────────────────────────────────────┐
│                  OpenClaw 实例（Gateway）                 │
│  - 业务执行：会话/工具/记忆/子 Agent                        │
│  - 产生事件：hooks、logs、session lifecycle                │
└──────────────────────────────────────────────────────────┘
                          │（适配接入：API / hooks / log tail）
                          ▼
┌──────────────────────────────────────────────────────────┐
│               claw-family/openClawRuntime（核心）          │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ Config：配置文件解析/校验/合并（env + file + overrides）│ │
│  │ Workspace：工作区布局、归档、导出、清理                │ │
│  │ State：运行时状态机、会话索引、事件存储、快照           │ │
│  │ Bus：日志/事件总线（订阅/回放/过滤）                   │ │
│  │ Metrics：采集/聚合/查询（SQLite 可插拔）               │ │
│  │ Adapters：Process（PM2/systemd/docker）、OpenClaw API   │ │
│  └──────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────┐
│                Agent Monitor UI（消费者之一）              │
│  - 读取：runtime 状态、会话、指标、日志                    │
│  - 操作：reload、restart、kill session、toggle skills      │
└──────────────────────────────────────────────────────────┘
```

### 3.2 技术选型（MVP 已实现）

| 组件 | 方案 | 理由 | 实现状态 |
|------|------|------|---------|
| **后端框架** | **NestJS 11** | 企业级架构、模块化、TypeScript 原生 | ✅ 已实现 |
| **前端框架** | **React 19 + Vite 8** | 快速开发、热重载、生态丰富 | ✅ 已实现 |
| **UI 组件** | **原生 HTML + CSS** | 轻量、无额外依赖 | ✅ 已实现 |
| **数据可视化** | **Recharts 3** | React 友好、图表丰富 | ✅ 已实现 |
| **实时通信** | **Socket.IO** | WebSocket 封装、自动重连 | ✅ 已实现 |
| **数据存储** | **sql.js（SQLite 内存版）** | 单文件、无需安装、MVP 够用 | ✅ 已实现 |
| **进程管理** | **PM2** | OpenClaw 默认进程管理器 | ✅ 已实现 |
| **路由** | **React Router DOM 7** | React 标准路由方案 | ✅ 已实现 |

---

### 3.2.1 Runtime 与 OpenClaw 的集成策略（关键）

**问题：** Runtime 如何获取 OpenClaw 的 hooks、logs、sessions 数据？

**集成方式对比：**

| 集成方式 | 优点 | 缺点 | 适用场景 |
|---------|------|------|---------|
| **方案 A：修改 OpenClaw 代码，直接调用 runtime** | 性能好、实时性强 | 侵入性强、需要 OpenClaw 团队配合 | OpenClaw 官方支持时 |
| **方案 B：Sidecar 进程，监听日志文件 + 轮询 API** | 无侵入、独立部署 | 延迟稍高、需解析日志格式 | OpenClaw 不配合时的 Plan B |
| **方案 C：Hybrid 模式** | 平衡实时性与侵入性 | 实现复杂度中等 | **MVP 推荐方案** |

**MVP 采用 Hybrid 模式（方案 C）：**

```
┌─────────────────────────────────────────────────────────┐
│  OpenClaw Gateway（最小侵入）                            │
│  - 添加简单的 HTTP endpoint `/api/runtime/events`        │
│  - 将 hooks 通过 HTTP POST 推送到 runtime（可选）         │
│  - 保持 sessions/logs API 不变                           │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│  openClawRuntime（数据聚合层）                           │
│  - 轮询 OpenClaw sessions API（每 5s）                   │
│  - 订阅 OpenClaw hooks（通过 HTTP 或文件监听）           │
│  - 尾随读取日志文件（`tail -f` 或 Node.js `fs.watch`）   │
└─────────────────────────────────────────────────────────┘
```

**Plan B（如果 OpenClaw 完全不配合）：**
- 通过日志文件解析提取 hooks 事件
- 通过轮询 sessions API 获取状态
- 延迟从 <1s 增加到 2-5s

---

### 3.2.2 Process Adapter 责任边界

**问题：** adapter 是由 runtime 实现，还是由部署方自己实现？

**责任划分：**

```yaml
# runtime 负责：定义 adapter 接口 + 提供常用实现
runtime:
  adapter_interface:
    - start()         # 启动进程
    - stop()          # 停止进程
    - restart()       # 重启进程
    - get_status()    # 获取状态（内存、CPU、运行时长）
    - get_logs()      # 获取日志（最近 N 行）

  # 内置 adapters（runtime 提供实现）
  adapters_builtin:
    pm2: "✅ 提供完整实现（通过 pm2 API）"
    none: "✅ 本地开发模式，不支持重启操作"

  # 部署方负责：根据环境实现具体 adapter
  adapters_custom:
    systemd: "部署方自行实现（调用 systemctl 命令）"
    docker: "部署方自行实现（调用 docker 命令）"
```

**`none` 模式说明：**
- 适用于本地开发、调试场景
- 不支持重启/停止操作
- 仅支持读取日志和状态
- UI 显示"本地模式 - 部分功能不可用"

---

### 3.2.3 会话规则匹配语法

**问题：** 匹配语法是 glob 还是 regex？Session Key 如何产生？优先级如何？

**会话规则配置格式：**

```json
{
  "sessions": {
    "maxConcurrent": 10,
    "rules": [
      {
        "name": "agent-main",
        "pattern": "agent:main:*",
        "matchType": "glob",
        "priority": 1,
        "config": {
          "maxConcurrent": 5,
          "model": "claude-opus-4-6",
          "autoRecover": true
        }
      },
      {
        "name": "agent-sub",
        "pattern": "agent:sub:*",
        "matchType": "glob",
        "priority": 2,
        "config": {
          "maxConcurrent": 10,
          "model": "claude-sonnet-4-6",
          "autoRecover": false
        }
      },
      {
        "name": "default",
        "pattern": "default",
        "matchType": "exact",
        "priority": 999,
        "config": {
          "maxConcurrent": 2,
          "model": "claude-sonnet-4-6",
          "autoRecover": false
        }
      }
    ]
  }
}
```

**匹配规则：**
- **匹配语法：** 使用 glob（支持 `*` 通配符），不用 regex（避免复杂度）
- **Session Key 来源：** 由 OpenClaw 在创建会话时生成（如 `calm-lagoon`、`agent:main:analysis`）
- **优先级：** `priority` 数字越小优先级越高，先匹配先应用
- **Session Key 格式建议：** `<category>:<subcategory>:<name>`（如 `agent:main:report-generator`）

---

### 3.2.4 事件存储规模与清理策略

**问题：** 每天产生多少事件？SQLite 能否承载？清理策略是什么？

**事件量估算（10+ 并发会话）：**

| 事件类型 | 单会话/小时 | 10 会话/天 | 保留 30 天总量 |
|---------|-----------|----------|--------------|
| `tool:call` | 20-50 | 2,000-5,000 | 60k-150k |
| `log:line` | 100-200 | 10,000-20,000 | 300k-600k |
| `session:*` | 5-10 | 500-1,000 | 15k-30k |
| **合计** | ~250 | ~25,000 | ~750k |

**SQLite 承载能力：**
- 单表 100 万行：查询性能良好（有索引情况下）
- 建议：`hook_metrics` 超过 50 万行后按月分表

**清理策略：**

```yaml
events:
  retention:
    active_sessions: "7 天（自动清理已完成会话的详细事件）"
    completed_sessions: "30 天（仅保留索引，详情归档）"
    failed_sessions: "90 天（保留完整事件用于调试）"

  partitioning: "按 session_key 分片存储"

  cleanup:
    schedule: "每天凌晨 3:00"
    strategy: |
      1. 将 completed_sessions 详情归档到 events/archive/{YYYY-MM}.tar.gz
      2. 删除原事件文件，保留索引
      3. 清理 tmp/ 临时文件

  archive:
    format: "tar.gz"
    destination: "workspace/archive/"
    include_index: true  # 归档中包含索引文件，支持离线查询
```

### 3.3 `openClawRuntime` 的核心设计（必须落地）

#### 3.3.1 配置文件（Config）

**目标：** 让 UI/运维/自动恢复等功能有统一的可解释配置来源；并且能把 OpenClaw 现有配置与 Monitor 所需配置纳入同一套 schema。

**必须支持：**
- 配置加载顺序：默认值 → 配置文件 → 环境变量 → 启动时 overrides
- 配置校验：缺失字段、类型错误、非法范围（例如并发数 < 1）
- 配置热更新：修改后触发 `runtime.reload()`，并产出 `config:changed` 事件
- 配置可观测：UI 能看到"当前生效值"与"来源（file/env/default）"

**建议的配置文件形态（MVP）：**
- `openclaw.runtime.json`（或 `openclaw.runtime.yaml`）：monitor/runtime 专属配置
- 兼容读取 OpenClaw 现有配置（例如 `bot.json` / skills 配置）并映射为 runtime 可用结构

**关键字段（MVP 必须有）：**
- `workspacePath`
- `sessions.maxConcurrent`
- `sessions.rules`（`default`、`agent:main:*`、`agent:sub:*`）
- `tokens`（token 预算、阈值、触顶处置策略）
- `logging`（级别、文件输出、结构化日志开关）
- `metrics.storage`（sqlite 路径、wal、采样/批量写策略）
- `process.adapter`（pm2/systemd/docker/none）

#### 3.3.2 工作区（Workspace）

**目标：** 把会话、日志、事件、导出物放在确定的目录结构里，可被 UI/CLI/备份工具一致理解。

**约定目录结构（MVP）：**
- `workspace/`
  - `config/`（运行时展开后的"生效配置快照"）
  - `sessions/`（会话索引与导出物）
  - `events/`（事件存储：按 session 分片）
  - `logs/`（结构化日志与原始日志）
  - `metrics/`（sqlite 文件、聚合结果）
  - `tmp/`（临时文件）

**必须支持：**
- 会话导出：JSON/Markdown（与 UI 的导出按钮一致）
- 清理策略：按时间/大小清理 logs、tmp、历史会话
- 归档策略：completed/failed 会话归档与索引保留

#### 3.3.3 状态（State）与事件流（Bus）

**目标：** UI 的"会话列表/详情/日志/指标"都以 runtime 的状态与事件为真相来源，而不是 UI 直接拼接多个外部来源。

**State 要覆盖：**
- Runtime 状态机：`starting` → `running` → `degraded` → `stopping` → `stopped`（含 `error` 分支）
- Session 状态：`active/idle/completed/failed` + 关键时间戳（创建/最后活跃/结束）
- 并发与队列：当前并发、排队任务数、最大并发、利用率
- Skills 状态：启用/禁用、加载失败原因、最后调用、失败率
- Token 状态：会话级 token 用量（输入/输出/总）、速率、预算/上限、阈值状态（normal/warn/critical/reached）

**事件（MVP 必须有）：**
- `runtime:ready` / `runtime:error`
- `config:changed`
- `session:created` / `session:updated` / `session:completed` / `session:failed`
- `tool:call` / `tool:result`
- `log:line`
- `metrics:tick`（周期性快照/聚合完成）
- `token:usage`（会话 token 增量/快照）
- `token:near_limit`（达到预警阈值）
- `token:limit_reached`（触顶：maxTokens 或 provider 限制）

**事件能力：**
- 订阅：按 session_id/session_key/tool/skill/level 过滤
- 回放：按时间范围拉取（用于"历史回溯"与"导出"）
- 去重与顺序：至少保证单 session 内有序

#### 3.3.4 Metrics（采集与存储）

**Hook 埋点数据结构（示例）：**

```json
{
  "id": "uuid",
  "timestamp": 1710676800000,
  "hook": "tool:call",
  "session_id": "session_123",
  "tool_name": "web_search",
  "duration_ms": 1234,
  "success": true,
  "error": null,
  "metadata": {
    "query": "Open Web UI features",
    "count": 5
  }
}
```

**SQLite 表结构（MVP 可沿用）：**

```sql
-- Hook 埋点数据
CREATE TABLE hook_metrics (
  id TEXT PRIMARY KEY,
  timestamp INTEGER NOT NULL,
  hook TEXT NOT NULL,
  session_key TEXT,           -- OpenClaw Session Key（如 calm-lagoon）
  session_id TEXT,            -- 底层 Session ID
  tool_name TEXT,
  duration_ms INTEGER,
  success BOOLEAN,
  error TEXT,
  metadata TEXT               -- JSON 字符串
);

-- 并发状态快照（每分钟记录一次）
CREATE TABLE concurrency_snapshots (
  id TEXT PRIMARY KEY,
  timestamp INTEGER NOT NULL,
  current_concurrent INTEGER NOT NULL,
  max_concurrent INTEGER NOT NULL,
  queue_length INTEGER NOT NULL,
  active_sessions INTEGER NOT NULL
);

-- Session Key 统计（每小时聚合）
CREATE TABLE session_key_stats (
  hour INTEGER NOT NULL,
  session_key TEXT NOT NULL,
  request_count INTEGER NOT NULL,
  avg_duration_ms INTEGER NOT NULL,
  p95_duration_ms INTEGER NOT NULL,
  error_count INTEGER NOT NULL,
  PRIMARY KEY (hour, session_key)
);

CREATE INDEX idx_timestamp ON hook_metrics(timestamp);
CREATE INDEX idx_hook ON hook_metrics(hook);
CREATE INDEX idx_session_key ON hook_metrics(session_key);
CREATE INDEX idx_session_id ON hook_metrics(session_id);
CREATE INDEX idx_concurrency_timestamp ON concurrency_snapshots(timestamp);
```

### 3.4 对外接口设计（以 Runtime API 为准）

> 说明：UI 只依赖 `openClawRuntime` 暴露的接口。具体对外形态可以是"嵌入式调用"（同进程）或"runtime daemon"（HTTP/WebSocket/SSE）。本 PRD 先定义**语义接口**，不锁定 NestJS。

**HTTP（示例接口）：**

| 接口 | 方法 | Module | 说明 |
|------|------|--------|------|
| `/api/runtime/health` | GET | Runtime | Runtime/Gateway 健康状态、workspace、版本 |
| `/api/runtime/config` | GET | Runtime | 当前生效配置（含来源） |
| `/api/runtime/config` | PUT | Runtime | 更新配置（并触发 reload） |
| `/api/sessions` | GET | Sessions | 会话列表（含 Session Key、状态、并发） |
| `/api/sessions/:id` | GET | Sessions | 会话详情（对话、工具调用、事件时间线） |
| `/api/sessions/:id/events` | GET | Sessions | 会话事件回放（时间范围） |
| `/api/metrics/latency` | GET | Metrics | 延迟指标（P50/P95/P99） |
| `/api/metrics/tools` | GET | Metrics | 工具调用统计 |
| `/api/metrics/concurrency` | GET | Metrics | 并发指标（当前/最大/排队） |
| `/api/metrics/session-keys` | GET | Metrics | Session Key 分布（请求量、耗时） |
| `/api/actions/reload` | POST | Actions | 重载配置/skills（不中断进程优先） |
| `/api/actions/restart` | POST | Actions | 重启 Gateway（走 process adapter） |
| `/api/actions/kill-session/:id` | POST | Actions | 终止会话 |

**实时通道（WebSocket 或 SSE，事件语义一致）：**

| 事件 | 方向 | 说明 |
|------|------|------|
| `events:subscribe` | Client → Server | 订阅事件流（可带过滤条件） |
| `events:unsubscribe` | Client → Server | 取消订阅 |
| `event` | Server → Client | 统一事件推送（包含 `type` 与 payload） |
| `logs:tail` | Server → Client | 日志行推送（或作为 `event` 的一种） |
| `metrics:update` | Server → Client | 指标更新（或作为 `event` 的一种） |
| `health:change` | Server → Client | 健康状态变化（或作为 `event` 的一种） |

---

## 4. 实施计划

### 4.1 阶段划分（MVP 已完成）

| 阶段 | 内容 | 工期 | 状态 | 交付物 |
|------|------|------|------|--------|
| **阶段一** | 调研与设计 | 1-2 天 | ✅ 完成 | PRD、线框图、技术设计 |
| **阶段二** | open-openclaw MVP | 3 天 | ✅ 完成（2026-03-18） | 后端 API + 前端仪表盘 |
| **阶段三** | UI 功能完善 | 2-3 天 | 🔄 进行中 | Dashboard、会话管理、实时日志 |
| **阶段四** | Token 可视化与预警 | 2-3 天 | ⏳ 待实施 | Token 用量、阈值告警、触顶追溯 |
| **阶段五** | 增强功能 | 3-5 天 | ⏳ 待实施 | 自动恢复、多实例、Prometheus |

**MVP 实际工期：** 3 天（2026-03-16 至 2026-03-18）

**MVP 已完成功能：**
- ✅ 后端 NestJS 框架搭建
- ✅ 前端 React + Vite 框架搭建
- ✅ 健康检查 API（Gateway 状态、PM2 进程、技能列表）
- ✅ 会话管理 API（列表、详情、历史回溯）
- ✅ 实时日志（PM2 日志文件读取、WebSocket 推送）
- ✅ Metrics API（延迟 P50/P95/P99、工具调用统计）
- ✅ 快速操作（重启 Gateway、终止会话、清理日志）
- ✅ Dashboard 页面（统计卡片、延迟指标、会话状态分布、工具调用 Top 榜）
- ✅ 会话管理页面（列表、详情、Token 用量占位）
- ✅ 实时日志页面（WebSocket 推送、级别过滤）
- ✅ 系统设置页面（Gateway 配置、访问模式切换）
- ✅ 首次启动向导（3 步配置）
- ✅ 开箱即用访问保护（local-only / token 模式）
- ✅ 3 秒自动轮询刷新
- ✅ Docker 镜像构建配置

### 4.2 详细任务列表

#### 阶段一：调研与设计（1-2 天）
- [x] 调研 Open Web UI 功能特点
- [ ] 梳理 OpenClaw 现有 Hook 列表
- [ ] 画线框图（确定 UI 布局）
- [ ] 设计 `openClawRuntime` 的 Config/Workspace/State/Bus 数据模型
- [ ] 设计 metrics 存储（SQLite）表结构
- [ ] 评审 PRD

#### 阶段二：`openClawRuntime` MVP（3-5 天）
- [ ] 定义并实现配置 schema + 校验 + 来源追踪（file/env/default/override）
- [ ] 定义并实现 workspace 目录结构 + 导出/清理能力
- [ ] 定义并实现 runtime state（runtime/session/skills/concurrency）与快照
- [ ] 定义并实现事件总线（订阅/过滤/回放）
- [ ] 对接 OpenClaw sessions/hook/log（最小可用 adapter）
- [ ] 对接 process adapter（先 PM2 可选，允许 none）
- [ ] 暴露对外 API（HTTP + WS/SSE，或嵌入式调用接口）
- [ ] **实现会话规则匹配**（按 Session Key 前缀：default、agent:main:*、agent:sub:*）

#### 阶段三：UI MVP 接入（2-4 天）
- [ ] Health 页面：展示 runtime 健康、配置摘要、skills 列表
- [ ] Sessions 页面：会话列表/详情/事件时间线/导出
- [ ] Logs 页面：订阅事件/日志流，过滤与下载
- [ ] Metrics 页面（可选 P1）：基于 runtime 的 metrics 查询
- [ ] 兼容"无 PM2/无 daemon"的最小部署形态（本机 workspace）

#### 阶段四：增强功能（3-5 天）
- [ ] 实现快速操作接口
- [ ] 实现开箱即用访问保护（local-only + access token + 反代建议）
- [ ] 实现告警功能（Gateway 停止、API 配额不足）
- [ ] 前端 Actions 页面

#### 阶段五：测试与优化（2-3 天）
- [ ] 单元测试
- [ ] 集成测试
- [ ] 性能测试（并发 10+ 会话）
- [ ] Bug 修复
- [ ] 文档编写

---

## 5. 风险与依赖

### 5.1 技术风险

| 风险 | 影响 | 应对措施 |
|------|------|---------|
| Hook 埋点影响性能 | 延迟增加 | 异步采集、批量写入 |
| WebSocket 连接不稳定 | 日志丢失 | 自动重连、降级轮询 |
| SQLite 并发写入 | 性能瓶颈 | WAL 模式、连接池 |
| 进程管理器兼容性（PM2/systemd/docker） | 动作不可用 | adapter 可插拔 + `none` 模式 |
| 状态/事件落盘设计不当 | 回放不可靠 | 先定义最小一致性与单 session 有序保证 |

### 5.2 依赖项

| 依赖 | 状态 | 负责人 |
|------|------|--------|
| OpenClaw sessions/hook/log 接口 | 已有/需对齐 | OpenClaw 团队 |
| 进程管理器（PM2/systemd/docker） | 可选 | 运维/部署 |
| 前端组件库 | 开源 | 社区 |

---

## 6. 验收标准

### 6.1 MVP 验收（已完成 ✅）

- [x] 后端 API 正常（健康检查、会话管理、日志、Metrics、操作）
- [x] 前端页面正常（Dashboard、会话、日志、设置、向导）
- [x] 开箱即用访问保护生效（默认 local-only）
- [x] 实时日志 WebSocket 推送正常
- [x] Metrics 数据展示正常（P50/P95/P99、工具调用统计）
- [x] 3 秒自动轮询刷新正常
- [x] PM2 集成正常（重启、日志读取）
- [x] Docker 镜像构建正常

### 6.2 二期验收标准（待实施）

- [ ] **Token 预警生效**：可配置阈值（如 80%/95%），触发后 UI 在 5s 内可见
- [ ] **触顶可追溯**：每次 `maxTokens` 触顶都能在会话事件时间线中定位到触发点
- [ ] 会话规则匹配（按 Session Key 前缀：default、agent:main:*、agent:sub:*）
- [ ] 自动恢复策略配置
- [ ] 多实例监控
- [ ] Prometheus 集成

### 6.3 性能验收

- [x] 页面加载时间 < 2s
- [ ] 支持 10+ 并发会话监控
- [ ] SQLite 写入不影响主流程
- [ ] 内存占用 < 200MB

### 6.4 用户体验验收

- [x] 界面简洁、信息密度高
- [ ] 支持移动端查看
- [x] 错误提示清晰
- [ ] 操作有二次确认

---

## 7. 后续迭代（二期）

### 7.1 高优先级（P1）

| 功能 | 说明 | 预计工期 |
|------|------|---------|
| **Token 用量可视化** | 会话级 token 统计（输入/输出/总量）、消耗速率、预算/上限 | 2 天 |
| **Token 阈值预警** | 可配置阈值（80%/95%），触发后 UI 明示 + 告警 | 1 天 |
| **maxTokens 触顶追溯** | 记录触顶事件、在会话时间线中标注触发点 | 1 天 |
| **会话规则匹配** | 按 Session Key 前缀（default、agent:main:*、agent:sub:*）应用不同配置 | 2 天 |
| **自动恢复策略** | Gateway 故障自动重启、模型故障自动切换 | 2 天 |

### 7.2 中优先级（P2）

| 功能 | 说明 | 预计工期 |
|------|------|---------|
| **告警通知** | Gateway 停止、API 配额不足时推送通知（飞书/邮件/短信） | 2 天 |
| **多实例监控** | 支持切换监控多个 OpenClaw 实例 | 3 天 |
| **Prometheus 集成** | 导出 Metrics 到 Prometheus、Grafana 仪表盘 | 2 天 |
| **会话流程图** | 可视化展示会话执行流程、Agent 调用关系 | 2 天 |
| **移动端适配** | 响应式布局优化、移动端操作优化 | 2 天 |

### 7.3 低优先级（P3）

| 功能 | 说明 | 预计工期 |
|------|------|---------|
| **插件生态** | 支持第三方监控插件 | 5 天 |
| **自动化运维** | 自动扩容、自动清理日志 | 3 天 |
| **高级分析** | 会话趋势分析、异常检测、成本优化建议 | 5 天 |

---

## 8. 部署指南

### 8.1 快速开始（3 种方式，任选其一）

---

#### 方式一：Docker（推荐，最简单）

```bash
# 一条命令启动
docker run -d -p 3001:3001 \
  -v openclaw-monitor-data:/data \
  --name openclaw-monitor \
  clawfamily/openclaw-monitor:latest

# 访问 http://localhost:3001
```

---

#### 方式二：npx（无需安装，快速体验）

```bash
# 一行命令，自动下载并运行
npx openclaw-monitor

# 访问 http://localhost:3001
```

---

#### 方式三：源码运行（开发者模式）

```bash
# 1. 克隆项目
git clone https://github.com/slashhuang/claw-sources.git
cd claw-sources/open-openclaw

# 2. 安装依赖（使用 pnpm）
pnpm install

# 3. 启动开发模式
pnpm run start:dev

# 访问 http://localhost:3001
```

**前提条件：**
- Node.js 18+
- pnpm（推荐）或 npm

---

### 8.2 首次启动引导流程

**步骤 1：连接 OpenClaw Gateway**

```
┌─────────────────────────────────────────────────────────┐
│  👋 欢迎使用 OpenClaw Monitor                           │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  第一步：连接到 OpenClaw Gateway                        │
│  ┌─────────────────────────────────────────────────┐   │
│  │ Gateway 地址：http://localhost:3000              │   │
│  │ [测试连接] ✅ 连接成功                           │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  [继续]                                                 │
└─────────────────────────────────────────────────────────┘
```

**步骤 2：设置访问保护（可选，推荐）**

```
┌─────────────────────────────────────────────────────────┐
│  第二步：设置访问保护（推荐）                            │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  当前模式：仅本机访问（安全）                            │
│                                                         │
│  □ 启用 Access Token（如果需要公网访问）                 │
│    ┌─────────────────────────────────────────────┐     │
│    │ Token: [••••••••••••••••]  [自动生成]        │     │
│    └─────────────────────────────────────────────┘     │
│                                                         │
│  💡 提示：如果只在本地使用，可以跳过此步骤               │
│                                                         │
│  [跳过]                    [保存并继续]                  │
└─────────────────────────────────────────────────────────┘
```

**步骤 3：完成**

```
┌─────────────────────────────────────────────────────────┐
│  🎉 配置完成！                                           │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  您的 Monitor 已就绪：                                  │
│  - 访问地址：http://localhost:3001                      │
│  - Gateway 连接：http://localhost:3000 ✅               │
│  - 访问保护：已启用                                      │
│                                                         │
│  [进入仪表盘]                                           │
└─────────────────────────────────────────────────────────┘
```

---

### 8.3 环境变量（可选配置）

| 变量名 | 说明 | 默认值 | 是否必填 |
|--------|------|--------|---------|
| `OPENCLAW_GATEWAY_URL` | OpenClaw Gateway 地址 | `http://localhost:3000` | ❌ |
| `OPENCLAW_RUNTIME_ACCESS_TOKEN` | 访问令牌（启用保护时设置） | 空（无保护） | ❌ |
| `HOST` | 监听地址 | `127.0.0.1` | ❌ |
| `PORT` | 监听端口 | `3001` | ❌ |
| `DATA_DIR` | 数据目录（SQLite、日志等） | `./data` | ❌ |

**使用示例：**

```bash
# Docker
docker run -e OPENCLAW_GATEWAY_URL=http://my-gateway:3000 ...

# npx
npx openclaw-monitor --gateway http://my-gateway:3000

# npm
export OPENCLAW_GATEWAY_URL=http://my-gateway:3000
npm run dev
```

---

### 8.4 常见部署场景

**场景一：本地开发（默认）**

```bash
# 无需配置，直接启动
npm run dev
```

**场景二：已有 OpenClaw 实例**

```bash
# 只需改一行配置
export OPENCLAW_GATEWAY_URL=http://你的 openclaw 地址：3000
npm run dev
```

**场景三：局域网共享（启用 Token 保护）**

```bash
docker run -d -p 3001:3001 \
  -e OPENCLAW_RUNTIME_ACCESS_TOKEN=my-secret-token \
  -e HOST=0.0.0.0 \
  clawfamily/openclaw-monitor:latest
```

**场景四：生产环境（反向代理 + HTTPS）**

```yaml
# docker-compose.yml
services:
  openclaw-monitor:
    image: clawfamily/openclaw-monitor:latest
    environment:
      - OPENCLAW_RUNTIME_ACCESS_TOKEN=${MONITOR_TOKEN}
    networks:
      - internal

  nginx:
    image: nginx:alpine
    ports:
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/nginx/ssl
    networks:
      - internal
```

---

### 8.5 健康检查

```bash
# 检查服务是否健康
curl http://localhost:3001/api/health

# 预期响应
{
  "status": "healthy",
  "version": "1.0.0",
  "gateway": {
    "connected": true,
    "url": "http://localhost:3000"
  }
}
```

---

### 8.6 故障排查

| 问题 | 可能原因 | 解决方案 |
|------|---------|---------|
| 无法访问 UI | 端口被占用或未启动 | 检查 `docker ps` 或 `npm` 进程，换一个端口 `PORT=3002` |
| Gateway 连接失败 | 地址配置错误或 Gateway 未运行 | 检查 `OPENCLAW_GATEWAY_URL`，确认 Gateway 可访问 |
| Token 验证失败 | Token 不匹配 | 确保请求携带 `Authorization: Bearer <token>` |
| 数据丢失 | Volume 未持久化 | 使用 `-v openclaw-monitor-data:/data` 或设置 `DATA_DIR` |
| npm install 失败 | Node 版本过低 | 升级到 Node.js 18+ 或使用 `nvm use` |

---

## 9. 附录

### 9.1 参考资料

- Open Web UI: `https://github.com/open-webui/open-webui`
- OpenWebUI-Monitor: `https://github.com/VariantConst/OpenWebUI-Monitor`
- OpenClaw: `https://github.com/openclaw/openclaw`
- OpenClaw API 文档：`https://docs.openclaw.ai/api`
- PM2 API: `https://pm2.keymetrics.io/docs/usage/quick-start/`
- Socket.IO: `https://socket.io/`

### 9.2 相关文件

- 灵感文档：`inspiration/agent-monitor-ui-2026-03-17.md`
- 项目代码：`claw-sources/open-openclaw/`
- README: `open-openclaw/README.md`
- CLAUDE.md: `open-openclaw/CLAUDE.md`

### 9.4 open-openclaw 项目结构

```
open-openclaw/
├── bin/
│   └── cli.js              # CLI 入口
├── config/
│   └── openclaw.runtime.json  # 运行时配置
├── data/
│   └── config/
│       └── snapshot.json   # 配置快照
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Dashboard.jsx      # 仪表盘页面
│   │   │   ├── Sessions.jsx       # 会话列表
│   │   │   ├── SessionDetail.jsx  # 会话详情
│   │   │   ├── Logs.jsx           # 实时日志
│   │   │   ├── Settings.jsx       # 系统设置
│   │   │   └── SetupWizard.jsx    # 首次启动向导
│   │   ├── api/
│   │   │   └── index.js           # API 客户端
│   │   ├── App.jsx                # 主应用组件
│   │   ├── main.jsx               # 入口
│   │   └── styles/
│   │       └── index.css          # 全局样式
│   ├── index.html
│   └── vite.config.js
├── public/
│   └── app/                  # 构建后的前端静态文件
├── src/
│   ├── actions/
│   │   ├── actions.controller.ts   # 快速操作 API
│   │   ├── actions.module.ts
│   │   └── actions.service.ts
│   ├── auth/
│   │   └── auth.guard.ts           # 认证守卫（Access Token）
│   ├── config/
│   │   ├── config.module.ts
│   │   └── config.service.ts       # 配置服务
│   ├── health/
│   │   ├── health.controller.ts    # 健康检查 API
│   │   ├── health.module.ts
│   │   └── health.service.ts
│   ├── metrics/
│   │   ├── metrics.controller.ts   # Metrics API
│   │   ├── metrics.module.ts
│   │   └── metrics.service.ts
│   ├── openclaw/
│   │   ├── openclaw.module.ts
│   │   ├── openclaw.service.ts     # OpenClaw 集成服务
│   │   ├── openclaw-paths.resolver.ts
│   │   └── gateway-ws-paths.ts     # Gateway WebSocket 路径
│   ├── sessions/
│   │   ├── sessions.controller.ts  # 会话管理 API
│   │   ├── sessions.module.ts
│   │   └── sessions.service.ts
│   ├── setup/
│   │   ├── setup.controller.ts     # 启动向导 API
│   │   └── setup.module.ts
│   ├── app.controller.ts
│   ├── app.module.ts
│   ├── app.service.ts
│   └── main.ts
├── test/
├── Dockerfile
├── docker-compose.yml
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
└── README.md
```

---

### 9.3 竞争力分析总结

**我们的核心优势：**

| 维度 | 竞品 | 我们（open-openclaw） |
|------|------|------|
| **架构设计** | 监控工具（单一功能） | NestJS 模块化架构（可扩展） |
| **OpenClaw 集成** | 外部 Hook | **零侵入接入（读取会话文件 + PM2 日志）** |
| **部署体验** | 手动配置或多步骤 | **3 种方式任选：Docker / npx / pnpm** |
| **开箱即用** | 需要读文档配置 | **3 分钟上手，首次启动引导** |
| **技术栈** | 多样 | **NestJS 11 + React 19 + Vite 8 + Recharts 3** |
| **实时性** | 轮询 | **Socket.IO WebSocket 推送** |
| **企业级特性** | 弱 | 强（访问保护、PM2 集成、配置热更新） |

**OpenClaw 接入友好性：**

| 特性 | 说明 |
|------|------|
| **零侵入** | 无需修改 OpenClaw 代码，即插即用 |
| **自动检测** | Monitor 自动发现本地 OpenClaw 实例（通过 `openclaw config file`） |
| **版本兼容** | 支持 OpenClaw v1.0+ |
| **独立部署** | OpenClaw 和 Monitor 可同机/局域网/跨网部署 |
| **PM2 集成** | 直接读取 PM2 日志、支持重启操作 |

**实施关键点（MVP 已完成）：**

1. ✅ 零侵入接入（读取会话文件 + PM2 日志）
2. ✅ PM2 集成（进程管理、日志读取、重启）
3. ✅ 开箱即用访问保护（默认 local-only，可选 access token）
4. ✅ WebSocket 实时日志推送（Socket.IO）
5. ✅ 数据可视化（Recharts 3 图表）
6. ✅ 3 秒自动轮询刷新
7. ✅ Docker 镜像构建
8. ✅ 首次启动向导

---

## 10. 用户故事（典型使用场景）

### 故事一：晓刚快速体验（5 分钟）

```bash
# 1. 看到项目，想试试
npx openclaw-monitor

# 2. 打开浏览器 http://localhost:3001
# 3. 看到欢迎页，自动检测到本地 OpenClaw Gateway
# 4. 点击"开始使用"
# 5. 看到仪表盘，显示"未连接到 Gateway"
# 6. 输入 Gateway 地址，测试连接，成功
# 7. 开始使用 - 看到会话列表、日志、Metrics
```

### 故事二：晓浩接入现有 OpenClaw（3 分钟）

```bash
# 1. 已有 OpenClaw 实例在 http://192.168.1.100:3000
# 2. Docker 启动
docker run -d -p 3001:3001 \
  -e OPENCLAW_GATEWAY_URL=http://192.168.1.100:3000 \
  clawfamily/openclaw-monitor:latest

# 3. 打开浏览器，直接看到仪表盘
# 4. Token 用量、会话状态一目了然
```

### 故事三：开发者贡献代码

```bash
# 1. Fork 项目
git clone https://github.com/claw-family/openclaw-monitor.git
cd openclaw-monitor

# 2. 安装依赖
npm install

# 3. 启动开发模式
npm run dev

# 4. 修改代码，热重载生效
# 5. 提交 PR
```

---

## 11. OpenClaw 接入指南

### 11.1 OpenClaw 是什么（快速介绍）

OpenClaw 是一个基于 Claude 的 AI Agent 框架，支持：
- 多会话并发管理
- 丰富的技能扩展（web_search、feishu、exec...）
- 子 Agent 分发
- 记忆/上下文管理

**本 Monitor 与 OpenClaw 的关系：**
- Monitor 是 OpenClaw 的**官方监控管理界面**
- 零侵入接入（无需修改 OpenClaw 代码）
- 通过 OpenClaw 现有 API 和日志文件获取数据

### 11.2 OpenClaw 快速接入（3 种方式）

---

**方式一：OpenClaw 已运行（最常见）**

```bash
# 1. 确认 OpenClaw Gateway 地址
# 默认：http://localhost:3000

# 2. 启动 Monitor
docker run -d -p 3001:3001 \
  -e OPENCLAW_GATEWAY_URL=http://localhost:3000 \
  clawfamily/openclaw-monitor:latest

# 3. 访问 http://localhost:3001
```

---

**方式二：同时部署 OpenClaw + Monitor**

```yaml
# docker-compose.yml
services:
  openclaw:
    image: ghcr.io/openclaw/gateway:latest
    ports:
      - "3000:3000"
    environment:
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}

  monitor:
    image: clawfamily/openclaw-monitor:latest
    ports:
      - "3001:3001"
    environment:
      - OPENCLAW_GATEWAY_URL=http://openclaw:3000

# 启动
docker-compose up -d
```

---

**方式三：OpenClaw 开发模式（本地调试）**

```bash
# 1. OpenClaw 本地运行
cd openclaw
npm run dev  # 运行在 http://localhost:3000

# 2. Monitor 本地运行
cd openclaw-monitor
npm run dev  # 运行在 http://localhost:3001

# 3. 访问 Monitor，自动检测到 OpenClaw
```

### 11.3 OpenClaw 兼容性说明

| OpenClaw 版本 | Monitor 兼容性 | 说明 |
|--------------|---------------|------|
| v1.0+ | ✅ 完全兼容 | 支持所有功能 |
| v0.8-v0.9 | ⚠️ 部分兼容 | 基础功能正常，部分 Metrics 不可用 |
| v0.7 及以下 | ❌ 不兼容 | 需要升级 OpenClaw |

**如何检查 OpenClaw 版本：**

```bash
# 访问 OpenClaw Gateway
curl http://localhost:3000/api/version

# 预期响应
{
  "version": "1.0.0",
  "api_version": "v1"
}
```

### 11.4 OpenClaw 配置说明（可选优化）

**OpenClaw 侧无需特殊配置**，Monitor 会自动适配。

如需优化体验，可在 OpenClaw 配置中添加：

```json
// OpenClaw config.json
{
  "monitor": {
    "enabled": true,           // 启用 Monitor 集成（可选）
    "webhook_url": "http://localhost:3001/api/webhooks"  // 实时推送（可选）
  }
}
```

**效果：**
- 无 webhook：Monitor 通过轮询获取数据（延迟 2-5s）
- 有 webhook：Monitor 实时接收事件（延迟 <1s）

### 11.5 OpenClaw 用户专属功能

Monitor 为 OpenClaw 用户提供以下专属功能：

| 功能 | OpenClaw 原生 | 接入 Monitor 后 |
|------|-------------|---------------|
| 会话列表 | CLI 查看 | 可视化仪表盘 + 搜索过滤 |
| 会话详情 | 查看 JSON | 对话记录 + 工具调用 + 事件时间线 |
| Token 用量 | 无 | 实时统计 + 阈值预警 + 触顶追溯 |
| 并发状态 | 无 | 仪表盘显示 + 排队任务数 |
| 实时日志 | 查看 PM2 日志 | 日志流 + 按会话/技能过滤 |
| 性能指标 | 无 | P50/P95/P99 延迟 + 工具成功率 |
| 会话管理 | CLI 命令 | 可视化终止/导出/回溯 |
| 健康检查 | 无 | 实时状态 + 告警 |

### 11.6 OpenClaw 常见问题

**Q: Monitor 会影响 OpenClaw 性能吗？**

A: 不会。Monitor 通过只读 API 和日志文件获取数据，不影响 OpenClaw 主流程。

**Q: 必须修改 OpenClaw 代码吗？**

A: 不需要。Monitor 零侵入接入，无需修改 OpenClaw 代码。

**Q: OpenClaw 和 Monitor 可以分开部署吗？**

A: 可以。只要网络可达，支持任意部署方式：
- 同机部署（默认）
- 局域网部署（推荐）
- 跨公网部署（需配置 CORS 和认证）

**Q: Monitor 支持多 OpenClaw 实例吗？**

A: 一期 MVP 支持单实例，二期支持多实例切换。

---

---

## 12. PRD 状态与下一步

### 当前状态（2026-03-18）

- ✅ **MVP 已完成**：open-openclaw 项目已创建并实现基础功能
- ✅ **代码位置**：`claw-sources/open-openclaw/`
- 🔄 **文档更新**：本 PRD 根据实际实现更新
- ⏳ **二期规划**：Token 可视化、预警、自动恢复等

### 下一步计划

1. **爸爸评审 PRD** → 确认二期优先级
2. **实施二期功能** → 按优先级逐步实现
3. **持续优化** → 根据用户反馈改进

---

**PRD 状态：** ✅ MVP 已完成，迭代中  
**最后更新：** 2026-03-18  
**维护人：** 阿布 👧
