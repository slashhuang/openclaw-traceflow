/**
 * System Prompt 评估 API（与 api/sessions/:id/evaluations 对称）
 *
 * @see PRD: docs/PRD-openclaw-audit-system.md Section 11.2.5
 *
 * 注意：评估功能需要 Gateway 支持 LLM 调用，当前版本已移除 Gateway，
 * 因此评估端点将返回"功能不可用"错误。
 */

import {
  Controller,
  Get,
  Param,
  Post,
  Delete,
  HttpStatus,
} from '@nestjs/common';
import { EvaluationStore } from '../stores/evaluation-store';
import { coalesceLatestEvaluation } from '../utils/evaluation-latest-coalesce';
import { ConfigService } from '../config/config.service';

@Controller('api/prompts')
export class PromptEvaluationController {
  private readonly store: EvaluationStore;

  constructor(configService: ConfigService) {
    const dataDir = configService.getConfig().dataDir;
    this.store = new EvaluationStore(dataDir);
  }

  /**
   * 创建 Prompt 评估 - 功能已禁用
   */
  @Post(':promptId/evaluations')
  async createPromptEvaluation() {
    return {
      success: false,
      error: '评估功能需要 Gateway 支持，当前版本已禁用',
      code: 'GATEWAY_NOT_AVAILABLE',
    };
  }

  // 获取 Prompt 评估历史
  @Get(':promptId/evaluations')
  async getPromptEvaluations(@Param('promptId') promptId: string) {
    try {
      const evaluations = await this.store.listEvaluations('prompt', promptId);
      return {
        success: true,
        data: evaluations,
      };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  /** 必须在 :evaluationId 之前注册，否则 latest 会被当成 evaluationId */
  @Get(':promptId/evaluations/latest')
  async getLatestPromptEvaluation(@Param('promptId') promptId: string) {
    return coalesceLatestEvaluation(`prompt:${promptId}`, async () => {
      try {
        const index = await this.store.readIndex('prompt', promptId);
        if (!index || !index.latestEvaluation) {
          return {
            success: false,
            error: '暂无评估记录',
          };
        }
        const evaluation = await this.store.readEvaluation(
          'prompt',
          promptId,
          index.latestEvaluation.evaluationId,
        );
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
      const evaluation = await this.store.readEvaluation(
        'prompt',
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
  async deletePromptEvaluation() {
    return {
      success: false,
      error: '删除功能暂未实现',
    };
  }
}
