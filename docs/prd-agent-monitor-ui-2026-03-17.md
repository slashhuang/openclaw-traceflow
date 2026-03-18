# PRD：open-openclaw — OpenClaw 智能监控与资产管理平台

**文档状态：** ✅ **MVP 已完成**（2026-03-18）
**创建日期：** 2026-03-17
**更新日期：** 2026-03-18（V2.2 聚焦核心功能）
**提出人：** 晓刚（爸爸）
**撰写人：** 阿布
**优先级：** P0（高）
**实施状态：** MVP 已交付，二期规划调整中

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

## 📌 更新记录（2026-03-18 V2.2）

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

## 1. Skills 使用分析（🔴 P0）

### 数据源（复用 WSS 接口）

**1. 获取 Skills 列表**
```typescript
// 通过 WSS 获取 skills 列表
const skills = await gateway.request('skills.list');
// 返回：[{ name, enabled, description, triggers }, ...]
```

**2. 获取 workspace 路径**
```typescript
// 通过 WSS 获取 stateDir
const { stateDir } = await gateway.request('connect', {...});
// stateDir: "/path/to/workspace"
```

**3. 读取 Skills 配置文件**
```typescript
// 基于 stateDir 读取 SKILL.md 文件
const skillPath = `${stateDir}/skills/${skillName}/SKILL.md`;
const skillContent = await fs.readFile(skillPath, 'utf-8');
// 解析 SKILL.md 获取详细元数据
```

**4. 分析会话历史**
```typescript
// 通过 WSS 获取会话历史
const sessions = await gateway.request('sessions.list');
for (const session of sessions) {
  const history = await gateway.request('sessions.history', {
    sessionKey: session.key
  });
  // 分析 history 中的 tool calls，统计 skills 调用频率
}
```

### 功能实现

#### 1.1 Skills 清单可视化
**展示内容：**
- Skills 列表（名称、描述、启用状态）
- 触发条件（关键词、正则表达式）
- Token 占用（SKILL.md 的 token 数量）
- 最后调用时间
- 调用次数（过去 7 天/30 天）

#### 1.2 调用频率分析
**统计维度：**
- 总调用次数
- 按天/周/月调用趋势
- 调用成功率
- 平均耗时

**可视化：**
- Skills 调用频率排行榜（Top 10 / Bottom 10）
- 调用趋势图（折线图）
- "僵尸 Skills"标记（超过 30 天未调用）

#### 1.3 重复/冲突检测
**检测维度：**
- **触发条件重叠**：两个 skills 的触发关键词相同或相似
- **功能描述重复**：两个 skills 的功能描述高度相似
- **指令冲突**：两个 skills 的指令相互矛盾

**示例：**
```yaml
# Skills A
name: web-search
triggers: ["搜索", "查询", "查找"]
description: 使用百度搜索信息

# Skills B
name: bailian-web-search
triggers: ["搜索", "查询", "查找"]  # ⚠️ 触发条件完全重叠
description: 使用阿里云百炼搜索信息  # ⚠️ 功能重复

# 优化建议：合并为一个 skill，或移除其中一个
```

#### 1.4 SystemPrompt 优化建议
**分析内容：**
- 当前 SystemPrompt 总 token 数
- 每个 skill 占用的 token 数
- 僵尸 skills 占用的 token 数（可节省）
- 重复 skills 占用的 token 数（可节省）

**优化建议：**
```
当前 SystemPrompt: 15,000 tokens
- 活跃 skills: 8,000 tokens
- 僵尸 skills: 4,000 tokens（建议移除）
- 重复 skills: 3,000 tokens（建议合并）

优化后 SystemPrompt: 8,000 tokens（节省 47%）
```

---

## 2. Token 阈值预警（🔴 P0）

### 数据源（复用 WSS 接口）

**通过 WSS 获取会话数据：**
```typescript
// 获取会话列表
const sessions = await gateway.request('sessions.list');

// 获取每个会话的详情（包含 token 用量）
for (const session of sessions) {
  const status = await gateway.request('session_status', {
    sessionKey: session.key
  });
  // status 包含 token 用量信息
}
```

### 功能实现
- ✅ 实时监控每个 session 的 token 消耗速度
- ✅ 可配置阈值（50%、80%、95%、100%）
- ✅ 分层预警（黄色警告、橙色严重、红色触顶）
- ✅ 飞书通知（Gateway 挂了、token 触顶）
- ✅ 自动建议（压缩上下文、切换模型、终止会话）

---

## 3. SystemPrompt 优化（🔴 P0）

### 数据源（复用 WSS 接口）

**通过 WSS 获取配置：**
```typescript
// 获取当前配置
const config = await gateway.request('config.get');
// config 包含 skills 配置、systemPrompt 配置

// 获取 skills 详细配置
const skillsConfig = await gateway.request('skills.list');
```

### 功能实现
- ✅ SystemPrompt 可视化（树状结构展示）
- ✅ Token 占用分析（每个 skill 占用多少 token）
- ✅ 重复内容检测（识别 skills 之间的重复描述）
- ✅ 冲突检测（识别 skills 之间的指令冲突）
- ✅ 优化建议（合并重复、移除冲突、压缩描述）

---

## 4. Workspace 资产管理（🔴 P1）

### 数据源（复用 WSS 接口）

**通过 WSS 获取 workspace 路径：**
```typescript
const { stateDir } = await gateway.request('connect', {...});
// stateDir: "/path/to/workspace"

// 基于 stateDir 读取文件
const memoryFiles = await fs.readdir(`${stateDir}/memory/`);
const inspirationFiles = await fs.readdir(`${stateDir}/inspiration/`);
```

### 功能实现
- ✅ **Memory 可视化**（时间线展示、关键词云）
- ✅ **Inspiration 管理**（状态跟踪、转化为需求）
- ✅ **文件管理**（workspace 文件浏览、搜索）
- ✅ **资产统计**（memory 数量、inspiration 数量、skills 活跃度）

---

## 5. PM2 进程管理（✅ MVP 已实现）

### 功能实现
- ✅ 进程状态可视化（运行中/停止/错误）
- ✅ 一键重启/停止/启动
- ✅ 实时日志查看（支持过滤、下载）
- ✅ 资源监控（CPU、内存占用）

---

## 6. 多实例聚合（🔴 P2）

### 功能实现
- ✅ 统一入口管理多个 Gateway 实例
- ✅ 下拉切换实例
- ✅ 聚合视图（所有实例的总览）
- ✅ 实例对比（性能、用量、健康状态）

---

## 7. 历史数据分析（🔴 P2）

### 功能实现
- ✅ 数据持久化（SQLite）
- ✅ 趋势图表（30 天/90 天/自定义）
- ✅ 成本分析（按会话/模型分组）
- ✅ 数据导出（CSV、JSON）

---

## 8. 二期功能规划（聚焦核心）

### 8.1 P0（补齐短板 + 核心竞争力）

| 功能 | 解决的问题 | Control-UI 状态 | 预计工期 |
|------|-----------|----------------|---------|
| **Skills 使用分析** | skills 过多、重复、冲突 | ❌ 无 | 3 天 |
| **Token 阈值预警** | token 消耗太快，无法及时预警 | ❌ 无 | 3 天 |
| **SystemPrompt 优化** | skills 过多导致 prompt 打爆、重复内容引起 AI 混乱 | ❌ 无 | 3 天 |
| **用量统计增强** | 只有基础查询，无趋势分析 | ⚠️ 基础 | 2 天 |

**理由：** 这是用户最高频需求，Control-UI 已验证，但缺少预警和优化功能

---

### 8.2 P1（Workspace 资产管理）

| 功能 | 解决的问题 | Control-UI 状态 | 预计工期 |
|------|-----------|----------------|---------|
| **Memory 可视化** | memory 文件多，无法直观看到内容 | ❌ 无 | 3 天 |
| **Inspiration 管理** | 灵感记录分散，难以回顾和转化 | ❌ 无 | 2 天 |
| **Workspace 文件管理** | workspace 是核心资产，但无可视化管理 | ❌ 无 | 3 天 |

**理由：** Workspace 是用户的核心资产，Control-UI 完全忽略了这个领域

---

### 8.3 P2（扩展功能）

| 功能 | 解决的问题 | Control-UI 状态 | 预计工期 |
|------|-----------|----------------|---------|
| **多实例管理** | 需要切换浏览器标签查看多个实例 | ❌ 无法解决 | 3 天 |
| **历史数据分析** | 只能查看 7 天，无法长期分析 | ⚠️ 受限 | 3 天 |
| **成本优化建议** | 不知道如何降低 token 消耗 | ❌ 无 | 3 天 |

**理由：** 扩展功能，提升用户体验

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

**核心差异化功能：**
1. ✅ Skills 使用分析（调用频率、重复检测、冲突检测）
2. ✅ Token 阈值预警（实时监控、分层预警）
3. ✅ SystemPrompt 优化（可视化、优化建议）
4. ✅ Workspace 资产管理（Memory、Inspiration、文件管理）
5. ✅ PM2 进程管理（进程可视化、一键重启）
6. ✅ 多实例聚合（统一入口、聚合视图）

**定位：**
- **Control-UI**：个人开发者、单实例、快速体验
- **open-openclaw**：智能预警、资产管理、PM2 集成

**竞争策略：**
1. 复用 Control-UI 的 WSS 基础设施（stateDir、configPath、sessions）
2. 聚焦核心分析（Skills 分析、Token 预警、SystemPrompt 优化）
3. 扩展差异化功能（PM2、Workspace 资产管理）
4. 暂缓企业级功能（登录、多渠道告警、权限）
