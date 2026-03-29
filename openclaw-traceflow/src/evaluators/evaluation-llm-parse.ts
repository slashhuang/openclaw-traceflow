/**
 * 会话 / 工作区评估共用的 LLM 正文提取与 JSON 解析（与 eval-prompt JSON 形状一致）。
 */

import type { UserSatisfaction } from '../types/evaluation';

export interface LLMAnalysisResult {
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

/** 从 Gateway `llm.generate` 等 RPC 的 payload 中取出模型正文（兼容多种字段名） */
export function extractGatewayLlmText(payload: unknown): string {
  if (payload == null) return '';
  if (typeof payload === 'string') return payload;
  if (typeof payload !== 'object') return String(payload);
  const o = payload as Record<string, unknown>;
  if (typeof o.content === 'string') return o.content;
  if (typeof o.text === 'string') return o.text;
  if (typeof o.output === 'string') return o.output;
  if (typeof o.response === 'string') return o.response;
  const msg = o.message;
  if (msg && typeof msg === 'object' && 'content' in msg) {
    const c = (msg as { content?: unknown }).content;
    if (typeof c === 'string') return c;
  }
  return '';
}

export function parseLLMResponse(responseText: string): LLMAnalysisResult {
  try {
    const parsed = JSON.parse(responseText.trim());
    return validateAndFillDefaults(parsed);
  } catch {
    const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1].trim());
        return validateAndFillDefaults(parsed);
      } catch {
        const braceMatch = responseText.match(/\{[\s\S]*\}/);
        if (braceMatch) {
          try {
            const parsed = JSON.parse(braceMatch[0].trim());
            return validateAndFillDefaults(parsed);
          } catch {
            return getFallbackEvaluation();
          }
        }
      }
    }
    const braceMatch = responseText.match(/\{[\s\S]*\}/);
    if (braceMatch) {
      try {
        const parsed = JSON.parse(braceMatch[0].trim());
        return validateAndFillDefaults(parsed);
      } catch {
        return getFallbackEvaluation();
      }
    }
    return getFallbackEvaluation();
  }
}

export function validateAndFillDefaults(data: any): LLMAnalysisResult {
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

export function getFallbackEvaluation(): LLMAnalysisResult {
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
