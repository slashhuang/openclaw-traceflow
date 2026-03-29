# PRD: OpenClaw Audit System (TraceFlow 2.0)

**版本**: v1.0  
**日期**: 2026-03-29  
**作者**: 阿布  
**状态**: 草稿待评审  

---

## 1. 产品愿景

### 1.1 定位

**TraceFlow 不是 Dashboard，是 OpenClaw 的 Audit 系统**

- **Dashboard** = 只读，让人"看"数据
- **Audit System** = 可读 + 可写 + 可评估，让人"理解 + 改进"系统行为

### 1.2 核心价值

帮助人类用户**审计、理解、优化**OpenClaw Gateway 的会话行为，通过**效果 + 效率**双维度评估，提供 AI 驱动的洞察和改进建议。

### 1.3 设计原则

| 原则 | 说明 |
|------|------|
| **效果优先** | 任务完成度 > 响应速度 |
| **效率并重** | 在保证效果的前提下优化资源消耗 |
| **可追溯** | 所有评估、修改、变更都有记录 |
| **可对比** | 支持版本对比、前后对比 |
| **可操作** | 洞察必须能转化为具体行动 |

---

## 2. 用户画像与场景

### 2.1 核心用户

| 用户 | 身份 | 核心需求 |
|------|------|---------|
| **爸爸** | OpenClaw 开发者/运维 | 掌控 Gateway 运行状态，快速定位问题 |
| **开发者** | 使用 OpenClaw 构建应用 | 调试 Agent 行为，优化 System Prompt |
| **运维人员** | 监控生产环境 | 检测异常会话，保障服务质量 |

### 2.2 核心场景

#### 场景 1: 会话质量审计
> "刚才那个会话为什么失败了？"

1. 用户打开 TraceFlow，找到目标会话
2. 点击「评估」按钮
3. 系统异步评估，显示 loading 状态
4. 评估完成，展示效果/效率分数 + AI 洞察
5. 用户根据建议采取行动（调整 prompt、优化配置等）

#### 场景 2: System Prompt 优化
> "这个 prompt 版本效果怎么样？要不要回滚？"

1. 用户在 System Prompt 页面选择某个版本
2. 点击「评估」，系统采样最近 N 个会话进行评估
3. 评估结果展示：效果分数、效率分数、与历史版本对比
4. 用户决定：应用新版本 / 回滚到旧版本 / 继续调整

#### 场景 3: 异常检测与告警
> "过去 1 小时有没有异常会话？"

1. 用户打开 TraceFlow 首页
2. 系统展示「异常会话列表」（自动标记）
3. 用户点击会话，查看 AI 评估报告
4. 定位根因，采取行动

#### 场景 4: 趋势分析
> "最近一周，会话质量是在上升还是下降？"

1. 用户选择时间范围（如过去 7 天）
2. 系统展示趋势图：效果分数、效率分数、错误率
3. AI 洞察：「周三之后延迟上升，可能与 X 模型有关」
4. 用户根据洞察调整配置

---

## 3. 核心功能

### 3.1 功能架构

```
┌─────────────────────────────────────────────────────────┐
│                    OpenClaw Audit System                │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐              │
│  │   会话审计      │  │  Prompt 审计     │              │
│  │  - 会话评估     │  │  - Prompt 评估   │              │
│  │  - 异常检测     │  │  - 版本对比      │              │
│  │  - 历史追溯     │  │  - 效果分析      │              │
│  └─────────────────┘  └─────────────────┘              │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────┐   │
│  │              AI 评估引擎                         │   │
│  │  - 效果评估 (任务完成度、准确性、满意度)        │   │
│  │  - 效率评估 (延迟、Token 效率、轮次效率)        │   │
│  │  - 洞察生成 (优势、改进建议、根因分析)          │   │
│  └─────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐              │
│  │   编辑能力      │  │  分析能力       │              │
│  │  - Prompt 编辑   │  │  - 趋势分析     │              │
│  │  - 配置调整     │  │  - 聚合报告     │              │
│  │  - 版本回滚     │  │  - 对比分析     │              │
│  └─────────────────┘  └─────────────────┘              │
└─────────────────────────────────────────────────────────┘
```

### 3.2 效果评估指标

| 指标 | 定义 | 计算方式 | 权重 |
|------|------|---------|------|
| **任务完成度** | 用户问题是否被解决 | LLM 判断会话是否有明确结论 | 40% |
| **响应准确性** | 回答是否准确、无幻觉 | 错误日志 + LLM 判断矛盾性 | 30% |
| **用户满意度** | 用户是否满意 | 会话是否提前终止 + 情感分析 | 20% |
| **一致性** | 多轮对话是否自洽 | LLM 判断前后矛盾 | 10% |

### 3.3 效率评估指标

| 指标 | 定义 | 计算方式 | 权重 |
|------|------|---------|------|
| **响应延迟** | 响应速度 | 平均 latency_ms | 40% |
| **Token 效率** | 资源利用效率 | output_tokens / (input + output) | 30% |
| **轮次效率** | 任务完成轮数 | 少轮次完成 = 高效 | 20% |
| **重试次数** | 稳定性 | retry_count = 0 最优 | 10% |

### 3.4 评估等级

| 分数 | 等级 | 颜色 | 说明 |
|------|------|------|------|
| 90-100 | S | 🟢 | 优秀，无需优化 |
| 80-89 | A | 🟢 | 良好，小幅优化 |
| 70-79 | B | 🟡 | 中等，建议优化 |
| 60-69 | C | 🟡 | 及格，需要优化 |
| <60 | D | 🔴 | 差，必须优化 |

---

## 4. 数据模型

### 4.1 目录结构

```
openclaw-traceflow/
├── data/
│   ├── evaluations/
│   │   ├── sessions/
│   │   │   └── {session_id}/
│   │   │       ├── index.json          # 评估索引
│   │   │       ├── eval-{id}.json      # 评估记录
│   │   │       └── eval-{id}.json      # 多次评估
│   │   │
│   │   └── system-prompts/
│   │       └── {prompt_id}/
│   │           ├── index.json          # 评估索引
│   │           ├── eval-{id}.json      # 评估记录
│   │           └── versions.json       # Prompt 版本历史
│   │
│   └── metrics/
│       └── aggregated/
│           ├── daily-{date}.json       # 日报
│           └── weekly-{week}.json      # 周报
│
└── src/
    ├── evaluators/
    │   ├── session-evaluator.ts
    │   └── prompt-evaluator.ts
    ├── stores/
    │   ├── evaluation-store.ts
    │   └── metrics-store.ts
    └── services/
        ├── audit-service.ts
        └── insight-service.ts
```

### 4.2 评估记录 Schema

#### 会话评估记录

```typescript
interface SessionEvaluation {
  // 基础信息
  evaluationId: string;           // eval-001
  sessionId: string;              // session-abc123
  evaluatedAt: string;            // ISO 8601
  evaluatedBy: string;            // open_id
  evaluatorModel: string;         // bailian/qwen3.5-plus
  
  // 评估指标
  metrics: {
    effectiveness: {
      score: number;              // 0-100
      taskCompleted: boolean;
      hasError: boolean;
      errorMessage?: string;
      userSatisfaction: 'positive' | 'neutral' | 'negative';
      consistency: boolean;
    };
    efficiency: {
      score: number;              // 0-100
      avgLatencyMs: number;
      totalInputTokens: number;
      totalOutputTokens: number;
      tokenEfficiencyRatio: number;
      turnCount: number;
      retryCount: number;
    };
    overall: {
      score: number;              // 0-100
      grade: 'S' | 'A' | 'B' | 'C' | 'D';
    };
  };
  
  // AI 洞察
  aiInsights: {
    summary: string;              // 1-2 句话总结
    strengths: string[];          // 优势列表
    improvements: string[];       // 改进建议
    rootCause?: string;           // 根因分析（如果有问题）
  };
  
  // 元数据
  metadata: {
    evaluationVersion: string;    // 评估逻辑版本
    promptVersion: string;        // 评估用 Prompt 版本
    sessionSnapshot: {
      turnCount: number;
      startTime: string;
      endTime: string;
      model?: string;
    };
  };
}
```

#### System Prompt 评估记录

```typescript
interface PromptEvaluation {
  // 基础信息
  evaluationId: string;
  promptId: string;
  promptVersion: string;          // v1, v2, v3...
  evaluatedAt: string;
  evaluatedBy: string;
  evaluatorModel: string;
  
  // 评估范围
  evaluationScope: {
    sampleSessionIds: string[];   // 采样的会话 ID
    sampleSize: number;
    timeRange: {
      start: string;
      end: string;
    };
  };
  
  // 评估指标
  metrics: {
    effectiveness: {
      score: number;
      avgTaskCompletionRate: number;
      avgErrorRate: number;
    };
    efficiency: {
      score: number;
      avgLatencyMs: number;
      avgInputTokens: number;
      avgOutputTokens: number;
      avgTurnCount: number;
    };
    overall: {
      score: number;
      grade: 'S' | 'A' | 'B' | 'C' | 'D';
    };
  };
  
  // AI 洞察
  aiInsights: {
    summary: string;
    strengths: string[];
    improvements: string[];
    comparisonWithPrevious?: {
      previousVersion: string;
      scoreChange: number;        // +5 / -3
      keyChanges: string[];
    };
  };
  
  // 元数据
  metadata: {
    evaluationVersion: string;
    promptVersion: string;        // 评估用 Prompt 版本
    promptSnapshot: string;       // 评估时的 Prompt 内容
  };
}
```

#### 评估索引

```typescript
interface EvaluationIndex {
  sessionId: string;              // 或 promptId
  evaluations: Array<{
    evaluationId: string;
    evaluatedAt: string;
    overallScore: number;
    grade: string;
    evaluatedBy: string;
  }>;
  latestEvaluation: {
    evaluationId: string;
    overallScore: number;
    grade: string;
    evaluatedAt: string;
  } | null;
}
```

---

## 5. 技术架构

### 5.1 系统架构

```
┌─────────────────────────────────────────────────────────┐
│                      TraceFlow UI                       │
│  (React + SystemPrompt.jsx + SessionList.jsx)          │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│                   API Layer (Backend)                   │
│  - evaluation.controller.ts                             │
│  - audit.controller.ts                                  │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│                   Service Layer                         │
│  ┌─────────────────┐  ┌─────────────────┐              │
│  │ AuditService    │  │ InsightService  │              │
│  │ - evaluate()    │  │ - generate()    │              │
│  │ - compare()     │  │ - summarize()   │              │
│  └─────────────────┘  └─────────────────┘              │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│                   Evaluator Layer                       │
│  ┌─────────────────┐  ┌─────────────────┐              │
│  │ SessionEvaluator│  │ PromptEvaluator │              │
│  │ - scan session  │  │ - sample sessions│             │
│  │ - extract metrics│  │ - aggregate     │              │
│  │ - call LLM      │  │ - call LLM      │              │
│  └─────────────────┘  └─────────────────┘              │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│                   Storage Layer                         │
│  ┌─────────────────┐  ┌─────────────────┐              │
│  │ EvaluationStore │  │ MetricsStore    │              │
│  │ - JSONL files   │  │ - aggregated    │              │
│  └─────────────────┘  └─────────────────┘              │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│                   Gateway Data Source                   │
│  - Session JSONL files                                  │
│  - Model: bailian/qwen3.5-plus (for evaluation)         │
└─────────────────────────────────────────────────────────┘
```

### 5.2 评估流程

```
用户点击「评估」
        │
        ▼
┌──────────────────┐
│ 创建评估任务      │
│ - 生成 evaluationId│
│ - 状态：pending   │
└──────────────────┘
        │
        ▼
┌──────────────────┐
│ 异步执行评估      │
│ 1. 扫描会话数据   │
│ 2. 提取指标       │
│ 3. 调用 LLM 评估   │
│ 4. 生成洞察       │
└──────────────────┘
        │
        ▼
┌──────────────────┐
│ 保存评估结果      │
│ - eval-XXX.json   │
│ - 更新 index.json │
└──────────────────┘
        │
        ▼
┌──────────────────┐
│ 通知 UI 更新      │
│ - 轮询/推送       │
│ - 显示结果        │
└──────────────────┘
```

### 5.3 API 设计

```typescript
// 会话评估 API
POST /api/sessions/:sessionId/evaluations
  → { evaluationId, status: 'pending' }

GET /api/sessions/:sessionId/evaluations
  → { evaluations: EvaluationSummary[], latest: EvaluationSummary }

GET /api/sessions/:sessionId/evaluations/:evaluationId
  → EvaluationDetail

DELETE /api/sessions/:sessionId/evaluations/:evaluationId
  → { success: true }

// System Prompt 评估 API
POST /api/prompts/:promptId/evaluations
  → { evaluationId, status: 'pending' }

GET /api/prompts/:promptId/evaluations
  → { evaluations: EvaluationSummary[], latest: EvaluationSummary }

GET /api/prompts/:promptId/evaluations/:evaluationId
  → EvaluationDetail

// 版本对比 API
GET /api/prompts/:promptId/compare?versionA=v1&versionB=v2
  → ComparisonResult
```

---

## 6. 产品路线图

### Phase 1: 基础评估能力 (2026-04)

**目标**: 实现会话和 System Prompt 的基础评估功能

| 任务 | 说明 | 优先级 |
|------|------|--------|
| 设计数据结构 | 确定 JSON schema | P0 |
| 实现 EvaluationStore | 评估存储层 | P0 |
| 实现 SessionEvaluator | 会话评估器 | P0 |
| 实现 PromptEvaluator | Prompt 评估器 | P0 |
| UI 集成：评估按钮 | SystemPrompt.jsx + SessionDetail.jsx | P0 |
| UI 集成：结果展示 | 分数、洞察、建议 | P0 |
| 异步任务处理 | loading 状态 + 完成通知 | P0 |

**交付物**:
- ✅ 用户可以点击按钮评估会话
- ✅ 用户可以点击按钮评估 System Prompt
- ✅ 评估结果可查看、可追溯

---

### Phase 2: 对比与趋势 (2026-05)

**目标**: 支持版本对比和趋势分析

| 任务 | 说明 | 优先级 |
|------|------|--------|
| 版本对比功能 | Prompt v1 vs v2 | P1 |
| 历史评估列表 | 查看多次评估记录 | P1 |
| 趋势分析图 | 效果/效率分数趋势 | P1 |
| 聚合报告 | 日报/周报 | P1 |
| 评估 Prompt 版本管理 | 记录评估用的 Prompt 版本 | P1 |

**交付物**:
- ✅ 用户可以对比不同 Prompt 版本的效果
- ✅ 用户可以看到会话质量趋势
- ✅ 用户可以查看历史评估记录

---

### Phase 3: 智能洞察与自动化 (2026-06)

**目标**: AI 驱动的自动洞察和告警

| 任务 | 说明 | 优先级 |
|------|------|--------|
| 异常会话自动标记 | AI 自动识别低质量会话 | P2 |
| 根因分析 | 自动分析错误原因 | P2 |
| 优化建议自动应用 | 一键应用 AI 建议 | P2 |
| 告警推送 | 飞书/钉钉通知异常 | P2 |
| 配置回滚 | 一键回滚到历史版本 | P2 |

**交付物**:
- ✅ 系统自动标记异常会话
- ✅ AI 提供根因分析和优化建议
- ✅ 用户可以一键应用建议或回滚配置

---

### Phase 4: 协议化与开放 (2026-07+)

**目标**: 成为 OpenClaw 会话数据的协议层

| 任务 | 说明 | 优先级 |
|------|------|--------|
| 开放 API | 外部系统可调用评估能力 | P3 |
| CLI 工具 | `traceflow evaluate <session-id>` | P3 |
| MCP Server | 集成到 Agent 工作流 | P3 |
| 会话数据标准 | 定义标准解读方式 | P3 |

**交付物**:
- ✅ 其他 Agent 可以调用 TraceFlow 的评估能力
- ✅ TraceFlow 成为 OpenClaw 会话数据的标准协议

---

## 7. 成功指标

### 7.1 产品指标

| 指标 | 目标 | 测量方式 |
|------|------|---------|
| 评估使用率 | >50% 的活跃用户使用评估功能 | 埋点统计 |
| 评估满意度 | >80% 用户认为评估有帮助 | 用户反馈 |
| 平均响应时间 | 评估完成 <10 秒 | 性能监控 |
| Prompt 优化率 | 使用评估后，Prompt 迭代效率提升 30% | 对比分析 |

### 7.2 技术指标

| 指标 | 目标 | 测量方式 |
|------|------|---------|
| 评估准确率 | >85% 与人工评估一致 | 抽样对比 |
| 系统可用性 | >99% | 监控告警 |
| 数据存储可靠性 | 100% 评估记录可追溯 | 定期审计 |

---

## 8. 风险与依赖

### 8.1 风险

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| 评估成本高 | LLM 调用产生 token 费用 | 限制评估频率、优化评估 Prompt |
| 评估准确性低 | 用户不信任评估结果 | 持续优化评估 Prompt、人工校准 |
| 性能问题 | 评估过程慢 | 异步处理、优化扫描逻辑 |

### 8.2 依赖

| 依赖 | 说明 | 状态 |
|------|------|------|
| Gateway 会话数据 | JSONL 格式稳定 | ✅ 已有 |
| LLM 评估能力 | bailian/qwen3.5-plus | ✅ 已有 |
| session-jsonl-scan.ts | 会话扫描模块 | ✅ 已有 |
| transcript-message-content.ts | 消息内容提取 | ✅ 已有 |

---

## 9. 附录

### 9.1 评估 Prompt 模板（草案）

```
你是一个 OpenClaw 会话质量评估专家。请根据以下信息评估这个会话：

【会话信息】
- 会话 ID: {sessionId}
- 时间范围：{startTime} - {endTime}
- 总轮数：{turnCount}
- 使用模型：{model}

【效果指标】
- 任务完成度：{taskCompleted ? '完成' : '未完成'}
- 是否有错误：{hasError ? errorMessage : '无'}
- 用户满意度：{userSatisfaction}

【效率指标】
- 平均延迟：{avgLatencyMs}ms
- Token 消耗：input={totalInputTokens}, output={totalOutputTokens}
- Token 效率：{tokenEfficiencyRatio}
- 重试次数：{retryCount}

【评估要求】
1. 给出效果分数（0-100）
2. 给出效率分数（0-100）
3. 给出综合分数（0-100）和等级（S/A/B/C/D）
4. 用 1-2 句话总结会话质量
5. 列出 2-3 个优势
6. 列出 2-3 个改进建议

【输出格式】
请严格按照以下 JSON 格式输出：
{
  "effectiveness": { "score": 85, ... },
  "efficiency": { "score": 72, ... },
  "overall": { "score": 79, "grade": "B" },
  "aiInsights": {
    "summary": "...",
    "strengths": ["...", "..."],
    "improvements": ["...", "..."]
  }
}
```

---

## 10. 可行性分析

### 10.1 技术可行性

#### ✅ 已有能力复用

| 模块 | 位置 | 状态 | 可复用度 |
|------|------|------|---------|
| **session-jsonl-scan.ts** | `src/openclaw/session-jsonl-scan.ts` | ✅ 已实现 | 90% (需扩展指标提取) |
| **transcript-message-content.ts** | `src/openclaw/transcript-message-content.ts` | ✅ 已实现 | 80% (需适配评估场景) |
| **openclaw.service.ts** | `src/openclaw/openclaw.service.ts` | ✅ 已实现 | 70% (需增加评估接口) |
| **SystemPrompt.jsx** | `frontend/src/pages/SystemPrompt.jsx` | ✅ 已实现 | 60% (需增加评估 UI) |

#### ✅ 技术栈匹配

| 技术需求 | TraceFlow 现有栈 | 匹配度 |
|---------|-----------------|--------|
| 文件存储 | Node.js fs 模块 | ✅ 完全匹配 |
| JSON 处理 | TypeScript 原生支持 | ✅ 完全匹配 |
| 异步任务 | Node.js Promise/async-await | ✅ 完全匹配 |
| LLM 调用 | 已有 Gateway 集成 | ✅ 完全匹配 |
| React UI | 现有前端框架 | ✅ 完全匹配 |

#### ⚠️ 需要新增的模块

| 模块 | 说明 | 复杂度 | 预计工时 |
|------|------|--------|---------|
| **EvaluationStore** | 评估数据存储层 | 中 | 2 天 |
| **SessionEvaluator** | 会话评估器 | 中 | 3 天 |
| **PromptEvaluator** | Prompt 评估器 | 中 | 3 天 |
| **AuditService** | 审计服务层 | 中 | 2 天 |
| **评估 API** | RESTful 接口 | 低 | 1 天 |
| **评估 UI 组件** | 前端组件 | 中 | 3 天 |

**总工时估算**: Phase 1 约 **14 人天** (约 3 周)

---

### 10.2 数据可行性

#### ✅ Gateway 会话数据完整性

Gateway JSONL 会话数据包含评估所需的全部字段：

```json
{
  "id": "session-abc123",
  "messages": [
    {
      "role": "user",
      "content": "...",
      "timestamp": "2026-03-29T16:00:00+08:00"
    },
    {
      "role": "assistant",
      "content": "...",
      "timestamp": "2026-03-29T16:00:02+08:00",
      "metadata": {
        "model": "bailian/qwen3.5-plus",
        "latency_ms": 1850,
        "input_tokens": 250,
        "output_tokens": 180,
        "retry_count": 0
      }
    }
  ]
}
```

**可提取指标**:
- ✅ 延迟：`metadata.latency_ms`
- ✅ Token 消耗：`metadata.input_tokens + output_tokens`
- ✅ 重试次数：`metadata.retry_count`
- ✅ 模型信息：`metadata.model`
- ✅ 会话轮数：`messages.length / 2`
- ✅ 错误信息：从异常消息提取

#### ⚠️ 需要 LLM 判断的指标

| 指标 | 评估方式 | 可靠性 |
|------|---------|--------|
| 任务完成度 | LLM 分析会话内容 | 🟡 85%+ (需优化 Prompt) |
| 响应准确性 | LLM 判断矛盾性 | 🟡 80%+ (需人工校准) |
| 用户满意度 | LLM 情感分析 | 🟡 75%+ (需结合行为数据) |
| 一致性 | LLM 对比多轮对话 | 🟡 85%+ |

**缓解措施**:
- 持续优化评估 Prompt
- 提供「标记为不准确」按钮，收集反馈
- 定期人工抽样校准

---

### 10.3 性能可行性

#### 评估耗时分析

| 步骤 | 操作 | 预计耗时 |
|------|------|---------|
| 1. 扫描会话数据 | 读取 JSONL 文件 | 50-200ms (取决于会话大小) |
| 2. 提取指标 | 计算延迟、Token 等 | 10-50ms |
| 3. 调用 LLM 评估 | API 请求 | 2-5 秒 (主要耗时) |
| 4. 解析并保存结果 | 写入 JSON 文件 | 10-50ms |
| **总计** | | **3-6 秒** |

**优化策略**:
- ✅ 异步处理：不阻塞 UI
- ✅ 进度反馈：每 500ms 轮询状态
- ✅ 超时保护：>30 秒自动失败
- ✅ 并发限制：同时最多 5 个评估任务

#### 存储容量估算

| 数据类型 | 单次大小 | 日增量 | 年增量 |
|---------|---------|--------|--------|
| 会话评估记录 | ~2KB | 100 次 × 2KB = 200KB | ~70MB |
| Prompt 评估记录 | ~3KB | 20 次 × 3KB = 60KB | ~20MB |
| 索引文件 | ~1KB | 120 次 × 1KB = 120KB | ~40MB |
| **总计** | | ~380KB/天 | ~130MB/年 |

**结论**: 存储成本可忽略，无需特殊优化

---

### 10.4 成本可行性

#### LLM 调用成本

| 评估类型 | Token 消耗 | 单次成本 | 日成本 (100 次) |
|---------|-----------|---------|----------------|
| 会话评估 | ~500 input + ~200 output | ¥0.002 | ¥0.2 |
| Prompt 评估 | ~2000 input + ~500 output | ¥0.008 | ¥0.16 (20 次) |
| **总计** | | | **¥0.36/天** |

**年成本估算**: ¥0.36 × 365 ≈ **¥130/年**

**结论**: 成本极低，无需限制评估频率

---

### 10.5 风险评估

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| 评估结果不准确 | 中 | 中 | 提供反馈按钮、持续优化 Prompt |
| 评估耗时过长 | 低 | 低 | 异步处理、超时保护 |
| 存储文件冲突 | 低 | 低 | 使用唯一 evaluationId、原子写入 |
| LLM API 不稳定 | 中 | 中 | 重试机制、降级方案 |
| 用户不信任 AI 评估 | 中 | 中 | 提供人工评估选项、透明化评估逻辑 |

---

## 11. 具体技术方案

### 11.1 目录结构详解

```
openclaw-traceflow/
├── data/
│   ├── evaluations/
│   │   ├── sessions/
│   │   │   └── {session_id}/
│   │   │       ├── index.json              # 评估索引 (必选)
│   │   │       ├── eval-{evaluationId}.json # 评估记录
│   │   │       └── .lock                   # 写入锁 (临时)
│   │   │
│   │   └── system-prompts/
│   │       └── {prompt_id}/
│   │           ├── index.json              # 评估索引 (必选)
│   │           ├── eval-{evaluationId}.json # 评估记录
│   │           ├── versions.json           # Prompt 版本历史
│   │           └── .lock                   # 写入锁 (临时)
│   │
│   └── metrics/
│       └── aggregated/
│           ├── daily-{YYYY-MM-DD}.json     # 日报
│           └── weekly-{YYYY-Www}.json      # 周报
│
├── src/
│   ├── evaluators/
│   │   ├── session-evaluator.ts            # 会话评估器
│   │   ├── prompt-evaluator.ts             # Prompt 评估器
│   │   ├── evaluation-prompt.ts            # 评估 Prompt 模板
│   │   └── index.ts                        # 导出
│   │
│   ├── stores/
│   │   ├── evaluation-store.ts             # 评估存储层
│   │   ├── metrics-store.ts                # 指标存储层
│   │   └── index.ts                        # 导出
│   │
│   ├── services/
│   │   ├── audit-service.ts                # 审计服务
│   │   ├── insight-service.ts              # 洞察服务
│   │   └── index.ts                        # 导出
│   │
│   ├── controllers/
│   │   ├── evaluation.controller.ts        # 评估 API 控制器
│   │   └── audit.controller.ts             # 审计 API 控制器
│   │
│   ├── types/
│   │   ├── evaluation.ts                   # 评估类型定义
│   │   └── index.ts                        # 导出
│   │
│   └── utils/
│       ├── async-task-queue.ts             # 异步任务队列
│       ├── file-lock.ts                    # 文件锁工具
│       └── index.ts                        # 导出
│
└── frontend/
    └── src/
        ├── components/
        │   ├── evaluation/
        │   │   ├── EvaluationButton.tsx    # 评估按钮组件
        │   │   ├── EvaluationResult.tsx    # 评估结果展示
        │   │   ├── EvaluationHistory.tsx   # 历史评估列表
        │   │   ├── ScoreGauge.tsx          # 分数仪表盘
        │   │   └── index.ts                # 导出
        │   │
        │   └── audit/
        │       ├── SessionAuditPanel.tsx   # 会话审计面板
        │       └── PromptAuditPanel.tsx    # Prompt 审计面板
        │
        └── pages/
            ├── SystemPrompt.jsx            # 改造：增加评估功能
            └── SessionDetail.jsx           # 改造：增加评估功能
```

---

### 11.2 核心模块实现

#### 11.2.1 类型定义 (`src/types/evaluation.ts`)

```typescript
// 评估等级
export type EvaluationGrade = 'S' | 'A' | 'B' | 'C' | 'D';

// 评估状态
export type EvaluationStatus = 'pending' | 'running' | 'completed' | 'failed';

// 用户满意度
export type UserSatisfaction = 'positive' | 'neutral' | 'negative';

// 会话评估记录
export interface SessionEvaluation {
  evaluationId: string;
  sessionId: string;
  evaluatedAt: string;
  evaluatedBy: string;
  evaluatorModel: string;
  status: EvaluationStatus;
  
  metrics: {
    effectiveness: {
      score: number;
      taskCompleted: boolean;
      hasError: boolean;
      errorMessage?: string;
      userSatisfaction: UserSatisfaction;
      consistency: boolean;
    };
    efficiency: {
      score: number;
      avgLatencyMs: number;
      totalInputTokens: number;
      totalOutputTokens: number;
      tokenEfficiencyRatio: number;
      turnCount: number;
      retryCount: number;
    };
    overall: {
      score: number;
      grade: EvaluationGrade;
    };
  };
  
  aiInsights: {
    summary: string;
    strengths: string[];
    improvements: string[];
    rootCause?: string;
  };
  
  metadata: {
    evaluationVersion: string;
    promptVersion: string;
    sessionSnapshot: {
      turnCount: number;
      startTime: string;
      endTime: string;
      model?: string;
    };
  };
}

// Prompt 评估记录
export interface PromptEvaluation {
  evaluationId: string;
  promptId: string;
  promptVersion: string;
  evaluatedAt: string;
  evaluatedBy: string;
  evaluatorModel: string;
  status: EvaluationStatus;
  
  evaluationScope: {
    sampleSessionIds: string[];
    sampleSize: number;
    timeRange: {
      start: string;
      end: string;
    };
  };
  
  metrics: {
    effectiveness: {
      score: number;
      avgTaskCompletionRate: number;
      avgErrorRate: number;
    };
    efficiency: {
      score: number;
      avgLatencyMs: number;
      avgInputTokens: number;
      avgOutputTokens: number;
      avgTurnCount: number;
    };
    overall: {
      score: number;
      grade: EvaluationGrade;
    };
  };
  
  aiInsights: {
    summary: string;
    strengths: string[];
    improvements: string[];
    comparisonWithPrevious?: {
      previousVersion: string;
      scoreChange: number;
      keyChanges: string[];
    };
  };
  
  metadata: {
    evaluationVersion: string;
    promptVersion: string;
    promptSnapshot: string;
  };
}

// 评估索引
export interface EvaluationIndex {
  resourceId: string;
  resourceType: 'session' | 'prompt';
  evaluations: Array<{
    evaluationId: string;
    evaluatedAt: string;
    overallScore: number;
    grade: EvaluationGrade;
    evaluatedBy: string;
    status: EvaluationStatus;
  }>;
  latestEvaluation: {
    evaluationId: string;
    overallScore: number;
    grade: EvaluationGrade;
    evaluatedAt: string;
  } | null;
}

// 评估请求
export interface CreateEvaluationRequest {
  resourceId: string;
  resourceType: 'session' | 'prompt';
  options?: {
    sampleSize?: number;
    timeRange?: { start: string; end: string };
  };
}

// 评估响应
export interface CreateEvaluationResponse {
  evaluationId: string;
  status: EvaluationStatus;
  message?: string;
}
```

---

#### 11.2.2 评估存储层 (`src/stores/evaluation-store.ts`)

```typescript
import * as fs from 'fs/promises';
import * as path from 'path';
import { SessionEvaluation, PromptEvaluation, EvaluationIndex, EvaluationGrade } from '../types/evaluation';

export class EvaluationStore {
  private readonly dataDir: string;
  
  constructor(dataDir: string) {
    this.dataDir = dataDir;
  }
  
  // 获取会话评估目录
  private getSessionDir(sessionId: string): string {
    return path.join(this.dataDir, 'evaluations', 'sessions', sessionId);
  }
  
  // 获取 Prompt 评估目录
  private getPromptDir(promptId: string): string {
    return path.join(this.dataDir, 'evaluations', 'system-prompts', promptId);
  }
  
  // 确保目录存在
  private async ensureDir(dir: string): Promise<void> {
    await fs.mkdir(dir, { recursive: true });
  }
  
  // 获取索引文件路径
  private getIndexFilePath(dir: string): string {
    return path.join(dir, 'index.json');
  }
  
  // 获取评估文件路径
  private getEvaluationFilePath(dir: string, evaluationId: string): string {
    return path.join(dir, `eval-${evaluationId}.json`);
  }
  
  // 读取索引
  async readIndex(resourceType: 'session' | 'prompt', resourceId: string): Promise<EvaluationIndex | null> {
    const dir = resourceType === 'session' 
      ? this.getSessionDir(resourceId)
      : this.getPromptDir(resourceId);
    
    const indexPath = this.getIndexFilePath(dir);
    
    try {
      const content = await fs.readFile(indexPath, 'utf-8');
      return JSON.parse(content) as EvaluationIndex;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }
  
  // 写入索引（原子操作）
  async writeIndex(resourceType: 'session' | 'prompt', resourceId: string, index: EvaluationIndex): Promise<void> {
    const dir = resourceType === 'session'
      ? this.getSessionDir(resourceId)
      : this.getPromptDir(resourceId);
    
    await this.ensureDir(dir);
    
    const indexPath = this.getIndexFilePath(dir);
    const tempPath = indexPath + '.tmp';
    
    // 原子写入：先写临时文件，再重命名
    await fs.writeFile(tempPath, JSON.stringify(index, null, 2), 'utf-8');
    await fs.rename(tempPath, indexPath);
  }
  
  // 读取评估记录
  async readEvaluation(
    resourceType: 'session' | 'prompt',
    resourceId: string,
    evaluationId: string
  ): Promise<SessionEvaluation | PromptEvaluation | null> {
    const dir = resourceType === 'session'
      ? this.getSessionDir(resourceId)
      : this.getPromptDir(resourceId);
    
    const filePath = this.getEvaluationFilePath(dir, evaluationId);
    
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content) as SessionEvaluation | PromptEvaluation;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }
  
  // 写入评估记录
  async writeEvaluation(
    resourceType: 'session' | 'prompt',
    resourceId: string,
    evaluation: SessionEvaluation | PromptEvaluation
  ): Promise<void> {
    const dir = resourceType === 'session'
      ? this.getSessionDir(resourceId)
      : this.getPromptDir(resourceId);
    
    await this.ensureDir(dir);
    
    const filePath = this.getEvaluationFilePath(dir, evaluation.evaluationId);
    const tempPath = filePath + '.tmp';
    
    // 原子写入
    await fs.writeFile(tempPath, JSON.stringify(evaluation, null, 2), 'utf-8');
    await fs.rename(tempPath, filePath);
    
    // 更新索引
    await this.updateIndex(resourceType, resourceId, evaluation);
  }
  
  // 更新索引
  private async updateIndex(
    resourceType: 'session' | 'prompt',
    resourceId: string,
    evaluation: SessionEvaluation | PromptEvaluation
  ): Promise<void> {
    let index = await this.readIndex(resourceType, resourceId);
    
    if (!index) {
      index = {
        resourceId,
        resourceType,
        evaluations: [],
        latestEvaluation: null,
      };
    }
    
    // 添加或更新评估记录
    const existingIndex = index.evaluations.findIndex(e => e.evaluationId === evaluation.evaluationId);
    const summary = {
      evaluationId: evaluation.evaluationId,
      evaluatedAt: evaluation.evaluatedAt,
      overallScore: evaluation.metrics.overall.score,
      grade: evaluation.metrics.overall.grade,
      evaluatedBy: evaluation.evaluatedBy,
      status: evaluation.status,
    };
    
    if (existingIndex >= 0) {
      index.evaluations[existingIndex] = summary;
    } else {
      index.evaluations.push(summary);
    }
    
    // 排序：最新的在前
    index.evaluations.sort((a, b) => 
      new Date(b.evaluatedAt).getTime() - new Date(a.evaluatedAt).getTime()
    );
    
    // 更新最新评估
    index.latestEvaluation = {
      evaluationId: index.evaluations[0].evaluationId,
      overallScore: index.evaluations[0].overallScore,
      grade: index.evaluations[0].grade,
      evaluatedAt: index.evaluations[0].evaluatedAt,
    };
    
    await this.writeIndex(resourceType, resourceId, index);
  }
  
  // 列出所有评估记录
  async listEvaluations(
    resourceType: 'session' | 'prompt',
    resourceId: string
  ): Promise<Array<{ evaluationId: string; evaluatedAt: string; overallScore: number; grade: EvaluationGrade }>> {
    const index = await this.readIndex(resourceType, resourceId);
    if (!index) {
      return [];
    }
    return index.evaluations;
  }
  
  // 删除评估记录
  async deleteEvaluation(
    resourceType: 'session' | 'prompt',
    resourceId: string,
    evaluationId: string
  ): Promise<void> {
    const dir = resourceType === 'session'
      ? this.getSessionDir(resourceId)
      : this.getPromptDir(resourceId);
    
    const filePath = this.getEvaluationFilePath(dir, evaluationId);
    
    try {
      await fs.unlink(filePath);
      
      // 更新索引
      const index = await this.readIndex(resourceType, resourceId);
      if (index) {
        index.evaluations = index.evaluations.filter(e => e.evaluationId !== evaluationId);
        index.latestEvaluation = index.evaluations.length > 0 ? {
          evaluationId: index.evaluations[0].evaluationId,
          overallScore: index.evaluations[0].overallScore,
          grade: index.evaluations[0].grade,
          evaluatedAt: index.evaluations[0].evaluatedAt,
        } : null;
        await this.writeIndex(resourceType, resourceId, index);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }
}
```

---

#### 11.2.3 会话评估器 (`src/evaluators/session-evaluator.ts`)

```typescript
import { SessionEvaluation, EvaluationGrade, UserSatisfaction } from '../types/evaluation';
import { sessionJsonlScan } from '../openclaw/session-jsonl-scan';
import { EvaluationStore } from '../stores/evaluation-store';

interface SessionMetrics {
  turnCount: number;
  hasError: boolean;
  errorMessage?: string;
  avgLatencyMs: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  retryCount: number;
  tokenEfficiencyRatio: number;
  startTime: string;
  endTime: string;
  model?: string;
}

export class SessionEvaluator {
  private readonly store: EvaluationStore;
  private readonly evaluationPromptVersion: string = 'eval-prompt-v1';
  
  constructor(store: EvaluationStore) {
    this.store = store;
  }
  
  // 扫描会话并提取指标
  private async extractMetrics(sessionId: string): Promise<SessionMetrics> {
    const session = await sessionJsonlScan(sessionId);
    
    const messages = session.messages;
    const assistantMessages = messages.filter(m => m.role === 'assistant');
    
    // 计算指标
    const turnCount = Math.floor(messages.length / 2);
    const hasError = messages.some(m => 
      m.role === 'assistant' && m.metadata?.error
    );
    const errorMessage = hasError 
      ? messages.find(m => m.role === 'assistant' && m.metadata?.error)?.metadata?.error 
      : undefined;
    
    const latencies = assistantMessages
      .map(m => m.metadata?.latency_ms)
      .filter((l): l is number => l !== undefined);
    const avgLatencyMs = latencies.length > 0
      ? latencies.reduce((a, b) => a + b, 0) / latencies.length
      : 0;
    
    const totalInputTokens = assistantMessages
      .reduce((sum, m) => sum + (m.metadata?.input_tokens || 0), 0);
    const totalOutputTokens = assistantMessages
      .reduce((sum, m) => sum + (m.metadata?.output_tokens || 0), 0);
    const tokenEfficiencyRatio = totalInputTokens + totalOutputTokens > 0
      ? totalOutputTokens / (totalInputTokens + totalOutputTokens)
      : 0;
    
    const retryCount = assistantMessages
      .reduce((sum, m) => sum + (m.metadata?.retry_count || 0), 0);
    
    const startTime = messages[0]?.timestamp || '';
    const endTime = messages[messages.length - 1]?.timestamp || '';
    const model = assistantMessages[0]?.metadata?.model;
    
    return {
      turnCount,
      hasError,
      errorMessage,
      avgLatencyMs,
      totalInputTokens,
      totalOutputTokens,
      retryCount,
      tokenEfficiencyRatio,
      startTime,
      endTime,
      model,
    };
  }
  
  // 计算效果分数
  private calculateEffectivenessScore(metrics: SessionMetrics, llmAnalysis: any): number {
    const weights = {
      taskCompletion: 0.4,
      accuracy: 0.3,
      satisfaction: 0.2,
      consistency: 0.1,
    };
    
    const taskScore = llmAnalysis.taskCompleted ? 100 : 40;
    const accuracyScore = metrics.hasError ? 30 : (llmAnalysis.hasHallucination ? 60 : 100);
    const satisfactionScore = {
      positive: 100,
      neutral: 70,
      negative: 30,
    }[llmAnalysis.userSatisfaction] || 70;
    const consistencyScore = llmAnalysis.isConsistent ? 100 : 50;
    
    return Math.round(
      taskScore * weights.taskCompletion +
      accuracyScore * weights.accuracy +
      satisfactionScore * weights.satisfaction +
      consistencyScore * weights.consistency
    );
  }
  
  // 计算效率分数
  private calculateEfficiencyScore(metrics: SessionMetrics): number {
    const weights = {
      latency: 0.4,
      tokenEfficiency: 0.3,
      turnEfficiency: 0.2,
      retry: 0.1,
    };
    
    // 延迟分数：<2s=100, <5s=80, <10s=60, >10s=40
    let latencyScore = 100;
    if (metrics.avgLatencyMs > 10000) latencyScore = 40;
    else if (metrics.avgLatencyMs > 5000) latencyScore = 60;
    else if (metrics.avgLatencyMs > 2000) latencyScore = 80;
    
    // Token 效率分数：ratio > 0.5=100, >0.4=80, >0.3=60
    let tokenScore = 100;
    if (metrics.tokenEfficiencyRatio < 0.3) tokenScore = 60;
    else if (metrics.tokenEfficiencyRatio < 0.4) tokenScore = 80;
    
    // 轮次效率分数：<5 轮=100, <10 轮=80, >=10 轮=60
    let turnScore = 100;
    if (metrics.turnCount >= 10) turnScore = 60;
    else if (metrics.turnCount >= 5) turnScore = 80;
    
    // 重试分数：0 次=100, 1 次=70, >1 次=40
    let retryScore = 100;
    if (metrics.retryCount > 1) retryScore = 40;
    else if (metrics.retryCount === 1) retryScore = 70;
    
    return Math.round(
      latencyScore * weights.latency +
      tokenScore * weights.tokenEfficiency +
      turnScore * weights.turnEfficiency +
      retryScore * weights.retry
    );
  }
  
  // 计算等级
  private calculateGrade(score: number): EvaluationGrade {
    if (score >= 90) return 'S';
    if (score >= 80) return 'A';
    if (score >= 70) return 'B';
    if (score >= 60) return 'C';
    return 'D';
  }
  
  // 调用 LLM 进行评估
  private async callLLM(sessionId: string, metrics: SessionMetrics): Promise<any> {
    // TODO: 调用 Gateway LLM API
    // 这里使用伪代码，实际实现需要调用 Gateway
    const prompt = this.buildEvaluationPrompt(sessionId, metrics);
    
    // const response = await gatewayLLM.evaluate({
    //   prompt,
    //   model: 'bailian/qwen3.5-plus',
    //   temperature: 0.1,
    // });
    
    // 临时返回模拟数据
    return {
      taskCompleted: true,
      hasHallucination: false,
      userSatisfaction: 'positive' as UserSatisfaction,
      isConsistent: true,
      summary: '会话整体质量良好，任务完成，响应速度正常',
      strengths: ['用户问题得到完整解答', '无错误发生', 'Token 使用效率较高'],
      improvements: ['第 3 轮响应延迟较高，建议优化', '可以考虑减少冗余的开场白'],
    };
  }
  
  // 构建评估 Prompt
  private buildEvaluationPrompt(sessionId: string, metrics: SessionMetrics): string {
    return `你是一个 OpenClaw 会话质量评估专家。请根据以下信息评估这个会话：

【会话信息】
- 会话 ID: ${sessionId}
- 时间范围：${metrics.startTime} - ${metrics.endTime}
- 总轮数：${metrics.turnCount}
- 使用模型：${metrics.model || '未知'}

【效率指标】
- 平均延迟：${metrics.avgLatencyMs.toFixed(0)}ms
- Token 消耗：input=${metrics.totalInputTokens}, output=${metrics.totalOutputTokens}
- Token 效率：${metrics.tokenEfficiencyRatio.toFixed(2)}
- 重试次数：${metrics.retryCount}

【评估要求】
1. 判断任务是否完成
2. 判断是否有错误或幻觉
3. 判断用户满意度（positive/neutral/negative）
4. 判断多轮对话是否一致
5. 用 1-2 句话总结会话质量
6. 列出 2-3 个优势
7. 列出 2-3 个改进建议

请严格按照以下 JSON 格式输出：
{
  "taskCompleted": boolean,
  "hasHallucination": boolean,
  "userSatisfaction": "positive" | "neutral" | "negative",
  "isConsistent": boolean,
  "summary": "string",
  "strengths": ["string", "string"],
  "improvements": ["string", "string"]
}`;
  }
  
  // 执行评估
  async evaluate(sessionId: string, evaluatedBy: string): Promise<SessionEvaluation> {
    const evaluationId = `eval-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const evaluatedAt = new Date().toISOString();
    
    // 1. 提取指标
    const metrics = await this.extractMetrics(sessionId);
    
    // 2. 调用 LLM 评估
    const llmAnalysis = await this.callLLM(sessionId, metrics);
    
    // 3. 计算分数
    const effectivenessScore = this.calculateEffectivenessScore(metrics, llmAnalysis);
    const efficiencyScore = this.calculateEfficiencyScore(metrics);
    const overallScore = Math.round(effectivenessScore * 0.6 + efficiencyScore * 0.4);
    const overallGrade = this.calculateGrade(overallScore);
    
    // 4. 构建评估记录
    const evaluation: SessionEvaluation = {
      evaluationId,
      sessionId,
      evaluatedAt,
      evaluatedBy,
      evaluatorModel: 'bailian/qwen3.5-plus',
      status: 'completed',
      metrics: {
        effectiveness: {
          score: effectivenessScore,
          taskCompleted: llmAnalysis.taskCompleted,
          hasError: metrics.hasError,
          errorMessage: metrics.errorMessage,
          userSatisfaction: llmAnalysis.userSatisfaction,
          consistency: llmAnalysis.isConsistent,
        },
        efficiency: {
          score: efficiencyScore,
          avgLatencyMs: metrics.avgLatencyMs,
          totalInputTokens: metrics.totalInputTokens,
          totalOutputTokens: metrics.totalOutputTokens,
          tokenEfficiencyRatio: metrics.tokenEfficiencyRatio,
          turnCount: metrics.turnCount,
          retryCount: metrics.retryCount,
        },
        overall: {
          score: overallScore,
          grade: overallGrade,
        },
      },
      aiInsights: {
        summary: llmAnalysis.summary,
        strengths: llmAnalysis.strengths,
        improvements: llmAnalysis.improvements,
        rootCause: metrics.hasError ? metrics.errorMessage : undefined,
      },
      metadata: {
        evaluationVersion: '1.0',
        promptVersion: this.evaluationPromptVersion,
        sessionSnapshot: {
          turnCount: metrics.turnCount,
          startTime: metrics.startTime,
          endTime: metrics.endTime,
          model: metrics.model,
        },
      },
    };
    
    // 5. 保存评估结果
    await this.store.writeEvaluation('session', sessionId, evaluation);
    
    return evaluation;
  }
  
  // 获取评估历史
  async getEvaluationHistory(sessionId: string) {
    return await this.store.listEvaluations('session', sessionId);
  }
  
  // 获取单次评估详情
  async getEvaluation(sessionId: string, evaluationId: string) {
    return await this.store.readEvaluation('session', sessionId, evaluationId);
  }
  
  // 获取最新评估
  async getLatestEvaluation(sessionId: string) {
    const index = await this.store.readIndex('session', sessionId);
    if (!index || !index.latestEvaluation) {
      return null;
    }
    return await this.store.readEvaluation('session', sessionId, index.latestEvaluation.evaluationId);
  }
}
```

---

#### 11.2.4 异步任务队列 (`src/utils/async-task-queue.ts`)

```typescript
interface Task<T> {
  id: string;
  fn: () => Promise<T>;
  resolve: (result: T) => void;
  reject: (error: Error) => void;
}

interface TaskResult<T> {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: T;
  error?: string;
  createdAt: number;
  completedAt?: number;
}

export class AsyncTaskQueue {
  private readonly queue: Task<any>[] = [];
  private readonly results: Map<string, TaskResult<any>> = new Map();
  private running = 0;
  private readonly maxConcurrent: number;
  
  constructor(maxConcurrent: number = 5) {
    this.maxConcurrent = maxConcurrent;
  }
  
  // 添加任务
  add<T>(fn: () => Promise<T>, timeoutMs: number = 30000): Promise<T> {
    const id = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    
    // 初始化任务状态
    this.results.set(id, {
      id,
      status: 'pending',
      createdAt: Date.now(),
    });
    
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ id, fn, resolve, reject });
      this.processQueue();
      
      // 超时保护
      setTimeout(() => {
        const result = this.results.get(id);
        if (result && result.status === 'pending' || result.status === 'running') {
          this.results.set(id, {
            ...result,
            status: 'failed',
            error: 'Task timeout',
            completedAt: Date.now(),
          });
          reject(new Error('Task timeout'));
        }
      }, timeoutMs);
    });
  }
  
  // 处理队列
  private async processQueue() {
    while (this.running < this.maxConcurrent && this.queue.length > 0) {
      const task = this.queue.shift()!;
      this.running++;
      
      // 更新任务状态
      const result = this.results.get(task.id);
      if (result) {
        this.results.set(task.id, {
          ...result,
          status: 'running',
        });
      }
      
      // 执行任务
      task.fn()
        .then(res => {
          const result = this.results.get(task.id);
          if (result) {
            this.results.set(task.id, {
              ...result,
              status: 'completed',
              result: res,
              completedAt: Date.now(),
            });
          }
          task.resolve(res);
        })
        .catch(err => {
          const result = this.results.get(task.id);
          if (result) {
            this.results.set(task.id, {
              ...result,
              status: 'failed',
              error: err.message,
              completedAt: Date.now(),
            });
          }
          task.reject(err);
        })
        .finally(() => {
          this.running--;
          this.processQueue();
        });
    }
  }
  
  // 获取任务状态
  getTaskStatus<T>(id: string): TaskResult<T> | undefined {
    return this.results.get(id) as TaskResult<T> | undefined;
  }
  
  // 清理已完成的任务
  cleanup(maxAgeMs: number = 3600000) {
    const now = Date.now();
    for (const [id, result] of this.results.entries()) {
      if (result.completedAt && now - result.completedAt > maxAgeMs) {
        this.results.delete(id);
      }
    }
  }
}

// 全局任务队列实例
export const evaluationTaskQueue = new AsyncTaskQueue(5);
```

---

#### 11.2.5 API 控制器 (`src/controllers/evaluation.controller.ts`)

```typescript
import { Request, Response } from 'express';
import { SessionEvaluator } from '../evaluators/session-evaluator';
import { PromptEvaluator } from '../evaluators/prompt-evaluator';
import { evaluationTaskQueue } from '../utils/async-task-queue';
import { EvaluationStore } from '../stores/evaluation-store';

export class EvaluationController {
  private readonly sessionEvaluator: SessionEvaluator;
  private readonly promptEvaluator: PromptEvaluator;
  
  constructor(dataDir: string) {
    const store = new EvaluationStore(dataDir);
    this.sessionEvaluator = new SessionEvaluator(store);
    this.promptEvaluator = new PromptEvaluator(store);
  }
  
  // 创建会话评估
  async createSessionEvaluation(req: Request, res: Response) {
    const { sessionId } = req.params;
    const { userId } = req.body; // 从认证中间件获取
    
    try {
      // 异步执行评估
      const evaluationPromise = evaluationTaskQueue.add(() =>
        this.sessionEvaluator.evaluate(sessionId, userId)
      );
      
      // 立即返回任务 ID
      res.json({
        success: true,
        message: '评估任务已提交',
        // 任务 ID 可以从 promise 获取，这里简化处理
      });
      
      // 等待评估完成（后台执行）
      await evaluationPromise;
    } catch (error) {
      res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  }
  
  // 获取会话评估历史
  async getSessionEvaluations(req: Request, res: Response) {
    const { sessionId } = req.params;
    
    try {
      const evaluations = await this.sessionEvaluator.getEvaluationHistory(sessionId);
      res.json({
        success: true,
        data: evaluations,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  }
  
  // 获取单次评估详情
  async getSessionEvaluation(req: Request, res: Response) {
    const { sessionId, evaluationId } = req.params;
    
    try {
      const evaluation = await this.sessionEvaluator.getEvaluation(sessionId, evaluationId);
      if (!evaluation) {
        res.status(404).json({
          success: false,
          error: '评估记录不存在',
        });
        return;
      }
      res.json({
        success: true,
        data: evaluation,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  }
  
  // 获取最新评估
  async getLatestSessionEvaluation(req: Request, res: Response) {
    const { sessionId } = req.params;
    
    try {
      const evaluation = await this.sessionEvaluator.getLatestEvaluation(sessionId);
      if (!evaluation) {
        res.status(404).json({
          success: false,
          error: '暂无评估记录',
        });
        return;
      }
      res.json({
        success: true,
        data: evaluation,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  }
  
  // 删除评估记录
  async deleteSessionEvaluation(req: Request, res: Response) {
    const { sessionId, evaluationId } = req.params;
    
    try {
      // TODO: 实现删除逻辑
      res.json({
        success: true,
        message: '评估记录已删除',
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  }
  
  // Prompt 评估方法类似...
}
```

---

### 11.3 前端组件实现

#### 11.3.1 评估按钮组件 (`frontend/src/components/evaluation/EvaluationButton.tsx`)

```tsx
import React, { useState } from 'react';
import { Button, Spinner, Toast } from '@fluentui/react-components';

interface EvaluationButtonProps {
  resourceId: string;
  resourceType: 'session' | 'prompt';
  onEvaluationComplete: (evaluationId: string) => void;
}

export const EvaluationButton: React.FC<EvaluationButtonProps> = ({
  resourceId,
  resourceType,
  onEvaluationComplete,
}) => {
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null);
  
  const handleEvaluate = async () => {
    setIsEvaluating(true);
    
    try {
      // 1. 提交评估任务
      const response = await fetch(`/api/${resourceType}s/${resourceId}/evaluations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: getCurrentUserId() }),
      });
      
      if (!response.ok) {
        throw new Error('评估提交失败');
      }
      
      // 2. 轮询任务状态
      const pollInterval = setInterval(async () => {
        const statusResponse = await fetch(`/api/${resourceType}s/${resourceId}/evaluations/latest`);
        const data = await statusResponse.json();
        
        if (data.success && data.data.status === 'completed') {
          clearInterval(pollInterval);
          setIsEvaluating(false);
          Toast.success('评估完成！');
          onEvaluationComplete(data.data.evaluationId);
        } else if (data.success && data.data.status === 'failed') {
          clearInterval(pollInterval);
          setIsEvaluating(false);
          Toast.error('评估失败：' + data.data.error);
        }
      }, 1000);
      
      setPollingInterval(pollInterval);
      
    } catch (error) {
      setIsEvaluating(false);
      Toast.error('评估提交失败：' + (error as Error).message);
    }
  };
  
  return (
    <Button
      onClick={handleEvaluate}
      disabled={isEvaluating}
      icon={isEvaluating ? <Spinner size="tiny" /> : undefined}
    >
      {isEvaluating ? '评估中...' : '🔄 评估'}
    </Button>
  );
};
```

---

#### 11.3.2 评估结果展示组件 (`frontend/src/components/evaluation/EvaluationResult.tsx`)

```tsx
import React from 'react';
import { Card, Text, Progress } from '@fluentui/react-components';
import { SessionEvaluation } from '../../../src/types/evaluation';

interface EvaluationResultProps {
  evaluation: SessionEvaluation;
}

export const EvaluationResult: React.FC<EvaluationResultProps> = ({ evaluation }) => {
  const getGradeColor = (grade: string) => {
    switch (grade) {
      case 'S': return '#107c10'; // 绿色
      case 'A': return '#107c10';
      case 'B': return '#ffb900'; // 黄色
      case 'C': return '#ffb900';
      case 'D': return '#d13438'; // 红色
      default: return '#605e5c';
    }
  };
  
  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
        {/* 综合评分 */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ 
            fontSize: '48px', 
            fontWeight: 'bold',
            color: getGradeColor(evaluation.metrics.overall.grade),
          }}>
            {evaluation.metrics.overall.score}
          </div>
          <div style={{ 
            fontSize: '24px',
            color: getGradeColor(evaluation.metrics.overall.grade),
          }}>
            {evaluation.metrics.overall.grade}
          </div>
        </div>
        
        {/* 详细指标 */}
        <div style={{ flex: 1 }}>
          <Text weight="bold">效果分数</Text>
          <Progress 
            value={evaluation.metrics.effectiveness.score} 
            max={100}
            color={evaluation.metrics.effectiveness.score >= 80 ? 'success' : 'warning'}
          />
          <Text>{evaluation.metrics.effectiveness.score} / 100</Text>
          
          <Text weight="bold" style={{ marginTop: '10px' }}>效率分数</Text>
          <Progress 
            value={evaluation.metrics.efficiency.score} 
            max={100}
            color={evaluation.metrics.efficiency.score >= 80 ? 'success' : 'warning'}
          />
          <Text>{evaluation.metrics.efficiency.score} / 100</Text>
        </div>
      </div>
      
      {/* AI 洞察 */}
      <div style={{ marginTop: '20px' }}>
        <Text weight="bold">💡 AI 洞察</Text>
        <Text>{evaluation.aiInsights.summary}</Text>
        
        <Text weight="bold" style={{ marginTop: '10px' }}>✅ 优势</Text>
        <ul>
          {evaluation.aiInsights.strengths.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
        
        <Text weight="bold" style={{ marginTop: '10px' }}>💪 改进建议</Text>
        <ul>
          {evaluation.aiInsights.improvements.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
      </div>
      
      {/* 评估元数据 */}
      <div style={{ marginTop: '20px', fontSize: '12px', color: '#666' }}>
        评估时间：{new Date(evaluation.evaluatedAt).toLocaleString()} |
        评估模型：{evaluation.evaluatorModel} |
        Prompt 版本：{evaluation.metadata.promptVersion}
      </div>
    </Card>
  );
};
```

---

## 12. 执行细节补充（无歧义规范）

### 12.1 评估 Prompt 完整版 (`src/evaluators/evaluation-prompt.ts`)

**目的**: 确保每次评估使用一致的 Prompt，便于版本管理和效果对比。

```typescript
/**
 * 会话评估 Prompt 模板 v1.0
 * 
 * 设计原则:
 * 1. 明确角色定位：评估专家
 * 2. 提供充分上下文：会话指标 + 关键消息
 * 3. 清晰的评估维度：效果 + 效率
 * 4. 严格的输出格式：JSON，便于解析
 * 5. 防止幻觉：要求基于事实判断
 */

export const SESSION_EVALUATION_PROMPT_V1 = `你是一个 OpenClaw 会话质量评估专家。你的任务是基于客观数据和会话内容，评估会话的质量和效率。

## 评估原则
1. **客观公正**: 基于提供的数据和内容判断，不臆测
2. **效果优先**: 任务完成度 > 响应速度
3. **事实依据**: 每个判断都要有数据或内容支撑
4. **建设性**: 改进建议要具体、可操作

## 输入数据
{context}

## 评估维度

### 效果维度 (60% 权重)
1. **任务完成度 (40%)**: 用户的问题是否被完整解答？
   - 完成：有明确结论/解决方案，用户未继续追问
   - 未完成：问题悬而未决，或用户明确表示不满意

2. **响应准确性 (30%)**: 回答是否准确、无事实错误、无自相矛盾？
   - 准确：无明显错误，逻辑自洽
   - 有瑕疵：小错误或不精确，但不影响整体理解
   - 有严重问题：事实错误、幻觉、自相矛盾

3. **用户满意度 (20%)**: 从会话行为推断用户满意度
   - positive: 会话自然结束，用户有正面反馈
   - neutral: 会话正常结束，无明显情绪
   - negative: 用户提前终止、表达不满、重复追问

4. **一致性 (10%)**: 多轮对话是否前后一致？
   - 一致：前后回答无矛盾
   - 不一致：存在明显矛盾或立场变化

### 效率维度 (40% 权重)
1. **响应延迟 (40%)**: 
   - < 2000ms: 优秀 (100 分)
   - 2000-5000ms: 良好 (80 分)
   - 5000-10000ms: 及格 (60 分)
   - > 10000ms: 差 (40 分)

2. **Token 效率 (30%)**: output / (input + output)
   - > 0.5: 优秀 (100 分)
   - 0.4-0.5: 良好 (80 分)
   - 0.3-0.4: 及格 (60 分)
   - < 0.3: 差 (40 分)

3. **轮次效率 (20%)**: 完成任务所需轮数
   - < 5 轮：优秀 (100 分)
   - 5-9 轮：良好 (80 分)
   - 10-14 轮：及格 (60 分)
   - ≥ 15 轮：差 (40 分)

4. **重试次数 (10%)**: 
   - 0 次：优秀 (100 分)
   - 1 次：及格 (70 分)
   - > 1 次：差 (40 分)

## 输出要求

请严格按照以下 JSON 格式输出，不要包含任何额外文本：

{
  "effectiveness": {
    "taskCompleted": boolean,
    "taskCompletionReason": "string (一句话解释判断依据)",
    "hasHallucination": boolean,
    "hasContradiction": boolean,
    "accuracyLevel": "high" | "medium" | "low",
    "userSatisfaction": "positive" | "neutral" | "negative",
    "satisfactionReason": "string (一句话解释判断依据)",
    "isConsistent": boolean
  },
  "efficiency": {
    "latencyScore": number (0-100),
    "tokenEfficiencyScore": number (0-100),
    "turnEfficiencyScore": number (0-100),
    "retryScore": number (0-100)
  },
  "aiInsights": {
    "summary": "string (1-2 句话，客观描述会话质量)",
    "strengths": ["string (具体优势，最多 3 条)"],
    "improvements": ["string (具体改进建议，最多 3 条)"],
    "rootCause": "string (如果有错误，根因分析；否则为空)"
  }
}

## 注意事项
1. 所有判断必须基于提供的数据，不要臆测
2. 如果数据不足以判断，请在对应字段说明
3. 改进建议要具体，例如"第 3 轮响应延迟 3500ms，建议优化 XX 环节"
4. 避免模糊表述，如"可能"、"也许"，用确定性语言`;

/**
 * 构建会话评估上下文
 */
export function buildSessionEvaluationContext(
  sessionId: string,
  metrics: any,
  keyMessages: Array<{ role: string; content: string; timestamp: string }>
): string {
  return `### 会话基本信息
- 会话 ID: ${sessionId}
- 时间范围：${metrics.startTime} 至 ${metrics.endTime}
- 总轮数：${metrics.turnCount}
- 使用模型：${metrics.model || '未知'}

### 效率指标
- 平均延迟：${metrics.avgLatencyMs.toFixed(0)}ms
- Token 消耗：输入 ${metrics.totalInputTokens} tokens，输出 ${metrics.totalOutputTokens} tokens
- Token 效率比：${metrics.tokenEfficiencyRatio.toFixed(2)}
- 重试次数：${metrics.retryCount}
- 是否有错误：${metrics.hasError ? '是 (' + metrics.errorMessage + ')' : '否'}

### 关键消息摘要
${keyMessages.map((m, i) => `
--- 第${Math.ceil((i + 1) / 2)}轮 ---
[${m.role}]: ${m.content.slice(0, 200)}${m.content.length > 200 ? '...' : ''}
`).join('\n')}
`;
}

export const EVALUATION_PROMPT_VERSIONS = {
  'eval-prompt-v1': SESSION_EVALUATION_PROMPT_V1,
};
```

---

### 12.2 LLM 输出解析与容错

**问题**: LLM 可能输出无效 JSON，需要容错处理。

```typescript
/**
 * 解析 LLM 评估结果（带容错）
 */
async function parseLLMEvaluationResponse(responseText: string): Promise<any> {
  // 尝试 1: 直接解析
  try {
    const parsed = JSON.parse(responseText.trim());
    return validateAndFillDefaults(parsed);
  } catch (e) {
    // 尝试 2: 提取 JSON 代码块
    const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1].trim());
        return validateAndFillDefaults(parsed);
      } catch (e2) {
        // 尝试 3: 提取大括号内容
        const braceMatch = responseText.match(/\{[\s\S]*\}/);
        if (braceMatch) {
          try {
            const parsed = JSON.parse(braceMatch[0].trim());
            return validateAndFillDefaults(parsed);
          } catch (e3) {
            // 失败：返回默认值
            return getFallbackEvaluation();
          }
        }
      }
    }
    // 失败：返回默认值
    return getFallbackEvaluation();
  }
}

/**
 * 验证并填充默认值（确保字段完整）
 */
function validateAndFillDefaults(data: any): any {
  return {
    effectiveness: {
      taskCompleted: data.effectiveness?.taskCompleted ?? false,
      taskCompletionReason: data.effectiveness?.taskCompletionReason ?? '无法判断',
      hasHallucination: data.effectiveness?.hasHallucination ?? false,
      hasContradiction: data.effectiveness?.hasContradiction ?? false,
      accuracyLevel: data.effectiveness?.accuracyLevel ?? 'medium',
      userSatisfaction: data.effectiveness?.userSatisfaction ?? 'neutral',
      satisfactionReason: data.effectiveness?.satisfactionReason ?? '无法判断',
      isConsistent: data.effectiveness?.isConsistent ?? true,
    },
    efficiency: {
      latencyScore: data.efficiency?.latencyScore ?? 50,
      tokenEfficiencyScore: data.efficiency?.tokenEfficiencyScore ?? 50,
      turnEfficiencyScore: data.efficiency?.turnEfficiencyScore ?? 50,
      retryScore: data.efficiency?.retryScore ?? 50,
    },
    aiInsights: {
      summary: data.aiInsights?.summary ?? '评估完成，但洞察生成失败',
      strengths: data.aiInsights?.strengths ?? ['无明显优势'],
      improvements: data.aiInsights?.improvements ?? ['无明显改进建议'],
      rootCause: data.aiInsights?.rootCause ?? '',
    },
  };
}

/**
 * 完全失败时的兜底返回值
 */
function getFallbackEvaluation(): any {
  return {
    effectiveness: {
      taskCompleted: false,
      taskCompletionReason: 'LLM 评估失败，无法判断',
      hasHallucination: false,
      hasContradiction: false,
      accuracyLevel: 'medium',
      userSatisfaction: 'neutral',
      satisfactionReason: 'LLM 评估失败，无法判断',
      isConsistent: true,
    },
    efficiency: {
      latencyScore: 50,
      tokenEfficiencyScore: 50,
      turnEfficiencyScore: 50,
      retryScore: 50,
    },
    aiInsights: {
      summary: '评估过程中断，请重试',
      strengths: [],
      improvements: ['请重新提交评估'],
      rootCause: 'LLM 响应解析失败',
    },
  };
}
```

---

### 12.3 分数计算详细逻辑

**效果分数计算**:

```typescript
function calculateEffectivenessScore(llmAnalysis: any): number {
  const weights = {
    taskCompletion: 0.4,
    accuracy: 0.3,
    satisfaction: 0.2,
    consistency: 0.1,
  };
  
  // 任务完成度分数
  const taskScore = llmAnalysis.taskCompleted ? 100 : 40;
  
  // 准确性分数
  let accuracyScore: number;
  if (llmAnalysis.hasHallucination || llmAnalysis.hasContradiction) {
    accuracyScore = 40;
  } else {
    switch (llmAnalysis.accuracyLevel) {
      case 'high': accuracyScore = 100; break;
      case 'medium': accuracyScore = 70; break;
      case 'low': accuracyScore = 40; break;
      default: accuracyScore = 70;
    }
  }
  
  // 满意度分数
  const satisfactionScores: Record<string, number> = {
    positive: 100,
    neutral: 70,
    negative: 30,
  };
  const satisfactionScore = satisfactionScores[llmAnalysis.userSatisfaction] ?? 70;
  
  // 一致性分数
  const consistencyScore = llmAnalysis.isConsistent ? 100 : 40;
  
  // 加权平均
  const score = 
    taskScore * weights.taskCompletion +
    accuracyScore * weights.accuracy +
    satisfactionScore * weights.satisfaction +
    consistencyScore * weights.consistency;
  
  return Math.round(score);
}
```

**效率分数计算**:

```typescript
function calculateEfficiencyScore(llmAnalysis: any): number {
  const weights = {
    latency: 0.4,
    tokenEfficiency: 0.3,
    turnEfficiency: 0.2,
    retry: 0.1,
  };
  
  const score = 
    llmAnalysis.efficiency.latencyScore * weights.latency +
    llmAnalysis.efficiency.tokenEfficiencyScore * weights.tokenEfficiency +
    llmAnalysis.efficiency.turnEfficiencyScore * weights.turnEfficiency +
    llmAnalysis.efficiency.retryScore * weights.retry;
  
  return Math.round(score);
}
```

**综合分数计算**:

```typescript
function calculateOverallScore(effectivenessScore: number, efficiencyScore: number): number {
  // 效果 60% + 效率 40%
  return Math.round(effectivenessScore * 0.6 + efficiencyScore * 0.4);
}

function calculateGrade(score: number): 'S' | 'A' | 'B' | 'C' | 'D' {
  if (score >= 90) return 'S';
  if (score >= 80) return 'A';
  if (score >= 70) return 'B';
  if (score >= 60) return 'C';
  return 'D';
}
```

---

### 12.4 错误处理流程

```typescript
async function evaluateWithRetry(
  sessionId: string,
  evaluatedBy: string,
  maxRetries: number = 2
): Promise<SessionEvaluation> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      // 1. 提取指标
      const metrics = await extractMetrics(sessionId);
      
      // 2. 调用 LLM (带超时)
      const llmResponse = await callLLMWithTimeout(sessionId, metrics, 30000);
      
      // 3. 解析响应
      const llmAnalysis = await parseLLMEvaluationResponse(llmResponse);
      
      // 4. 计算分数
      const effectivenessScore = calculateEffectivenessScore(llmAnalysis);
      const efficiencyScore = calculateEfficiencyScore(llmAnalysis);
      const overallScore = calculateOverallScore(effectivenessScore, efficiencyScore);
      const overallGrade = calculateGrade(overallScore);
      
      // 5. 构建评估记录
      const evaluation: SessionEvaluation = { /* ... */ };
      
      // 6. 保存结果
      await store.writeEvaluation('session', sessionId, evaluation);
      
      return evaluation;
      
    } catch (error) {
      lastError = error as Error;
      console.error(`评估失败 (尝试 ${attempt}/${maxRetries + 1}):`, error);
      
      // 等待后重试 (指数退避)
      if (attempt <= maxRetries) {
        const delay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s...
        await sleep(delay);
      }
    }
  }
  
  // 所有重试失败，创建失败记录
  const failedEvaluation: SessionEvaluation = {
    evaluationId: `eval-${Date.now()}-failed`,
    sessionId,
    evaluatedAt: new Date().toISOString(),
    evaluatedBy,
    evaluatorModel: 'bailian/qwen3.5-plus',
    status: 'failed',
    metrics: {
      effectiveness: { score: 0, taskCompleted: false, hasError: true, errorMessage: lastError?.message, userSatisfaction: 'neutral', consistency: true },
      efficiency: { score: 0, avgLatencyMs: 0, totalInputTokens: 0, totalOutputTokens: 0, tokenEfficiencyRatio: 0, turnCount: 0, retryCount: 0 },
      overall: { score: 0, grade: 'D' },
    },
    aiInsights: {
      summary: '评估失败',
      strengths: [],
      improvements: ['请稍后重试'],
      rootCause: lastError?.message ?? '未知错误',
    },
    metadata: { evaluationVersion: '1.0', promptVersion: 'eval-prompt-v1', sessionSnapshot: { turnCount: 0, startTime: '', endTime: '', model: '' } },
  };
  
  await store.writeEvaluation('session', sessionId, failedEvaluation);
  throw lastError;
}
```

---

### 12.5 Prompt 评估特殊逻辑

**Prompt 评估 vs 会话评估的差异**:

| 维度 | 会话评估 | Prompt 评估 |
|------|---------|-----------|
| 评估对象 | 单个会话 | 一个 Prompt 版本 + 多个会话样本 |
| 采样策略 | 不适用 | 最近 N 个使用该 Prompt 的会话 |
| 指标聚合 | 不适用 | 平均值、分布、趋势 |
| 对比能力 | 不适用 | 与历史版本对比 |

**Prompt 评估流程**:

```typescript
async function evaluatePrompt(
  promptId: string,
  promptVersion: string,
  sampleSize: number = 10,
  evaluatedBy: string
): Promise<PromptEvaluation> {
  // 1. 采样会话（最近 N 个使用该 Prompt 的会话）
  const sampleSessionIds = await findSessionsByPrompt(promptId, promptVersion, sampleSize);
  
  // 2. 对每个会话进行评估
  const sessionEvaluations: SessionEvaluation[] = [];
  for (const sessionId of sampleSessionIds) {
    const eval = await sessionEvaluator.evaluate(sessionId, evaluatedBy);
    sessionEvaluations.push(eval);
  }
  
  // 3. 聚合指标
  const aggregatedMetrics = {
    effectiveness: {
      score: average(sessionEvaluations.map(e => e.metrics.effectiveness.score)),
      avgTaskCompletionRate: sessionEvaluations.filter(e => e.metrics.effectiveness.taskCompleted).length / sampleSize,
      avgErrorRate: sessionEvaluations.filter(e => e.metrics.effectiveness.hasError).length / sampleSize,
    },
    efficiency: {
      score: average(sessionEvaluations.map(e => e.metrics.efficiency.score)),
      avgLatencyMs: average(sessionEvaluations.map(e => e.metrics.efficiency.avgLatencyMs)),
      avgInputTokens: average(sessionEvaluations.map(e => e.metrics.efficiency.totalInputTokens)),
      avgOutputTokens: average(sessionEvaluations.map(e => e.metrics.efficiency.totalOutputTokens)),
      avgTurnCount: average(sessionEvaluations.map(e => e.metrics.efficiency.turnCount)),
    },
    overall: {
      score: average(sessionEvaluations.map(e => e.metrics.overall.score)),
      grade: calculateGrade(average(sessionEvaluations.map(e => e.metrics.overall.score))),
    },
  };
  
  // 4. 调用 LLM 生成 Prompt 级别的洞察
  const promptInsights = await generatePromptInsights(promptId, promptVersion, sessionEvaluations);
  
  // 5. 与历史版本对比（如果有）
  const previousVersion = await getPreviousPromptVersion(promptId, promptVersion);
  const comparison = previousVersion ? await compareWithPrevious(promptId, promptVersion, previousVersion) : undefined;
  
  // 6. 构建评估记录
  const evaluation: PromptEvaluation = { /* ... */ };
  
  // 7. 保存结果
  await store.writeEvaluation('prompt', promptId, evaluation);
  
  return evaluation;
}
```

---

### 12.6 关键决策点总结

| 决策点 | 选择 | 理由 |
|--------|------|------|
| 评估触发方式 | 用户手动点击 | 节省成本，用户主动需要时才评估 |
| 评估执行方式 | 异步 | 避免阻塞 UI，LLM 调用需 2-5 秒 |
| 轮询间隔 | 1 秒 | 平衡实时性和服务器压力 |
| 超时时间 | 30 秒 | 覆盖 99% 的 LLM 调用场景 |
| 重试次数 | 2 次 | 平衡成功率和成本 |
| 并发限制 | 5 个任务 | 避免 LLM API 限流 |
| 存储格式 | JSON 文件 | 简单、可读、易调试 |
| 原子写入 | 临时文件 + 重命名 | 防止写入中断导致数据损坏 |
| 评估 Prompt 版本化 | 是 | 便于追溯和对比 |
| LLM 输出容错 | 3 层解析策略 | 应对 LLM 输出格式不稳定 |

---

## 13. 评审记录

| 日期 | 评审人 | 意见 | 状态 |
|------|--------|------|------|
| 2026-03-29 | 爸爸 | 初稿待评审 | 🟡 待确认 |

---

**下一步**:
1. 爸爸评审 PRD
2. 确认后开始 Phase 1 开发
3. 每周同步进度
