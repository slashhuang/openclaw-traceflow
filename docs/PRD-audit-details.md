# PRD: TraceFlow 审计明细页面

**版本**: v1.0  
**日期**: 2026-04-01  
**作者**: 阿布  
**状态**: 草稿待评审

---

## 1. 需求背景

### 1.1 当前问题

**现有 `/audit` 页面数据过于笼统**：

| 问题 | 说明 | 用户反馈 |
|------|------|---------|
| **代码交付** | 只显示 MR 数量（如"6 个 MR"） | "不知道具体是哪些 MR" |
| **问答服务** | 标签太笼统（如"general-qa: 78 次"） | "想知道具体问了什么问题" |
| **缺乏明细** | 只有聚合数据，无法追溯 | "数字好看但空洞" |

### 1.2 用户场景

**爸爸（技术管理者）需要**：
1. 查看具体哪些 MR 是通过 Bot 创建的
2. 了解团队成员具体问了什么问题
3. 追溯特定会话的审计详情
4. 评估 Bot 的实际价值和改进方向

---

## 2. 产品目标

### 2.1 核心目标

- ✅ **明细可追溯** - 每个聚合数据都能下钻到明细
- ✅ **信息有价值** - 显示 MR title、问题摘要等关键信息
- ✅ **性能可控** - 明细数据分页加载，不影响性能

### 2.2 成功指标

| 指标 | 当前 | 目标 |
|------|------|------|
| MR 明细覆盖率 | 0% | 100% |
| 问题摘要显示率 | 0% | 80%+ |
| 页面加载时间 | <2s | <3s（含明细） |

---

## 3. 功能设计

### 3.1 路由结构

**新增二级路由**：

```
/audit                     # 审计概览（现有页面，保持不变）
├── /audit/code            # 代码交付明细（新增）
├── /audit/qa              # 问答服务明细（新增）
├── /audit/automation      # 自动化运行明细（新增）
└── /audit/session/:id     # 会话详情（新增）
```

### 3.2 页面设计

#### 3.2.1 `/audit/code` - 代码交付明细

**页面布局**：
```
┌─────────────────────────────────────────────────────┐
│  📦 代码交付明细                          [导出 CSV] │
├─────────────────────────────────────────────────────┤
│  筛选：[时间范围 ▼] [发起人 ▼] [仓库 ▼] [搜索...]    │
├─────────────────────────────────────────────────────┤
│  总计：6 个 MR · 涉及 3 个仓库 · 3 位发起人          │
├─────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────┐  │
│  │ 📝 MR #95: feat(audit): 统一路径解析逻辑     │  │
│  │    发起人：黄晓刚 · 仓库：claw-sources       │  │
│  │    创建时间：2026-04-01 10:48 · Token: 82K   │  │
│  │    会话：[main/xxx](查看)                    │  │
│  └──────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────┐  │
│  │ 📝 MR #94: fix(audit): 动态解析审计目录路径  │  │
│  │    发起人：黄晓刚 · 仓库：claw-sources       │  │
│  │    创建时间：2026-04-01 10:43 · Token: 65K   │  │
│  │    会话：[main/yyy](查看)                    │  │
│  └──────────────────────────────────────────────┘  │
│  ...                                               │
└─────────────────────────────────────────────────────┘
```

**数据字段**：
| 字段 | 来源 | 说明 |
|------|------|------|
| MR IID | `events.jsonl` | MR 编号 |
| MR Title | `events.jsonl` | MR 标题（新增） |
| 发起人 | `events.jsonl.senderId` | 显示中文名 |
| 仓库 | `events.jsonl.mr.project` | 仓库名 |
| 创建时间 | `events.jsonl.timestamp` | 格式化显示 |
| Token 消耗 | `events.jsonl.tokenUsage` | input+output |
| 会话链接 | `events.jsonl.sessionId` | 跳转到会话详情 |

#### 3.2.2 `/audit/qa` - 问答服务明细

**页面布局**：
```
┌─────────────────────────────────────────────────────┐
│  💬 问答服务明细                          [导出 CSV] │
├─────────────────────────────────────────────────────┤
│  筛选：[时间范围 ▼] [用户 ▼] [标签 ▼] [搜索...]      │
├─────────────────────────────────────────────────────┤
│  总计：196 个问题 · 16 位用户 · 平均 12.3 问题/人    │
├─────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────┐  │
│  │ 👤 黄晓刚 · 2026-04-01 10:35                 │  │
│  │ 🏷️ 标签：code/mr-create                      │  │
│  │ ❓ 问题："帮我创建个 PR，修复 audit 目录路径…" │  │
│  │ 💰 Token: 82K · 会话：[main/xxx](查看)       │  │
│  └──────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────┐  │
│  │ 👤 马达 · 2026-04-01 09:20                   │  │
│  │ 🏷️ 标签：general-qa                          │  │
│  │ ❓ 问题："怎么配置 OpenClaw 的 workspace…"    │  │
│  │ 💰 Token: 15K · 会话：[main/yyy](查看)       │  │
│  └──────────────────────────────────────────────┘  │
│  ...                                               │
└─────────────────────────────────────────────────────┘
```

**数据字段**：
| 字段 | 来源 | 说明 |
|------|------|------|
| 用户 | `events.jsonl.senderId` | 显示中文名 |
| 时间 | `events.jsonl.timestamp` | 格式化显示 |
| 标签 | `events.jsonl.tags` | 多标签显示 |
| 问题摘要 | `events.jsonl.userMessage` | 截取前 100 字 |
| Token 消耗 | `events.jsonl.tokenUsage` | input+output |
| 会话链接 | `events.jsonl.sessionId` | 跳转到会话详情 |

**问题摘要规则**：
```javascript
// 截取前 100 个字符，去除 metadata 块
function summarizeQuestion(userMessage) {
  // 1. 去除 metadata 块（Conversation info 等）
  let cleaned = userMessage.replace(/Conversation info[\s\S]*?```/g, '');
  
  // 2. 截取前 100 字
  if (cleaned.length > 100) {
    return cleaned.slice(0, 100) + '...';
  }
  
  return cleaned;
}
```

#### 3.2.3 `/audit/automation` - 自动化运行明细

**页面布局**：
```
┌─────────────────────────────────────────────────────┐
│  ⚡ 自动化运行明细                        [导出 CSV] │
├─────────────────────────────────────────────────────┤
│  筛选：[时间范围 ▼] [类型 ▼] [搜索...]              │
├─────────────────────────────────────────────────────┤
│  总计：4 次运行 · 1 种类型                          │
├─────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────┐  │
│  │ 🤖 daily-ai-news · 2026-04-01 09:30         │  │
│  │ 💰 Token: 120K · 会话：[main/xxx](查看)     │  │
│  └──────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

#### 3.2.4 `/audit/session/:id` - 会话详情

**复用现有 SessionDetail 页面**，增加审计上下文：
- 显示该会话产生的审计事件
- 显示 Token 消耗
- 显示关联的 MR/问题

### 3.3 数据流

```
audit-scanner.mjs (数据生产)
    ↓
events/YYYY-MM.jsonl (原始数据)
    ↓
snapshots/latest.json (聚合快照)
    ↓
/api/audit/events (API)
    ↓
前端明细页面 (展示)
```

### 3.4 API 扩展

**新增/修改端点**：

| 端点 | 方法 | 说明 | 参数 |
|------|------|------|------|
| `/api/audit/events` | GET | 获取审计事件列表 | `month`, `type`, `senderId`, `limit`, `offset` |
| `/api/audit/code` | GET | 获取代码交付明细 | `month`, `initiator`, `repo` |
| `/api/audit/qa` | GET | 获取问答服务明细 | `month`, `userId`, `tag` |
| `/api/audit/automation` | GET | 获取自动化明细 | `month`, `type` |

**响应示例**：
```json
{
  "success": true,
  "data": [
    {
      "id": "evt-20260401-001",
      "type": "code_delivery",
      "timestamp": "2026-04-01T10:48:00+08:00",
      "senderId": "xiaogang.h",
      "senderName": "黄晓刚",
      "mr": {
        "project": "claw-sources",
        "iid": 95,
        "title": "feat(audit): 统一路径解析逻辑",
        "url": "https://github.com/slashhuang/claw-sources/pull/95",
        "sourceBranch": "feat/unify-path-resolution",
        "targetBranch": "main"
      },
      "tokenUsage": { "input": 75000, "output": 7000 },
      "sessionId": "main/xxx"
    }
  ],
  "total": 6,
  "page": 1,
  "pageSize": 20
}
```

---

## 4. 技术实现

### 4.1 后端修改

#### 4.1.1 审计事件数据结构扩展

**修改 `audit-scanner.mjs`**，提取 MR title 和问题摘要：

```javascript
// 代码交付事件
{
  type: 'code_delivery',
  // ... 现有字段
  mr: {
    project: 'claw-sources',
    iid: 95,
    title: 'feat(audit): 统一路径解析逻辑',  // ← 新增
    url: 'https://...',
    // ...
  }
}

// 问答事件
{
  type: 'qa',
  // ... 现有字段
  userMessage: '帮我创建个 PR...',  // 已有
  questionSummary: '帮我创建个 PR，修复 audit 目录路径…'  // ← 新增（截取后）
}
```

#### 4.1.2 API Controller 扩展

**新增 `AuditController` 方法**：

```typescript
@Get('code')
async getCodeDeliveryDetails(
  @Query('month') month?: string,
  @Query('initiator') initiator?: string,
  @Query('repo') repo?: string,
  @Query('page') page?: number,
  @Query('pageSize') pageSize?: number,
) {
  // 返回代码交付明细
}

@Get('qa')
async getQaDetails(
  @Query('month') month?: string,
  @Query('userId') userId?: string,
  @Query('tag') tag?: string,
  @Query('page') page?: number,
  @Query('pageSize') pageSize?: number,
) {
  // 返回问答服务明细
}
```

### 4.2 前端修改

#### 4.2.1 新增页面组件

```
frontend/src/pages/audit/
├── CodeDeliveryList.tsx      # 代码交付明细
├── QaServiceList.tsx         # 问答服务明细
├── AutomationList.tsx        # 自动化明细
└── index.tsx                 # 路由出口
```

#### 4.2.2 路由配置

```jsx
// App.jsx
<Route path="/audit" element={<Audit />} />
<Route path="/audit/code" element={<CodeDeliveryList />} />
<Route path="/audit/qa" element={<QaServiceList />} />
<Route path="/audit/automation" element={<AutomationList />} />
<Route path="/audit/session/:id" element={<SessionDetail />} />
```

#### 4.2.3 导航入口

**在 `/audit` 概览页面添加卡片点击跳转**：

```jsx
<Card 
  title="代码交付" 
  extra={<Link to="/audit/code">查看详情 →</Link>}
  onClick={() => navigate('/audit/code')}
>
  <Statistic value={snapshot.codeDelivery.totalMRs} />
</Card>
```

### 4.3 数据存储

**无需修改**，复用现有 `events/YYYY-MM.jsonl` 和 `snapshots/latest.json`。

---

## 5. 实施计划

### Phase 1：后端 API（预计 2 小时）

- [ ] 扩展 `audit-scanner.mjs` 提取 MR title
- [ ] 扩展 `audit-scanner.mjs` 生成问题摘要
- [ ] 新增 `/api/audit/code` 端点
- [ ] 新增 `/api/audit/qa` 端点
- [ ] 新增 `/api/audit/automation` 端点
- [ ] 添加分页支持

### Phase 2：前端页面（预计 3 小时）

- [ ] 创建 `CodeDeliveryList.tsx`
- [ ] 创建 `QaServiceList.tsx`
- [ ] 创建 `AutomationList.tsx`
- [ ] 配置路由
- [ ] 添加导航入口
- [ ] 添加导出 CSV 功能

### Phase 3：测试与优化（预计 1 小时）

- [ ] 后端单元测试
- [ ] 前端 E2E 测试
- [ ] 性能优化（分页、懒加载）
- [ ] 文档更新

---

## 6. 验收标准

### 6.1 功能验收

| 功能 | 验收标准 |
|------|---------|
| 代码交付明细 | 能看到每个 MR 的 title、发起人、仓库、时间 |
| 问答服务明细 | 能看到具体问题的前 100 字摘要 |
| 自动化明细 | 能看到每次自动化运行的类型和时间 |
| 筛选功能 | 能按时间、用户、仓库、标签筛选 |
| 分页功能 | 大数据量下分页加载正常 |
| 导出功能 | 能导出 CSV 文件 |

### 6.2 性能验收

| 指标 | 目标 |
|------|------|
| 页面加载时间 | <3s |
| API 响应时间 | <500ms |
| 支持数据量 | 1000+ 条明细 |

---

## 7. 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| MR title 提取失败 | 明细不完整 | 降级显示"IID #95" |
| 问题摘要过长 | 页面加载慢 | 限制 100 字 + 分页 |
| 数据量大 | 性能问题 | 按月分片 + 分页 |

---

## 8. 后续优化（Phase 2）

- [ ] 支持全文搜索（Elasticsearch）
- [ ] 支持图表可视化（问题类型分布）
- [ ] 支持导出 PDF 报告
- [ ] 支持订阅定期报告

---

**请爸爸审批 PRD，确认后可以回复「PRD 确认」，阿布开始实施！** 👧
