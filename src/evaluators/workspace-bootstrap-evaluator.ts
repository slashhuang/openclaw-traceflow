/**
 * 工作区规范与引导文件评估（/api/prompts/:id/evaluations），与会话详情中的「会话质量评估」分离。
 */

import { Logger } from '@nestjs/common';
import { SessionEvaluation } from '../types/evaluation';
import { EvaluationStore } from '../stores/evaluation-store';
import { buildWorkspaceBootstrapEvaluationContext } from './evaluation-prompt';
import type { EffectiveEvaluationPrompt } from './evaluation-prompt-config.service';
import { EvaluationPromptConfigService } from './evaluation-prompt-config.service';
import {
  callGatewayChatForEvaluationText,
  DEFAULT_GATEWAY_EVAL_SESSION_KEY,
} from './evaluation-gateway-llm';
import {
  extractGatewayLlmText,
  getFallbackEvaluation,
  parseLLMResponse,
  type LLMAnalysisResult,
} from './evaluation-llm-parse';
import {
  calculateEffectivenessScore,
  calculateEfficiencyScore,
  calculateGrade,
} from './evaluation-scoring';
import { GatewayConnectionService } from '../openclaw/gateway-connection.service';
import type { GatewayRpcResult } from '../openclaw/gateway-rpc';
import type { OpenClawService } from '../openclaw/openclaw.service';

export class WorkspaceBootstrapEvaluator {
  private readonly logger = new Logger(WorkspaceBootstrapEvaluator.name);

  constructor(
    private readonly store: EvaluationStore,
    private readonly gatewayConnection: GatewayConnectionService,
    private readonly openclawService: OpenClawService,
    private readonly evaluationPromptConfig: EvaluationPromptConfigService,
  ) {}

  private async callLLM(
    context: string,
    effective: EffectiveEvaluationPrompt,
    probeIds: { sessionId?: string; sessionKey?: string },
  ): Promise<LLMAnalysisResult> {
    const prompt = effective.template.replace('{context}', context);

    const idForResolve =
      probeIds.sessionId || probeIds.sessionKey || '';
    const sessionKey =
      (idForResolve
        ? await this.openclawService.resolveGatewaySessionKeyForEvaluation(
            String(idForResolve),
          )
        : null) ??
      probeIds.sessionKey?.trim() ??
      DEFAULT_GATEWAY_EVAL_SESSION_KEY;

    const result: GatewayRpcResult<unknown> =
      await callGatewayChatForEvaluationText(this.gatewayConnection, {
        sessionKey,
        userMessage: prompt,
        timeoutMs: 120_000,
      });

    if (!result.ok) {
      this.logger.warn(`工作区引导评估 Gateway 对话失败: ${result.error}`);
      return getFallbackEvaluation();
    }

    const text = extractGatewayLlmText(result.payload).trim();
    if (!text) {
      this.logger.warn('工作区引导评估：Gateway 返回无正文');
      return getFallbackEvaluation();
    }

    return parseLLMResponse(text);
  }

  /**
   * 基于 probe 工作区文件与组装 system 上下文，评估规范质量并写入 prompt 资源路径。
   */
  async evaluate(
    promptId: string,
    evaluatedBy: string,
  ): Promise<SessionEvaluation> {
    const probe = await this.openclawService.probeSystemPrompt();
    if (!probe.ok) {
      throw new Error(
        probe.error ||
          '无法嗅探 System Prompt / 工作区：请确认 Gateway 已连接且会话状态目录可解析。',
      );
    }

    const evaluationId = `eval-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const evaluatedAt = new Date().toISOString();

    const context = buildWorkspaceBootstrapEvaluationContext(probe);
    const effective = await this.evaluationPromptConfig.getEffectiveWorkspace();
    const llmAnalysis = await this.callLLM(context, effective, {
      sessionId: probe.sessionId,
      sessionKey: probe.sessionKey,
    });

    const effectivenessScore = calculateEffectivenessScore(llmAnalysis);
    const efficiencyScore = calculateEfficiencyScore(llmAnalysis);
    const overallScore = Math.round(
      effectivenessScore * 0.6 + efficiencyScore * 0.4,
    );
    const overallGrade = calculateGrade(overallScore);

    const metricsStub = {
      turnCount: 0,
      hasError: false,
      avgLatencyMs: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      tokenEfficiencyRatio: 0,
      retryCount: 0,
      startTime: probe.reportGeneratedAt ?? Date.now(),
      endTime: probe.reportGeneratedAt ?? Date.now(),
      model: probe.model,
    };

    const evaluation: SessionEvaluation = {
      evaluationId,
      sessionId: String(probe.sessionKey || probe.sessionId || promptId),
      evaluatedAt,
      evaluatedBy,
      evaluatorModel: 'bailian/qwen3.5-plus',
      status: 'completed',
      metrics: {
        effectiveness: {
          score: effectivenessScore,
          taskCompleted: llmAnalysis.effectiveness.taskCompleted,
          hasError: false,
          userSatisfaction: llmAnalysis.effectiveness.userSatisfaction,
          consistency: llmAnalysis.effectiveness.isConsistent,
        },
        efficiency: {
          score: efficiencyScore,
          avgLatencyMs: metricsStub.avgLatencyMs,
          totalInputTokens: metricsStub.totalInputTokens,
          totalOutputTokens: metricsStub.totalOutputTokens,
          tokenEfficiencyRatio: metricsStub.tokenEfficiencyRatio,
          turnCount: metricsStub.turnCount,
          retryCount: metricsStub.retryCount,
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
        rootCause: llmAnalysis.aiInsights.rootCause || undefined,
      },
      metadata: {
        evaluationVersion: '1.0',
        promptVersion: effective.promptVersion,
        promptTemplateSource: effective.source,
        sessionSnapshot: {
          turnCount: metricsStub.turnCount,
          startTime: metricsStub.startTime,
          endTime: metricsStub.endTime,
          model: metricsStub.model,
        },
      },
    };

    await this.store.writeEvaluation('prompt', promptId, evaluation);
    return evaluation;
  }
}
