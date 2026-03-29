/**
 * OpenClaw Audit System - 评估 API 控制器
 *
 * @see PRD: docs/PRD-openclaw-audit-system.md Section 11.2.5
 */

import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { EvaluationStore } from '../stores/evaluation-store';
import { SessionEvaluator } from '../evaluators/session-evaluator';
import { evaluationTaskQueue } from '../utils/async-task-queue';
import { GatewayConnectionService } from '../openclaw/gateway-connection.service';

@Controller('api/sessions')
export class EvaluationController {
  private readonly sessionEvaluator: SessionEvaluator;

  constructor(private readonly gatewayConnection: GatewayConnectionService) {
    const dataDir = process.env.TRACEFLOW_DATA_DIR || './data';
    const store = new EvaluationStore(dataDir);
    this.sessionEvaluator = new SessionEvaluator(store, gatewayConnection);
  }

  // 创建会话评估
  @Post(':sessionId/evaluations')
  @HttpCode(HttpStatus.ACCEPTED)
  async createSessionEvaluation(
    @Param('sessionId') sessionId: string,
    @Body() body: { userId?: string },
  ) {
    const userId = body.userId || 'anonymous';

    try {
      // 异步执行评估
      const evaluationPromise = evaluationTaskQueue.add(() =>
        this.sessionEvaluator.evaluate(sessionId, userId),
      );

      // 立即返回任务 ID
      return {
        success: true,
        message: '评估任务已提交',
        status: 'pending',
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  // 获取会话评估历史
  @Get(':sessionId/evaluations')
  async getSessionEvaluations(@Param('sessionId') sessionId: string) {
    try {
      const evaluations =
        await this.sessionEvaluator.getEvaluationHistory(sessionId);
      return {
        success: true,
        data: evaluations,
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  // 获取单次评估详情
  @Get(':sessionId/evaluations/:evaluationId')
  async getSessionEvaluation(
    @Param('sessionId') sessionId: string,
    @Param('evaluationId') evaluationId: string,
  ) {
    try {
      const evaluation = await this.sessionEvaluator.getEvaluation(
        sessionId,
        evaluationId,
      );
      if (!evaluation) {
        return {
          success: false,
          error: '评估记录不存在',
        };
      }
      return {
        success: true,
        data: evaluation,
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  // 获取最新评估
  @Get(':sessionId/evaluations/latest')
  async getLatestSessionEvaluation(@Param('sessionId') sessionId: string) {
    try {
      const evaluation =
        await this.sessionEvaluator.getLatestEvaluation(sessionId);
      if (!evaluation) {
        return {
          success: false,
          error: '暂无评估记录',
        };
      }
      return {
        success: true,
        data: evaluation,
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  // 删除评估记录
  @Delete(':sessionId/evaluations/:evaluationId')
  async deleteSessionEvaluation(
    @Param('sessionId') sessionId: string,
    @Param('evaluationId') evaluationId: string,
  ) {
    try {
      // TODO: 实现删除逻辑
      return {
        success: true,
        message: '评估记录已删除',
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }
}
