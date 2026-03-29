/**
 * OpenClaw Audit System - 评估数据存储层
 *
 * 负责评估记录的持久化存储（JSON 文件）
 *
 * @see PRD: docs/PRD-openclaw-audit-system.md Section 11.2.2
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import {
  SessionEvaluation,
  PromptEvaluation,
  EvaluationIndex,
  EvaluationGrade,
} from '../types/evaluation';

export class EvaluationStore {
  private readonly dataDir: string;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
  }

  // 获取会话评估目录
  private getSessionDir(sessionId: string): string {
    return path.join(this.dataDir, 'evaluations', 'sessions', sessionId);
  }

  // 获取 Prompt 评估目录
  private getPromptDir(promptId: string): string {
    return path.join(this.dataDir, 'evaluations', 'system-prompts', promptId);
  }

  // 确保目录存在
  private async ensureDir(dir: string): Promise<void> {
    await fs.mkdir(dir, { recursive: true });
  }

  // 获取索引文件路径
  private getIndexFilePath(dir: string): string {
    return path.join(dir, 'index.json');
  }

  // 获取评估文件路径
  private getEvaluationFilePath(dir: string, evaluationId: string): string {
    return path.join(dir, `eval-${evaluationId}.json`);
  }

  // 读取索引
  async readIndex(
    resourceType: 'session' | 'prompt',
    resourceId: string,
  ): Promise<EvaluationIndex | null> {
    const dir =
      resourceType === 'session'
        ? this.getSessionDir(resourceId)
        : this.getPromptDir(resourceId);

    const indexPath = this.getIndexFilePath(dir);

    try {
      const content = await fs.readFile(indexPath, 'utf-8');
      return JSON.parse(content) as EvaluationIndex;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  // 写入索引（原子操作）
  async writeIndex(
    resourceType: 'session' | 'prompt',
    resourceId: string,
    index: EvaluationIndex,
  ): Promise<void> {
    const dir =
      resourceType === 'session'
        ? this.getSessionDir(resourceId)
        : this.getPromptDir(resourceId);

    await this.ensureDir(dir);

    const indexPath = this.getIndexFilePath(dir);
    const tempPath = indexPath + '.tmp';

    // 原子写入：先写临时文件，再重命名
    await fs.writeFile(tempPath, JSON.stringify(index, null, 2), 'utf-8');
    await fs.rename(tempPath, indexPath);
  }

  // 读取评估记录
  async readEvaluation(
    resourceType: 'session' | 'prompt',
    resourceId: string,
    evaluationId: string,
  ): Promise<SessionEvaluation | PromptEvaluation | null> {
    const dir =
      resourceType === 'session'
        ? this.getSessionDir(resourceId)
        : this.getPromptDir(resourceId);

    const filePath = this.getEvaluationFilePath(dir, evaluationId);

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content) as SessionEvaluation | PromptEvaluation;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  // 写入评估记录
  async writeEvaluation(
    resourceType: 'session' | 'prompt',
    resourceId: string,
    evaluation: SessionEvaluation | PromptEvaluation,
  ): Promise<void> {
    const dir =
      resourceType === 'session'
        ? this.getSessionDir(resourceId)
        : this.getPromptDir(resourceId);

    await this.ensureDir(dir);

    const filePath = this.getEvaluationFilePath(dir, evaluation.evaluationId);
    const tempPath = filePath + '.tmp';

    // 原子写入
    await fs.writeFile(tempPath, JSON.stringify(evaluation, null, 2), 'utf-8');
    await fs.rename(tempPath, filePath);

    // 更新索引
    await this.updateIndex(resourceType, resourceId, evaluation);
  }

  // 更新索引
  private async updateIndex(
    resourceType: 'session' | 'prompt',
    resourceId: string,
    evaluation: SessionEvaluation | PromptEvaluation,
  ): Promise<void> {
    let index = await this.readIndex(resourceType, resourceId);

    if (!index) {
      index = {
        resourceId,
        resourceType,
        evaluations: [],
        latestEvaluation: null,
      };
    }

    // 添加或更新评估记录
    const existingIndex = index.evaluations.findIndex(
      (e) => e.evaluationId === evaluation.evaluationId,
    );
    const summary = {
      evaluationId: evaluation.evaluationId,
      evaluatedAt: evaluation.evaluatedAt,
      overallScore: evaluation.metrics.overall.score,
      grade: evaluation.metrics.overall.grade,
      evaluatedBy: evaluation.evaluatedBy,
      status: evaluation.status,
    };

    if (existingIndex >= 0) {
      index.evaluations[existingIndex] = summary;
    } else {
      index.evaluations.push(summary);
    }

    // 排序：最新的在前
    index.evaluations.sort(
      (a, b) =>
        new Date(b.evaluatedAt).getTime() - new Date(a.evaluatedAt).getTime(),
    );

    // 更新最新评估
    index.latestEvaluation = {
      evaluationId: index.evaluations[0].evaluationId,
      overallScore: index.evaluations[0].overallScore,
      grade: index.evaluations[0].grade,
      evaluatedAt: index.evaluations[0].evaluatedAt,
    };

    await this.writeIndex(resourceType, resourceId, index);
  }

  // 列出所有评估记录
  async listEvaluations(
    resourceType: 'session' | 'prompt',
    resourceId: string,
  ): Promise<
    Array<{
      evaluationId: string;
      evaluatedAt: string;
      overallScore: number;
      grade: EvaluationGrade;
    }>
  > {
    const index = await this.readIndex(resourceType, resourceId);
    if (!index) {
      return [];
    }
    return index.evaluations;
  }

  // 删除评估记录
  async deleteEvaluation(
    resourceType: 'session' | 'prompt',
    resourceId: string,
    evaluationId: string,
  ): Promise<void> {
    const dir =
      resourceType === 'session'
        ? this.getSessionDir(resourceId)
        : this.getPromptDir(resourceId);

    const filePath = this.getEvaluationFilePath(dir, evaluationId);

    try {
      await fs.unlink(filePath);

      // 更新索引
      const index = await this.readIndex(resourceType, resourceId);
      if (index) {
        index.evaluations = index.evaluations.filter(
          (e) => e.evaluationId !== evaluationId,
        );
        index.latestEvaluation =
          index.evaluations.length > 0
            ? {
                evaluationId: index.evaluations[0].evaluationId,
                overallScore: index.evaluations[0].overallScore,
                grade: index.evaluations[0].grade,
                evaluatedAt: index.evaluations[0].evaluatedAt,
              }
            : null;
        await this.writeIndex(resourceType, resourceId, index);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }
}
