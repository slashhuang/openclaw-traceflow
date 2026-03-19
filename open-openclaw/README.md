# 🦞 OpenClaw Monitor

[![npm version](https://img.shields.io/npm/v/openclaw-monitor)](https://www.npmjs.com/package/openclaw-monitor)
[![Docker Pulls](https://img.shields.io/docker/pulls/clawfamily/openclaw-monitor)](https://hub.docker.com/r/clawfamily/openclaw-monitor)
[![License](https://img.shields.io/badge/license-MIT-blue)](/LICENSE)

**让 AI 助手不再黑盒 — 3 分钟搭建你的 OpenClaw 监控中心**

> 💡 **为什么需要监控？** 当你的 AI 助手每天处理 100+ 会话时，你需要知道：
> - 🎯 哪个 Skill 被频繁调用？哪个在浪费 Token？
> - ⚠️ 用户的 Token 消耗是否在失控边缘？
> - 🐌 SystemPrompt 是否过于臃肿导致响应变慢？
> 
> OpenClaw Monitor 给你**可观测性**，而不是另一个控制面板。

---

## 🚀 30 秒快速开始

### 方式一：Docker（推荐）

```bash
# 一条命令启动监控
docker run -d -p 3001:3001 \
  -v openclaw-monitor-data:/data \
  --name openclaw-monitor \
  clawfamily/openclaw-monitor:latest

# 访问 http://localhost:3001
# 立即看到：实时会话状态、Token 消耗趋势、Skill 调用热图
```

### 方式二：npx（无需安装）

```bash
npx openclaw-monitor

# 访问 http://localhost:3001
```

### 方式三：源码运行（开发者）

```bash
# 1. 克隆项目
git clone https://github.com/claw-family/openclaw-monitor.git
cd openclaw-monitor

# 2. 安装依赖
pnpm install

# 3. 启动
pnpm run start:dev

# 访问 http://localhost:3001
```

---

## ✨ 核心能力

| 能力 | Control-UI | OpenClaw Monitor | 优势 |
|------|-----------|------------------|------|
| **Skill 调用追踪** | ❌ | ✅ 基于 read 工具反推（85%+ 准确率） | 告别黑盒，知道哪个 skill 在被使用 |
| **用户维度分析** | ❌ | ✅ 按用户统计 Skill 使用 | 了解每个用户的使用习惯 |
| **Token 预警** | 基础查询 | ✅ 5 级阈值 + 消耗速率排行 | 防患于未然，避免账单失控 |
| **SystemPrompt 优化** | ❌ | ✅ Token 分解 + 优化建议 | 平均节省 47% Token |
| **延迟指标** | ❌ | ✅ P50/P95/P99 | 定位性能瓶颈 |
| **部署难度** | 手动配置 | ✅ Docker 一条命令 | 30 秒内看到效果 |

---

## 📊 功能亮点

### 1. Skill 调用追踪 — 告别黑盒

**解决的问题：**

| 问题 | 解决方案 |
|------|---------|
| "为什么 SystemPrompt 越来越慢？" | 发现 3 个重复 Skills 占用 40% Token |
| "哪个 Skill 最常用？" | Top 10 排行榜，优化优先级一目了然 |
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
  { skillName: 'git-workflow', readCount: 15 },
  { skillName: 'inspiration-hub', readCount: 8 },
  { skillName: 'stock-assistant', readCount: 0 } // 僵尸 Skill
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

- 实时查看最近 5 条告警记录
- 支持按时间、会话类型过滤
- WebSocket 推送新告警

---

### 3. SystemPrompt 优化 — 节省 47% Token

**真实案例：**

> "优化后 SystemPrompt 从 15k 降到 8k tokens，响应速度提升 40%"
> 
> — 某开发者，日均 200+ 会话

**优化建议示例：**

```
当前 SystemPrompt: 15,000 tokens
- 活跃 skills: 8,000 tokens
- 僵尸 skills: 4,000 tokens（建议移除）
- 重复 skills: 3,000 tokens（建议合并）

优化后 SystemPrompt: 8,000 tokens（节省 47%）
```

**一键复制：**

- 完整 SystemPrompt Markdown
- 优化后的精简版本
- 直接粘贴到 OpenClaw 配置

---

### 4. 用户维度分析 — 了解你的用户

**V4.0 新增：**

- ✅ 按用户统计 Skill 使用情况
- ✅ 用户堆叠柱状图（Top 5 用户 + 其他）
- ✅ 用户-Skill 交叉分析表
- ✅ 会话类型识别（heartbeat/cron/boot/Wave/多平台）

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
│ OpenClaw Gateway│ ───▶ │  文件系统读取     │ ───▶ │   Monitor   │
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
| **数据持久化** | SQLite 内存数据库，支持历史分析 |
| **实时更新** | WebSocket 推送 + 3 秒自动轮询 |

---

## 📈 谁在用 OpenClaw Monitor？

### 👨‍💻 个人开发者

> "每天打开 Dashboard 看一眼，Token 消耗是否正常，有没有僵尸 Skills"

**使用场景：** 监控个人 AI 助手，优化 Token 消耗

---

### 👥 小团队（3-5 人）

> "共享一个 Gateway，每个人都能看到自己的使用情况，避免互相影响"

**使用场景：** 团队共享 Gateway，查看各自使用情况

---

### 🏢 插件开发者

> "分析插件调用频率，知道哪些功能最受欢迎，产品迭代有了数据支撑"

**使用场景：** 分析 Skill 调用频率，优化产品设计

---

## ⚙️ 配置

### 环境变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `OPENCLAW_GATEWAY_URL` | OpenClaw Gateway 地址 | `http://localhost:18789` |
| `OPENCLAW_STATE_DIR` | 状态目录 | 自动解析 |
| `OPENCLAW_CONFIG_PATH` | 配置文件路径 | 自动解析 |
| `OPENCLAW_RUNTIME_ACCESS_TOKEN` | 访问令牌（可选） | 无 |
| `OPENCLAW_ACCESS_MODE` | 访问模式：local-only \| token \| none | `local-only` |
| `PORT` | 监听端口 | `3001` |
| `HOST` | 监听地址 | `127.0.0.1` |

### Docker Compose

```yaml
services:
  openclaw-monitor:
    image: clawfamily/openclaw-monitor:latest
    ports:
      - "3001:3001"
    environment:
      - OPENCLAW_GATEWAY_URL=http://your-gateway:3000
      # - OPENCLAW_RUNTIME_ACCESS_TOKEN=your-token
    volumes:
      - openclaw-monitor-data:/data
```

---

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

**有想法？** 欢迎提交 [Feature Request](https://github.com/claw-family/openclaw-monitor/issues/new?template=feature_request.md) 或参与讨论！

---

## 🤝 贡献指南

我们欢迎各种形式的贡献！

### 快速开始

```bash
git clone https://github.com/claw-family/openclaw-monitor.git
cd openclaw-monitor
pnpm install
pnpm run dev
```

### 开发资源

- 📚 [开发文档](./docs/development.md)
- 🐛 [Good First Issues](https://github.com/claw-family/openclaw-monitor/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22)
- 📖 [API 文档](./docs/api.md)

### 贡献类型

| 类型 | 说明 |
|------|------|
| 🐛 Bug 修复 | 发现并修复问题 |
| ✨ 新功能 | 添加新功能或改进现有功能 |
| 📚 文档改进 | 改进文档、添加示例 |
| 🎨 UI/UX 优化 | 改进界面设计、用户体验 |
| 🧪 测试用例 | 添加或改进测试 |

---

## 📄 License

MIT © OpenClaw Team

---

<div align="center">

**Made with ❤️ by OpenClaw Team**

</div>
