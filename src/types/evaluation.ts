/**
 * OpenClaw Audit System - 评估类型定义
 *
 * @see PRD: docs/PRD-openclaw-audit-system.md
 */

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
    /** 评估所用模板来源（仅新记录；旧数据可能无此字段） */
    promptTemplateSource?: 'builtin' | 'override';
    sessionSnapshot: {
      turnCount: number;
      startTime: string | number;
      endTime: string | number;
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
