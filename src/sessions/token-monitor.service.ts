import { Injectable, Logger } from '@nestjs/common';
import { OpenClawService } from '../openclaw/openclaw.service';
import { loadModelPricing, type ModelPricing } from '../config/model-pricing.config';

// 加载价格配置（支持配置文件覆盖）
const MODEL_PRICING = loadModelPricing();

/** 从 sessionKey 或 model 字符串中提取模型名称 */
function extractModelFromSessionKey(sessionKey: string): string | null {
  const parts = sessionKey.split('/');
  for (const part of parts) {
    const lower = part.toLowerCase();
    if (lower.includes('opus') || lower.includes('sonnet') || lower.includes('haiku')) {
      return part;
    }
    if (lower.includes('gpt-')) {
      return part;
    }
    if (lower.includes('gemini')) {
      return part;
    }
    if (lower.includes('grok')) {
      return part;
    }
  }
  return null;
}

/** 计算 token 对应的费用（USD） */
function calculateCost(
  inputTokens: number,
  outputTokens: number,
  model?: string | null,
  cacheReadTokens?: number,
  cacheWriteTokens?: number,
): number {
  if (!model) return 0;

  const pricing = MODEL_PRICING[model] || MODEL_PRICING['claude-sonnet-4-5'];
  if (!pricing) return 0;

  const inputCost = (inputTokens / 1_000_000) * pricing.input;
  const outputCost = (outputTokens / 1_000_000) * pricing.output;
  const cacheReadCost = cacheReadTokens ? (cacheReadTokens / 1_000_000) * (pricing.cacheRead || 0) : 0;
  const cacheWriteCost = cacheWriteTokens ? (cacheWriteTokens / 1_000_000) * (pricing.cacheWrite || 0) : 0;

  return inputCost + outputCost + cacheReadCost + cacheWriteCost;
}

export interface TokenThreshold {
  warning: number;   // 50%
  serious: number;   // 80%
  critical: number;  // 95%
  limit: number;     // 100%
}

export interface SessionTokenUsage {
  sessionKey: string;
  sessionId: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  limit?: number;
  utilization: number; // 0-100%
  threshold: 'normal' | 'warning' | 'serious' | 'critical' | 'limit';
  consumptionRate: number; // tokens per minute
  estimatedTimeToLimit?: number; // minutes
  lastUpdated: number;
  /** 估算费用（USD） */
  estimatedCost?: number;
  /** 模型名称 */
  model?: string | null;
}

export interface TokenAlert {
  sessionKey: string;
  threshold: 'warning' | 'serious' | 'critical' | 'limit';
  utilization: number;
  totalTokens: number;
  limit?: number;
  timestamp: number;
  message: string;
}

@Injectable()
export class TokenMonitorService {
  private readonly logger = new Logger(TokenMonitorService.name);
  private readonly defaultThresholds: TokenThreshold = {
    warning: 50,
    serious: 80,
    critical: 95,
    limit: 100,
  };
  private alertHistory: TokenAlert[] = [];

  constructor(private readonly openclaw: OpenClawService) {}

  /**
   * 获取所有会话的 token 使用情况
   */
  async getAllSessionsTokenUsage(): Promise<SessionTokenUsage[]> {
    try {
      const sessions = await this.openclaw.listSessions();
      const usageList: SessionTokenUsage[] = [];
      const sessionMap = new Map(sessions.map((s) => [s.sessionKey, s]));

      for (const session of sessions) {
        const usage = await this.getSessionTokenUsage(session.sessionKey, sessionMap);
        if (usage) {
          usageList.push(usage);
        }
      }

      return usageList;
    } catch (error) {
      this.logger.error('Failed to get all sessions token usage', error);
      return [];
    }
  }

  /**
   * 获取单个会话的 token 使用情况
   */
  async getSessionTokenUsage(
    sessionKey: string,
    preloadedSessions?: Map<string, Awaited<ReturnType<OpenClawService['listSessions']>>[number]>,
  ): Promise<SessionTokenUsage | null> {
    try {
      const session = preloadedSessions?.get(sessionKey)
        || (await this.openclaw.listSessions()).find(s => s.sessionKey === sessionKey);

      if (!session) {
        return null;
      }

      let tokenUsage = session.tokenUsage || { input: 0, output: 0, total: 0 };
      if ((tokenUsage.total ?? 0) === 0 && (tokenUsage.input ?? 0) === 0 && (tokenUsage.output ?? 0) === 0) {
        const detail = await this.openclaw.getSessionDetail(session.sessionId);
        if (detail?.tokenUsage && (detail.tokenUsage.total ?? 0) > 0) {
          tokenUsage = detail.tokenUsage;
        }
      }
      const limit = tokenUsage.limit || 100000; // 默认 100k
      const utilization = limit > 0 ? Math.round(((tokenUsage.total || 0) / limit) * 100) : 0;

      const consumptionRate = await this.calculateConsumptionRate(session.sessionId);

      // 估算到达限制的时间
      const remainingTokens = limit - (tokenUsage.total || 0);
      const estimatedTimeToLimit = consumptionRate > 0 ? Math.round(remainingTokens / consumptionRate) : undefined;

      // 确定阈值等级
      const threshold = this.getThresholdLevel(utilization);

      // 计算费用
      const model = session.model || extractModelFromSessionKey(sessionKey);
      const estimatedCost = calculateCost(tokenUsage.input || 0, tokenUsage.output || 0, model);

      return {
        sessionKey,
        sessionId: session.sessionId,
        inputTokens: tokenUsage.input || 0,
        outputTokens: tokenUsage.output || 0,
        totalTokens: tokenUsage.total || 0,
        limit,
        utilization,
        threshold,
        consumptionRate,
        estimatedTimeToLimit,
        lastUpdated: Date.now(),
        estimatedCost,
        model,
      };
    } catch (error) {
      this.logger.error(`Failed to get token usage for session ${sessionKey}`, error);
      return null;
    }
  }

  /**
   * 计算消耗速率（tokens/分钟）
   */
  private async calculateConsumptionRate(sessionId: string): Promise<number> {
    try {
      // 不依赖 getSessionDetail 全量/尾部分片消息，避免大 transcript 截断时首尾时间失真
      const sessions = await this.openclaw.listSessions();
      const session = sessions.find((s) => s.sessionId === sessionId);
      if (!session) return 0;

      const timeDiffMinutes = (session.lastActiveAt - session.createdAt) / (1000 * 60);
      if (timeDiffMinutes <= 0) return 0;

      const totalTokens = session.tokenUsage?.total ?? session.totalTokens ?? 0;
      if (totalTokens <= 0) return 0;

      // 分母至少 1 分钟，避免「几秒内的会话」除数过小导致 tok/min 数量级失真
      const effectiveMinutes = Math.max(timeDiffMinutes, 1);
      return Math.round(totalTokens / effectiveMinutes);
    } catch (error) {
      this.logger.error('Failed to calculate consumption rate', error);
      return 0;
    }
  }

  /**
   * 获取阈值等级
   */
  private getThresholdLevel(utilization: number): 'normal' | 'warning' | 'serious' | 'critical' | 'limit' {
    if (utilization >= 100) return 'limit';
    if (utilization >= this.defaultThresholds.critical) return 'critical';
    if (utilization >= this.defaultThresholds.serious) return 'serious';
    if (utilization >= this.defaultThresholds.warning) return 'warning';
    return 'normal';
  }

  /**
   * 检查并生成告警
   */
  async checkAndGenerateAlerts(): Promise<TokenAlert[]> {
    const sessions = await this.getAllSessionsTokenUsage();
    const newAlerts: TokenAlert[] = [];

    for (const session of sessions) {
      if (session.threshold !== 'normal') {
        const alert: TokenAlert = {
          sessionKey: session.sessionKey,
          threshold: session.threshold,
          utilization: session.utilization,
          totalTokens: session.totalTokens,
          limit: session.limit,
          timestamp: Date.now(),
          message: this.generateAlertMessage(session),
        };

        // 避免重复告警（同一会话同一阈值只告警一次）
        const existingAlert = this.alertHistory.find(
          a => a.sessionKey === session.sessionKey && a.threshold === session.threshold
        );

        if (!existingAlert) {
          newAlerts.push(alert);
          this.alertHistory.push(alert);
        }
      }
    }

    return newAlerts;
  }

  /**
   * 生成告警消息
   */
  private generateAlertMessage(session: SessionTokenUsage): string {
    const thresholdMessages = {
      warning: `⚠️ ${session.sessionKey} Token 使用达到警告阈值 (${session.utilization}%)`,
      serious: `🔶 ${session.sessionKey} Token 使用达到严重阈值 (${session.utilization}%)`,
      critical: `🔴 ${session.sessionKey} Token 使用达到临界阈值 (${session.utilization}%)`,
      limit: `🚨 ${session.sessionKey} Token 已用尽 (${session.utilization}%)`,
    };

    let message = thresholdMessages[session.threshold];
    
    if (session.estimatedTimeToLimit && session.threshold !== 'limit') {
      const hours = Math.floor(session.estimatedTimeToLimit / 60);
      const minutes = session.estimatedTimeToLimit % 60;
      message += `，预计 ${hours}小时${minutes}分钟后用尽`;
    }

    message += ` (已用 ${session.totalTokens.toLocaleString()} / ${session.limit?.toLocaleString() || '∞'})`;

    return message;
  }

  /**
   * 获取告警历史
   */
  getAlertHistory(limit: number = 50): TokenAlert[] {
    return this.alertHistory.slice(-limit);
  }

  /**
   * 清除告警历史
   */
  clearAlertHistory(): void {
    this.alertHistory = [];
  }
}
