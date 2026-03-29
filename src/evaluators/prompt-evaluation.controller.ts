/**
 * System Prompt 评估 API（与 api/sessions/:id/evaluations 对称）
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
  HttpStatus,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { EvaluationStore } from '../stores/evaluation-store';
import { PromptEvaluator } from './prompt-evaluator';
import { evaluationTaskQueue } from '../utils/async-task-queue';
import { coalesceLatestEvaluation } from '../utils/evaluation-latest-coalesce';
import { GatewayConnectionService } from '../openclaw/gateway-connection.service';
import { OpenClawService } from '../openclaw/openclaw.service';
import { ConfigService } from '../config/config.service';
import { EvaluationPromptConfigService } from './evaluation-prompt-config.service';

@Controller('api/prompts')
export class PromptEvaluationController {
  private readonly promptEvaluator: PromptEvaluator;

  constructor(
    private readonly gatewayConnection: GatewayConnectionService,
    private readonly openclawService: OpenClawService,
    configService: ConfigService,
    evaluationPromptConfig: EvaluationPromptConfigService,
  ) {
    const dataDir = configService.getConfig().dataDir;
    const store = new EvaluationStore(dataDir);
    this.promptEvaluator = new PromptEvaluator(
      store,
      gatewayConnection,
      openclawService,
      evaluationPromptConfig,
    );
  }

  /**
   * `body.wait === true`：单次 HTTP 内 await 完成并返回 `data`（不轮询 GET latest）。
   */
  @Post(':promptId/evaluations')
  async createPromptEvaluation(
    @Param('promptId') promptId: string,
    @Body() body: { userId?: string; wait?: boolean },
    @Res({ passthrough: true }) res: Response,
  ) {
    const userId = body.userId || 'anonymous';
    if (body.wait) {
      try {
        const evaluation = await evaluationTaskQueue.add(() =>
          this.promptEvaluator.evaluate(promptId, userId),
        );
        res.status(HttpStatus.OK);
        return { success: true, data: evaluation };
      } catch (error) {
        res.status(HttpStatus.OK);
        return { success: false, error: (error as Error).message };
      }
    }
    try {
      evaluationTaskQueue.add(() =>
        this.promptEvaluator.evaluate(promptId, userId),
      );
      res.status(HttpStatus.ACCEPTED);
      return {
        success: true,
        message: '评估任务已提交',
        status: 'pending',
      };
    } catch (error) {
      res.status(HttpStatus.OK);
      return { success: false, error: (error as Error).message };
    }
  }

  @Get(':promptId/evaluations')
  async getPromptEvaluations(@Param('promptId') promptId: string) {
    try {
      const evaluations =
        await this.promptEvaluator.getEvaluationHistory(promptId);
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

  /** 必须在 :evaluationId 之前注册，否则 latest 会被当成 evaluationId */
  @Get(':promptId/evaluations/latest')
  async getLatestPromptEvaluation(@Param('promptId') promptId: string) {
    return coalesceLatestEvaluation(`prompt:${promptId}`, async () => {
      try {
        const evaluation =
          await this.promptEvaluator.getLatestEvaluation(promptId);
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
    });
  }

  @Get(':promptId/evaluations/:evaluationId')
  async getPromptEvaluation(
    @Param('promptId') promptId: string,
    @Param('evaluationId') evaluationId: string,
  ) {
    try {
      const evaluation = await this.promptEvaluator.getEvaluation(
        promptId,
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

  @Delete(':promptId/evaluations/:evaluationId')
  async deletePromptEvaluation(
    @Param('promptId') promptId: string,
    @Param('evaluationId') evaluationId: string,
  ) {
    try {
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
