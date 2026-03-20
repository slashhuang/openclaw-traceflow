import { Controller, Get, Logger, Param, Post, Query } from '@nestjs/common';
import { TokenMonitorService, SessionTokenUsage, TokenAlert } from './token-monitor.service';

@Controller('api/sessions')
export class TokenMonitorController {
  private readonly logger = new Logger(TokenMonitorController.name);

  constructor(private readonly tokenMonitor: TokenMonitorService) {}

  /**
   * 获取所有会话的 token 使用情况
   */
  @Get('token-usage')
  async getAllTokenUsage(
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
  ): Promise<SessionTokenUsage[] | { items: SessionTokenUsage[]; total: number; page: number; pageSize: number }> {
    this.logger.log('Getting all sessions token usage');
    const all = await this.tokenMonitor.getAllSessionsTokenUsage();
    if (page == null && pageSize == null) {
      return all;
    }
    const p = Math.max(1, Number.parseInt(String(page ?? 1), 10) || 1);
    const ps = Math.min(200, Math.max(1, Number.parseInt(String(pageSize ?? 20), 10) || 20));
    const start = (p - 1) * ps;
    return { items: all.slice(start, start + ps), total: all.length, page: p, pageSize: ps };
  }

  /**
   * 获取单个会话的 token 使用情况
   */
  @Get(':sessionKey/token-usage')
  async getSessionTokenUsage(@Param('sessionKey') sessionKey: string): Promise<SessionTokenUsage | null> {
    this.logger.log(`Getting token usage for session ${sessionKey}`);
    return await this.tokenMonitor.getSessionTokenUsage(sessionKey);
  }

  /**
   * 检查并生成告警
   */
  @Post('token-alerts/check')
  async checkAlerts(): Promise<TokenAlert[]> {
    this.logger.log('Checking and generating token alerts');
    return await this.tokenMonitor.checkAndGenerateAlerts();
  }

  /**
   * 获取告警历史
   */
  @Get('token-alerts/history')
  async getAlertHistory(): Promise<TokenAlert[]> {
    this.logger.log('Getting alert history');
    return this.tokenMonitor.getAlertHistory();
  }
}
