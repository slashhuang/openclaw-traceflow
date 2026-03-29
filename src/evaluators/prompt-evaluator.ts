/**
 * System Prompt 页评估：工作区规范与引导文件（非「会话质量」）。
 *
 * @see PRD: docs/PRD-openclaw-audit-system.md Section 12.5
 */

import { SessionEvaluation } from '../types/evaluation';
import { EvaluationStore } from '../stores/evaluation-store';
import { WorkspaceBootstrapEvaluator } from './workspace-bootstrap-evaluator';
import { GatewayConnectionService } from '../openclaw/gateway-connection.service';
import type { OpenClawService } from '../openclaw/openclaw.service';
import { EvaluationPromptConfigService } from './evaluation-prompt-config.service';

export class PromptEvaluator {
  private readonly store: EvaluationStore;
  private readonly workspaceBootstrapEvaluator: WorkspaceBootstrapEvaluator;

  constructor(
    store: EvaluationStore,
    gatewayConnection: GatewayConnectionService,
    openclawService: OpenClawService,
    evaluationPromptConfig: EvaluationPromptConfigService,
  ) {
    this.store = store;
    this.workspaceBootstrapEvaluator = new WorkspaceBootstrapEvaluator(
      store,
      gatewayConnection,
      openclawService,
      evaluationPromptConfig,
    );
  }

  /**
   * 基于 probe 的工作区文件与 system 组装上下文，评估规范清晰度、token、调度建议等，写入
   * data/evaluations/system-prompts/:promptId/
   */
  async evaluate(
    promptId: string,
    evaluatedBy: string,
  ): Promise<SessionEvaluation> {
    return await this.workspaceBootstrapEvaluator.evaluate(
      promptId,
      evaluatedBy,
    );
  }

  async getEvaluationHistory(promptId: string) {
    return await this.store.listEvaluations('prompt', promptId);
  }

  async getEvaluation(promptId: string, evaluationId: string) {
    return await this.store.readEvaluation('prompt', promptId, evaluationId);
  }

  async getLatestEvaluation(promptId: string) {
    const index = await this.store.readIndex('prompt', promptId);
    if (!index || !index.latestEvaluation) {
      return null;
    }
    return await this.store.readEvaluation(
      'prompt',
      promptId,
      index.latestEvaluation.evaluationId,
    );
  }
}
