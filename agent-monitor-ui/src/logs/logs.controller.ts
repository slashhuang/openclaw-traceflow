import { Controller, Get, Query } from '@nestjs/common';
import { LogsService, LogEntry } from './logs.service';

@Controller('api/logs')
export class LogsController {
  constructor(private readonly logsService: LogsService) {}

  @Get()
  async getRecentLogs(
    @Query('limit') limit?: number,
    @Query('source') source?: string,
  ): Promise<LogEntry[]> {
    const logPath = '/root/.pm2/logs/openclaw-gateway-out.log';
    return this.logsService.getRecentLogs(logPath, limit ? parseInt(limit.toString(), 10) : 100);
  }
}
