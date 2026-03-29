/**
 * OpenClaw Audit System - 会话评估器
 *
 * @see PRD: docs/PRD-openclaw-audit-system.md Section 11.2.3
 */

import {
  SessionEvaluation,
  EvaluationGrade,
  UserSatisfaction,
} from '../types/evaluation';
import { EvaluationStore } from '../stores/evaluation-store';
import {
  SESSION_EVALUATION_PROMPT_V1,
  buildSessionEvaluationContext,
} from './evaluation-prompt';
import { sessionJsonlScan } from '../openclaw/session-jsonl-scan';
import { GatewayConnectionService } from '../openclaw/gateway-connection.service';

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

interface LLMAnalysisResult {
  effectiveness: {
    taskCompleted: boolean;
    taskCompletionReason: string;
    hasHallucination: boolean;
    hasContradiction: boolean;
    accuracyLevel: 'high' | 'medium' | 'low';
    userSatisfaction: UserSatisfaction;
    satisfactionReason: string;
    isConsistent: boolean;
  };
  efficiency: {
    latencyScore: number;
    tokenEfficiencyScore: number;
    turnEfficiencyScore: number;
    retryScore: number;
  };
  aiInsights: {
    summary: string;
    strengths: string[];
    improvements: string[];
    rootCause?: string;
  };
}

export class SessionEvaluator {
  private readonly store: EvaluationStore;
  private readonly evaluationPromptVersion: string = 'eval-prompt-v1';
  private readonly gatewayConnection: GatewayConnectionService;

  constructor(
    store: EvaluationStore,
    gatewayConnection: GatewayConnectionService,
  ) {
    this.store = store;
    this.gatewayConnection = gatewayConnection;
  }

  // 扫描会话并提取指标
  private async extractMetrics(sessionId: string): Promise<SessionMetrics> {
    const session = await sessionJsonlScan(sessionId);

    const messages = session.messages;
    const assistantMessages = messages.filter((m) => m.role === 'assistant');

    // 计算指标
    const turnCount = Math.floor(messages.length / 2);
    const hasError = messages.some(
      (m) => m.role === 'assistant' && m.metadata?.error,
    );
    const errorMessage = hasError
      ? messages.find((m) => m.role === 'assistant' && m.metadata?.error)
          ?.metadata?.error
      : undefined;

    const latencies = assistantMessages
      .map((m) => m.metadata?.latency_ms)
      .filter((l): l is number => l !== undefined);
    const avgLatencyMs =
      latencies.length > 0
        ? latencies.reduce((a, b) => a + b, 0) / latencies.length
        : 0;

    const totalInputTokens = assistantMessages.reduce(
      (sum, m) => sum + (m.metadata?.input_tokens || 0),
      0,
    );
    const totalOutputTokens = assistantMessages.reduce(
      (sum, m) => sum + (m.metadata?.output_tokens || 0),
      0,
    );
    const tokenEfficiencyRatio =
      totalInputTokens + totalOutputTokens > 0
        ? totalOutputTokens / (totalInputTokens + totalOutputTokens)
        : 0;

    const retryCount = assistantMessages.reduce(
      (sum, m) => sum + (m.metadata?.retry_count || 0),
      0,
    );

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
  private calculateEffectivenessScore(llmAnalysis: LLMAnalysisResult): number {
    const weights = {
      taskCompletion: 0.4,
      accuracy: 0.3,
      satisfaction: 0.2,
      consistency: 0.1,
    };

    const taskScore = llmAnalysis.effectiveness.taskCompleted ? 100 : 40;

    let accuracyScore: number;
    if (
      llmAnalysis.effectiveness.hasHallucination ||
      llmAnalysis.effectiveness.hasContradiction
    ) {
      accuracyScore = 40;
    } else {
      switch (llmAnalysis.effectiveness.accuracyLevel) {
        case 'high':
          accuracyScore = 100;
          break;
        case 'medium':
          accuracyScore = 70;
          break;
        case 'low':
          accuracyScore = 40;
          break;
        default:
          accuracyScore = 70;
      }
    }

    const satisfactionScores: Record<string, number> = {
      positive: 100,
      neutral: 70,
      negative: 30,
    };
    const satisfactionScore =
      satisfactionScores[llmAnalysis.effectiveness.userSatisfaction] ?? 70;

    const consistencyScore = llmAnalysis.effectiveness.isConsistent ? 100 : 40;

    const score =
      taskScore * weights.taskCompletion +
      accuracyScore * weights.accuracy +
      satisfactionScore * weights.satisfaction +
      consistencyScore * weights.consistency;

    return Math.round(score);
  }

  // 计算效率分数
  private calculateEfficiencyScore(llmAnalysis: LLMAnalysisResult): number {
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

  // 计算等级
  private calculateGrade(score: number): EvaluationGrade {
    if (score >= 90) return 'S';
    if (score >= 80) return 'A';
    if (score >= 70) return 'B';
    if (score >= 60) return 'C';
    return 'D';
  }

  // 调用 Gateway LLM 进行评估
  private async callLLM(
    sessionId: string,
    metrics: SessionMetrics,
  ): Promise<LLMAnalysisResult> {
    const context = buildSessionEvaluationContext(sessionId, metrics, []);
    const prompt = SESSION_EVALUATION_PROMPT_V1.replace('{context}', context);

    // 调用 Gateway LLM API
    const response = await this.gatewayConnection.call('llm.generate', {
      prompt,
      model: 'bailian/qwen3.5-plus',
      temperature: 0.1,
      max_tokens: 1000,
    });

    // 解析 LLM 响应
    return this.parseLLMResponse(response.content as string);
  }

  // 解析 LLM 输出（带容错）
  private parseLLMResponse(responseText: string): LLMAnalysisResult {
    // 尝试 1: 直接解析
    try {
      const parsed = JSON.parse(responseText.trim());
      return this.validateAndFillDefaults(parsed);
    } catch (e) {
      // 尝试 2: 提取 JSON 代码块
      const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[1].trim());
          return this.validateAndFillDefaults(parsed);
        } catch (e2) {
          // 尝试 3: 提取大括号内容
          const braceMatch = responseText.match(/\{[\s\S]*\}/);
          if (braceMatch) {
            try {
              const parsed = JSON.parse(braceMatch[0].trim());
              return this.validateAndFillDefaults(parsed);
            } catch (e3) {
              // 失败：返回默认值
              return this.getFallbackEvaluation();
            }
          }
        }
      }
      // 失败：返回默认值
      return this.getFallbackEvaluation();
    }
  }

  // 验证并填充默认值
  private validateAndFillDefaults(data: any): LLMAnalysisResult {
    return {
      effectiveness: {
        taskCompleted: data.effectiveness?.taskCompleted ?? false,
        taskCompletionReason:
          data.effectiveness?.taskCompletionReason ?? '无法判断',
        hasHallucination: data.effectiveness?.hasHallucination ?? false,
        hasContradiction: data.effectiveness?.hasContradiction ?? false,
        accuracyLevel: data.effectiveness?.accuracyLevel ?? 'medium',
        userSatisfaction: data.effectiveness?.userSatisfaction ?? 'neutral',
        satisfactionReason:
          data.effectiveness?.satisfactionReason ?? '无法判断',
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

  // 兜底返回值
  private getFallbackEvaluation(): LLMAnalysisResult {
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

  // 执行评估
  async evaluate(
    sessionId: string,
    evaluatedBy: string,
  ): Promise<SessionEvaluation> {
    const evaluationId = `eval-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const evaluatedAt = new Date().toISOString();

    // 1. 提取指标
    const metrics = await this.extractMetrics(sessionId);

    // 2. 调用 LLM 评估
    const llmAnalysis = await this.callLLM(sessionId, metrics);

    // 3. 计算分数
    const effectivenessScore = this.calculateEffectivenessScore(llmAnalysis);
    const efficiencyScore = this.calculateEfficiencyScore(llmAnalysis);
    const overallScore = Math.round(
      effectivenessScore * 0.6 + efficiencyScore * 0.4,
    );
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
          taskCompleted: llmAnalysis.effectiveness.taskCompleted,
          hasError: metrics.hasError,
          errorMessage: metrics.errorMessage,
          userSatisfaction: llmAnalysis.effectiveness.userSatisfaction,
          consistency: llmAnalysis.effectiveness.isConsistent,
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
        summary: llmAnalysis.aiInsights.summary,
        strengths: llmAnalysis.aiInsights.strengths,
        improvements: llmAnalysis.aiInsights.improvements,
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
    return await this.store.readEvaluation(
      'session',
      sessionId,
      index.latestEvaluation.evaluationId,
    );
  }
}
