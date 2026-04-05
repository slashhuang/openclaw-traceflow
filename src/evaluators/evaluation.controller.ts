/**
 * OpenClaw Audit System - 评估 API 控制器
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

@Controller('api/sessions')
export class EvaluationController {
  private readonly store: EvaluationStore;

  constructor(configService: ConfigService) {
    const dataDir = configService.getConfig().dataDir;
    this.store = new EvaluationStore(dataDir);
  }

  /**
   * 创建会话评估 - 功能已禁用
   */
  @Post(':sessionId/evaluations')
  async createSessionEvaluation() {
    return {
      success: false,
      error: '评估功能需要 Gateway 支持，当前版本已禁用',
      code: 'GATEWAY_NOT_AVAILABLE',
    };
  }

  // 获取会话评估历史
  @Get(':sessionId/evaluations')
  async getSessionEvaluations(@Param('sessionId') sessionId: string) {
    try {
      const evaluations = await this.store.listEvaluations(
        'session',
        sessionId,
      );
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
  @Get(':sessionId/evaluations/latest')
  async getLatestSessionEvaluation(@Param('sessionId') sessionId: string) {
    return coalesceLatestEvaluation(`session:${sessionId}`, async () => {
      try {
        const index = await this.store.readIndex('session', sessionId);
        if (!index || !index.latestEvaluation) {
          return {
            success: false,
            error: '暂无评估记录',
          };
        }
        const evaluation = await this.store.readEvaluation(
          'session',
          sessionId,
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

  // 获取单次评估详情
  @Get(':sessionId/evaluations/:evaluationId')
  async getSessionEvaluation(
    @Param('sessionId') sessionId: string,
    @Param('evaluationId') evaluationId: string,
  ) {
    try {
      const evaluation = await this.store.readEvaluation(
        'session',
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

  // 删除评估记录
  @Delete(':sessionId/evaluations/:evaluationId')
  async deleteSessionEvaluation() {
    return {
      success: false,
      error: '删除功能暂未实现',
    };
  }
}
