import { Injectable, Logger } from '@nestjs/common';
import { OpenClawService } from '../openclaw/openclaw.service';

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

      for (const session of sessions) {
        const usage = await this.getSessionTokenUsage(session.sessionKey);
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
  async getSessionTokenUsage(sessionKey: string): Promise<SessionTokenUsage | null> {
    try {
      // 从 listSessions 获取的会话中查找
      const sessions = await this.openclaw.listSessions();
      const session = sessions.find(s => s.sessionKey === sessionKey);

      if (!session) {
        return null;
      }

      // 从 session 中提取 token 信息
      const tokenUsage = session.tokenUsage || { input: 0, output: 0, total: 0 };
      const limit = tokenUsage.limit || 100000; // 默认 100k
      const utilization = limit > 0 ? Math.round(((tokenUsage.total || 0) / limit) * 100) : 0;

      // 计算消耗速率（基于历史数据）
      const consumptionRate = await this.calculateConsumptionRate(sessionKey);

      // 估算到达限制的时间
      const remainingTokens = limit - (tokenUsage.total || 0);
      const estimatedTimeToLimit = consumptionRate > 0 ? Math.round(remainingTokens / consumptionRate) : undefined;

      // 确定阈值等级
      const threshold = this.getThresholdLevel(utilization);

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
      };
    } catch (error) {
      this.logger.error(`Failed to get token usage for session ${sessionKey}`, error);
      return null;
    }
  }

  /**
   * 计算消耗速率（tokens/分钟）
   */
  private async calculateConsumptionRate(sessionKey: string): Promise<number> {
    try {
      // 获取会话详情来计算消耗速率
      const sessionDetail = await this.openclaw.getSessionDetail(sessionKey);

      if (!sessionDetail?.messages || sessionDetail.messages.length < 2) {
        return 0;
      }

      // 获取第一条和最后一条消息的时间戳
      const firstMessage = sessionDetail.messages[0];
      const lastMessage = sessionDetail.messages[sessionDetail.messages.length - 1];

      const timeDiffMinutes = (lastMessage.timestamp - firstMessage.timestamp) / (1000 * 60);

      if (timeDiffMinutes <= 0) {
        return 0;
      }

      const totalTokens = sessionDetail.messages.reduce((sum, msg) => {
        return sum + (msg.tokenCount || 0);
      }, 0);

      return Math.round(totalTokens / timeDiffMinutes);
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
