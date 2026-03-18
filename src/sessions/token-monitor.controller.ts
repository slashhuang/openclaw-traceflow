import { Controller, Get, Logger, Post } from '@nestjs/common';
import { TokenMonitorService, SessionTokenUsage, TokenAlert } from './token-monitor.service';

@Controller('api/sessions')
export class TokenMonitorController {
  private readonly logger = new Logger(TokenMonitorController.name);

  constructor(private readonly tokenMonitor: TokenMonitorService) {}

  /**
   * 获取所有会话的 token 使用情况
   */
  @Get('token-usage')
  async getAllTokenUsage(): Promise<SessionTokenUsage[]> {
    this.logger.log('Getting all sessions token usage');
    return await this.tokenMonitor.getAllSessionsTokenUsage();
  }

  /**
   * 获取单个会话的 token 使用情况
   */
  @Get(':sessionKey/token-usage')
  async getSessionTokenUsage(@Param('sessionKey') sessionKey: string): Promise<SessionTokenUsage> {
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
