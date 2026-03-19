# PRD：open-openclaw — OpenClaw 智能监控与资产管理平台

**文档状态：** ✅ **V3.0 核心功能已全部完成**（2026-03-19）
**创建日期：** 2026-03-17
**更新日期：** 2026-03-19（V3.0 核心功能完成）
**提出人：** 晓刚（爸爸）
**撰写人：** 阿布
**优先级：** P0（高）
**实施状态：** ✅ 核心功能全部交付（Skills 分析、Token 预警、SystemPrompt 优化）

---

## 🎯 核心竞争力：复用基础设施 + 增强分析 🔥

**open-openclaw 的定位：**
- ✅ **复用 Control-UI 的 WSS 基础设施**（workspace、stateDir、sessions）
- ✅ **增强分析能力**（Skills 使用分析、Token 预警、SystemPrompt 优化）
- ✅ **扩展差异化功能**（PM2、多实例、Workspace 资产管理）

**暂缓功能（后期再做）：**
- ⏸️ 用户认证/登录（单用户场景够用）
- ⏸️ 多渠道告警（先用飞书）
- ⏸️ 权限控制/RBAC（单用户不需要）

---

### Control-UI 已有的 WSS 接口（可复用）

**Control-UI 通过 WebSocket 获取：**
```typescript
// Control-UI 通过 connect 请求获取
const snapshot = await gateway.request('connect', {...});
// snapshot 包含：
{
  stateDir: "/path/to/workspace",     // ← workspace 路径
  configPath: "/path/to/config.json",  // ← 配置文件路径
  // 可以基于这些路径读取文件
}
```

**open-openclaw 复用策略：**
1. ✅ 通过 WSS 获取 `stateDir` → 读取 workspace 文件（memory、inspiration、skills）
2. ✅ 通过 WSS 获取 `configPath` → 读取配置文件
3. ✅ 通过 WSS 获取会话数据 → 分析 token 用量、SystemPrompt
4. ✅ 通过 WSS 获取技能列表 → Skills 使用分析

---

### open-openclaw 的增强能力

**在 Control-UI 基础上的增强：**

| 功能 | Control-UI | open-openclaw | 增强点 |
|------|-----------|---------------|--------|
| **workspace 读取** | ⚠️ 基础路径 | ✅ 深度分析 | Memory 可视化、Inspiration 管理 |
| **Skills 管理** | ⚠️ 启用/禁用 | ✅ 使用分析 | 调用频率、重复检测、冲突检测 |
| **Token 用量** | ⚠️ 基础查询 | ✅ 阈值预警 | 实时监控、分层预警 |
| **SystemPrompt** | ❌ 无 | ✅ 可视化优化 | Token 占用分析、优化建议 |
| **PM2 集成** | ❌ 无 | ✅ 完整 | 进程管理、日志查看、一键重启 |
| **多实例** | ❌ 无 | ✅ 聚合 | 统一入口、实例切换、聚合视图 |

---

## 📌 更新记录

### 2026-03-19 V3.0 — 核心功能全部完成 ✅

**P0 核心功能已全部交付：**
- ✅ **Skills 使用分析** — 完整实现（调用频率、僵尸检测、重复检测、Token 分布、优化建议）
- ✅ **Token 阈值预警** — 完整实现（5 级阈值、实时告警、消耗速率排行、自动刷新）
- ✅ **SystemPrompt 优化** — 完整实现（可视化、Token 分解、饼图/柱状图、优化建议、一键复制）
- ✅ **用量统计增强** — 完整实现（会话列表、类型识别、用户标签）

**P1 部分实现：**
- ✅ **PM2 进程管理** — 已实现（Dashboard 集成）
- ⏳ **Workspace 资产管理** — 部分实现（Skills 分析已包含 workspace 路径读取）

**暂缓功能（后期再做）：**
- ⏸️ Memory 可视化（时间线、关键词云）
- ⏸️ Inspiration 管理（状态跟踪、转化流程）
- ⏸️ 多实例聚合（统一入口、实例切换）
- ⏸️ 历史数据分析（SQLite 持久化、长期趋势）
- ⏸️ 用户认证/登录
- ⏸️ 多渠道告警

---

### 2026-03-18 V2.2 — MVP 完成

**PRD 方向调整：聚焦核心功能，暂缓企业级特性**

### 聚焦核心差异化功能
- 🔴 **Skills 使用分析** - 调用频率、重复检测、冲突检测、SystemPrompt 优化
- 🔴 **Token 阈值预警** - 实时监控、分层预警
- 🔴 **SystemPrompt 优化** - 可视化、Token 占用分析、优化建议
- 🔴 **Workspace 资产管理** - Memory 可视化、Inspiration 管理
- 🔴 **PM2 进程管理** - 进程可视化、日志查看、一键重启
- 🔴 **多实例聚合** - 统一入口、实例切换、聚合视图

### 暂缓功能（后期再做）
- ⏸️ 用户认证/登录（单用户场景够用）
- ⏸️ 多渠道告警（先用飞书）
- ⏸️ 权限控制/RBAC（单用户不需要）
- ⏸️ 审计日志（单用户不需要）

---

## 1. Skills 使用分析（✅ 已完成）

**实现状态：** ✅ 完整实现（2026-03-19）
**前端页面：** `open-openclaw/frontend/src/pages/Skills.jsx`
**后端接口：** `/api/skills/usage`、`/api/skills/system-prompt/analysis`

### 已实现功能

#### 1.1 Skills 清单可视化 ✅
- ✅ Skills 列表（名称、描述、启用状态）
- ✅ Token 占用（SKILL.md 的 token 数量）
- ✅ 最后调用时间
- ✅ 调用次数统计
- ✅ 僵尸/重复标记（Tag 展示）

#### 1.2 调用频率分析 ✅
- ✅ 总调用次数统计
- ✅ Top 10 调用频率排行榜（柱状图）
- ✅ "僵尸 Skills"标记（超过 30 天未调用）

#### 1.3 重复/冲突检测 ✅
- ✅ 触发条件重叠检测
- ✅ 功能描述重复检测
- ✅ 重复 Skills 列表展示

#### 1.4 SystemPrompt 优化建议 ✅
- ✅ 当前 SystemPrompt 总 token 数
- ✅ 活跃/僵尸/重复 Skills Token 分布（饼图）
- ✅ 优化后节省预估（token 数、百分比）
- ✅ 具体优化建议列表

### 技术实现
```typescript
// 前端数据获取
const [skills, setSkills] = useState([]);
const [systemPrompt, setSystemPrompt] = useState(null);

// 并行加载
const [skillsRes, spRes] = await Promise.all([
  fetch('/api/skills/usage'),
  fetch('/api/skills/system-prompt/analysis'),
]);
```

---

## 2. Token 阈值预警（✅ 已完成）

**实现状态：** ✅ 完整实现（2026-03-19）
**前端页面：** `open-openclaw/frontend/src/pages/TokenMonitor.jsx`
**后端接口：** `/api/sessions/token-usage`、`/api/sessions/token-alerts/history`

### 已实现功能
- ✅ 实时监控每个 session 的 token 消耗速度
- ✅ 5 级阈值预警（normal/warning/serious/critical/limit）
- ✅ 分层预警展示（饼图分布）
- ✅ 告警历史列表（最近 5 条）
- ✅ 消耗速率排行榜（Top 10，tok/min）
- ✅ 高利用率会话列表（>50%）
- ✅ 自动刷新（30 秒间隔，可开关）
- ✅ 会话类型识别（heartbeat/cron/user）
- ✅ 用户标签展示

---

## 3. SystemPrompt 优化（✅ 已完成）

**实现状态：** ✅ 完整实现（2026-03-19）
**前端页面：** `open-openclaw/frontend/src/pages/SystemPrompt.jsx`
**后端接口：** `/api/skills/system-prompt/probe`、`/api/skills/system-prompt/analysis`

### 已实现功能
- ✅ SystemPrompt 完整可视化（Markdown 渲染，可滚动）
- ✅ Token 占用分析（按模块分解：core/project/tools_list/workspace/skills/tools_schema）
- ✅ 柱状图展示（各模块 token 占比）
- ✅ 饼图展示（活跃/僵尸/重复 Skills Token 分布）
- ✅ 可折叠详情（每个模块展开查看原文）
- ✅ 僵尸 Skills 列表（>30 天未调用）
- ✅ 重复 Skills 列表（检测重复对）
- ✅ 优化建议（节省 token 数、百分比、具体建议）
- ✅ 一键复制完整 SystemPrompt
- ✅ Workspace 文件列表（注入字符数、截断标记）

---

## 4. Workspace 资产管理（⏳ 部分实现）

**实现状态：** ⏳ 部分实现（2026-03-19）
**说明：** SystemPrompt 页面已包含 workspace 文件读取和展示，但独立的 Memory/Inspiration 管理页面尚未实现

### 已实现功能
- ✅ Workspace 路径读取（通过 Gateway WSS）
- ✅ Workspace 文件列表（SystemPrompt 页面内展示）
- ✅ 文件内容预览（可折叠查看）
- ✅ 注入字符数统计
- ✅ 截断标记

### 待实现功能（P1）
- ⏸️ Memory 可视化（时间线展示、关键词云）
- ⏸️ Inspiration 管理（状态跟踪、转化为需求）
- ⏸️ 独立文件管理页面（浏览、搜索、编辑）
- ⏸️ 资产统计面板（memory 数量、inspiration 数量、skills 活跃度）

---

## 5. PM2 进程管理（✅ 已集成）

**实现状态：** ✅ 已集成到 Dashboard（2026-03-19）
**说明：** PM2 进程状态已集成到 Dashboard 概览页面

### 已实现功能
- ✅ 进程状态可视化（运行中/停止/错误）
- ✅ 一键重启/停止/启动
- ✅ 实时日志查看（支持过滤、下载）
- ✅ 资源监控（CPU、内存占用）

---

## 6. 多实例聚合（⏸️ 暂缓）

**实现状态：** ⏸️ 暂缓（P2）
**说明：** 单用户场景下多实例需求不强烈，优先完善单实例功能

### 待实现功能
- ⏸️ 统一入口管理多个 Gateway 实例
- ⏸️ 下拉切换实例
- ⏸️ 聚合视图（所有实例的总览）
- ⏸️ 实例对比（性能、用量、健康状态）

---

## 7. 历史数据分析（⏸️ 暂缓）

**实现状态：** ⏸️ 暂缓（P2）
**说明：** 当前数据通过实时 API 获取，未做持久化存储

### 待实现功能
- ⏸️ 数据持久化（SQLite）
- ⏸️ 趋势图表（30 天/90 天/自定义）
- ⏸️ 成本分析（按会话/模型分组）
- ⏸️ 数据导出（CSV、JSON）

---

## 8. 二期功能规划（聚焦核心）

### 8.1 P0（补齐短板 + 核心竞争力）— ✅ 全部完成

| 功能 | 解决的问题 | Control-UI 状态 | 状态 |
|------|-----------|----------------|------|
| **Skills 使用分析** | skills 过多、重复、冲突 | ❌ 无 | ✅ 已完成 |
| **Token 阈值预警** | token 消耗太快，无法及时预警 | ❌ 无 | ✅ 已完成 |
| **SystemPrompt 优化** | skills 过多导致 prompt 打爆、重复内容引起 AI 混乱 | ❌ 无 | ✅ 已完成 |
| **用量统计增强** | 只有基础查询，无趋势分析 | ⚠️ 基础 | ✅ 已完成 |

**总结：** P0 核心功能全部完成（2026-03-19）

---

### 8.2 P1（Workspace 资产管理）— ⏳ 部分实现

| 功能 | 解决的问题 | Control-UI 状态 | 状态 |
|------|-----------|----------------|------|
| **Memory 可视化** | memory 文件多，无法直观看到内容 | ❌ 无 | ⏸️ 暂缓 |
| **Inspiration 管理** | 灵感记录分散，难以回顾和转化 | ❌ 无 | ⏸️ 暂缓 |
| **Workspace 文件管理** | workspace 是核心资产，但无可视化管理 | ❌ 无 | ⏳ 部分实现 |

**说明：** SystemPrompt 页面已包含 workspace 文件读取和展示，但独立的 Memory/Inspiration 管理页面尚未实现

---

### 8.3 P2（扩展功能）— ⏸️ 暂缓

| 功能 | 解决的问题 | Control-UI 状态 | 状态 |
|------|-----------|----------------|------|
| **多实例管理** | 需要切换浏览器标签查看多个实例 | ❌ 无法解决 | ⏸️ 暂缓 |
| **历史数据分析** | 只能查看 7 天，无法长期分析 | ⚠️ 受限 | ⏸️ 暂缓 |
| **成本优化建议** | 不知道如何降低 token 消耗 | ❌ 无 | ⏸️ 暂缓 |

**理由：** 单用户场景下需求不强烈，优先完善核心功能

---

### 8.4 暂缓功能（后期再做）

| 功能 | 说明 | 暂缓原因 |
|------|------|---------|
| **用户认证/登录** | JWT/OAuth 认证 | 单用户场景够用 |
| **多渠道告警** | 钉钉/短信/邮件 | 先用飞书 |
| **权限控制/RBAC** | 多用户权限管理 | 单用户不需要 |
| **审计日志** | 操作追溯 | 单用户不需要 |
| **Prometheus 集成** | 接入现有监控 | 高级需求 |

---

## 9. 总结

### open-openclaw 的核心竞争力

**最大优势：** 复用 Control-UI 的 WSS 基础设施 + 增强分析能力

**核心差异化功能（截至 2026-03-19）：**

| 功能 | 状态 | 说明 |
|------|------|------|
| Skills 使用分析 | ✅ 已完成 | 调用频率、重复检测、冲突检测、Token 分布、优化建议 |
| Token 阈值预警 | ✅ 已完成 | 5 级阈值、实时告警、消耗速率排行、自动刷新 |
| SystemPrompt 优化 | ✅ 已完成 | 可视化、Token 分解、饼图/柱状图、优化建议、一键复制 |
| 用量统计增强 | ✅ 已完成 | 会话列表、类型识别、用户标签 |
| PM2 进程管理 | ✅ 已集成 | Dashboard 集成、进程可视化、一键重启 |
| Workspace 资产管理 | ⏳ 部分实现 | SystemPrompt 页面包含 workspace 文件读取 |
| Memory 可视化 | ⏸️ 暂缓 | 时间线、关键词云 |
| Inspiration 管理 | ⏸️ 暂缓 | 状态跟踪、转化流程 |
| 多实例聚合 | ⏸️ 暂缓 | 统一入口、实例切换 |
| 历史数据分析 | ⏸️ 暂缓 | SQLite 持久化、长期趋势 |

**定位：**
- **Control-UI**：个人开发者、单实例、快速体验
- **open-openclaw**：智能预警、深度分析、SystemPrompt 优化

**竞争策略：**
1. ✅ 复用 Control-UI 的 WSS 基础设施（stateDir、configPath、sessions）
2. ✅ 聚焦核心分析（Skills 分析、Token 预警、SystemPrompt 优化）— 全部完成
3. ⏳ 扩展差异化功能（PM2、Workspace 资产管理）— 部分完成
4. ✅ 暂缓企业级功能（登录、多渠道告警、权限）— 单用户场景够用

---

### 9.1 下一步规划

**P1 优先级（可选）：**
1. Memory 可视化页面（时间线、关键词云）
2. Inspiration 管理页面（状态跟踪、转化为需求）
3. 独立 Workspace 文件管理页面

**P2 优先级（长期）：**
1. 多实例聚合（统一入口、实例切换）
2. 历史数据分析（SQLite 持久化、长期趋势）
3. 成本优化建议（按会话/模型分组）
