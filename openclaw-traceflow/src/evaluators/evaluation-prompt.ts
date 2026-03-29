/**
 * OpenClaw Audit System - 评估 Prompt 模板
 *
 * @see PRD: docs/PRD-openclaw-audit-system.md Section 12.1
 */

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
  keyMessages: Array<{ role: string; content: string; timestamp: string }>,
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
${keyMessages
  .map(
    (m, i) => `
--- 第${Math.ceil((i + 1) / 2)}轮 ---
[${m.role}]: ${m.content.slice(0, 200)}${m.content.length > 200 ? '...' : ''}`,
  )
  .join('\n')}
`;
}

export const EVALUATION_PROMPT_VERSIONS = {
  'eval-prompt-v1': SESSION_EVALUATION_PROMPT_V1,
};
