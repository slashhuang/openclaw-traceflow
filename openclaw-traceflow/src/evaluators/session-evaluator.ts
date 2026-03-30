/**
 * OpenClaw Audit System - 会话评估器
 *
 * @see PRD: docs/PRD-openclaw-audit-system.md Section 11.2.3
 */

import { Logger } from '@nestjs/common';
import { SessionEvaluation } from '../types/evaluation';
import { EvaluationStore } from '../stores/evaluation-store';
import { buildSessionEvaluationContext } from './evaluation-prompt';
import type { EffectiveEvaluationPrompt } from './evaluation-prompt-config.service';
import { EvaluationPromptConfigService } from './evaluation-prompt-config.service';
import {
  scanSessionJsonlLines,
  SessionJsonlScanResult,
} from '../openclaw/session-jsonl-scan';
import { GatewayConnectionService } from '../openclaw/gateway-connection.service';
import type { GatewayRpcResult } from '../openclaw/gateway-rpc';
import type { OpenClawService } from '../openclaw/openclaw.service';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  extractGatewayLlmText,
  parseLLMResponse,
  getFallbackEvaluation,
  type LLMAnalysisResult,
} from './evaluation-llm-parse';
import {
  calculateEffectivenessScore,
  calculateEfficiencyScore,
  calculateGrade,
} from './evaluation-scoring';

interface SessionMetrics {
  turnCount: number;
  hasError: boolean;
  errorMessage?: string;
  avgLatencyMs: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  retryCount: number;
  tokenEfficiencyRatio: number;
  startTime: string | number;
  endTime: string | number;
  model?: string;
}

interface SessionJsonlMessageWithMetadata {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string | number;
  tokenCount?: number;
  sender?: string;
  metadata?: {
    latency_ms?: number;
    input_tokens?: number;
    output_tokens?: number;
    retry_count?: number;
    error?: string;
    model?: string;
  };
}

export class SessionEvaluator {
  private readonly logger = new Logger(SessionEvaluator.name);
  private readonly store: EvaluationStore;
  private readonly gatewayConnection: GatewayConnectionService;
  private readonly openclawService: OpenClawService;
  private readonly evaluationPromptConfig: EvaluationPromptConfigService;

  constructor(
    store: EvaluationStore,
    gatewayConnection: GatewayConnectionService,
    openclawService: OpenClawService,
    evaluationPromptConfig: EvaluationPromptConfigService,
  ) {
    this.store = store;
    this.gatewayConnection = gatewayConnection;
    this.openclawService = openclawService;
    this.evaluationPromptConfig = evaluationPromptConfig;
  }

  // 扫描会话并提取指标
  private async extractMetrics(sessionId: string): Promise<SessionMetrics> {
    const ocPath =
      await this.openclawService.resolveSessionJsonlPath(sessionId);
    const sessionsDir =
      process.env.SESSIONS_DIR || path.join(process.cwd(), 'sessions');
    const sessionFile = ocPath ?? path.join(sessionsDir, `${sessionId}.jsonl`);
    if (!ocPath && (sessionId.includes(':') || sessionId.includes('/'))) {
      throw new Error(
        `无法定位会话 transcript：Gateway sessionKey「${sessionId}」与磁盘 .jsonl 文件名不一致，且未能从 OpenClaw 状态目录解析。请确认状态目录可访问，或稍后重试以刷新会话缓存。`,
      );
    }
    const content = await fs.readFile(sessionFile, 'utf-8');
    const lines = content.split('\n').filter((line) => line.trim());
    const session: SessionJsonlScanResult = scanSessionJsonlLines(lines);

    const messages = session.messages as SessionJsonlMessageWithMetadata[];
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

  // 调用 Gateway LLM 进行评估
  private async callLLM(
    sessionId: string,
    metrics: SessionMetrics,
    effective: EffectiveEvaluationPrompt,
  ): Promise<LLMAnalysisResult> {
    const context = buildSessionEvaluationContext(sessionId, metrics, []);
    const prompt = effective.template.replace('{context}', context);

    const result: GatewayRpcResult<unknown> =
      await this.gatewayConnection.request(
        'llm.generate',
        {
          prompt,
          model: 'bailian/qwen3.5-plus',
          temperature: 0.1,
          max_tokens: 1000,
        },
        120_000,
      );

    if (!result.ok) {
      const errorMsg = (result as { ok: false; error: string }).error;
      this.logger.warn(`llm.generate 失败：${errorMsg}`, {
        sessionId,
        model: 'bailian/qwen3.5-plus',
      });
      return getFallbackEvaluation();
    }

    // 记录原始响应（便于调试）
    const rawPayload = JSON.stringify(result.payload).slice(0, 1000);
    this.logger.debug(
      `llm.generate 成功，原始响应：${rawPayload}${JSON.stringify(result.payload).length > 1000 ? '...[truncated]' : ''}`,
    );

    const text = extractGatewayLlmText(result.payload).trim();
    if (!text) {
      this.logger.warn(
        'llm.generate 成功但 payload 中无可解析正文（请确认 Gateway 返回字段与 extractGatewayLlmText 一致）',
        {
          sessionId,
          payloadKeys:
            result.payload && typeof result.payload === 'object'
              ? Object.keys(result.payload)
              : typeof result.payload,
        },
      );
      return getFallbackEvaluation();
    }

    this.logger.debug(`提取的 LLM 正文长度：${text.length} 字符`, {
      sessionId,
    });
    return parseLLMResponse(text);
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

    const effective = await this.evaluationPromptConfig.getEffective();

    // 2. 调用 LLM 评估
    const llmAnalysis = await this.callLLM(sessionId, metrics, effective);

    // 3. 计算分数
    const effectivenessScore = calculateEffectivenessScore(llmAnalysis);
    const efficiencyScore = calculateEfficiencyScore(llmAnalysis);
    const overallScore = Math.round(
      effectivenessScore * 0.6 + efficiencyScore * 0.4,
    );
    const overallGrade = calculateGrade(overallScore);

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
        promptVersion: effective.promptVersion,
        promptTemplateSource: effective.source,
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
