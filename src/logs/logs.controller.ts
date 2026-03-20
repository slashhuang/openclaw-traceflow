import { Controller, Get, Query } from '@nestjs/common';
import { LogsService, LogEntry } from './logs.service';

@Controller('api/logs')
export class LogsController {
  constructor(private readonly logsService: LogsService) {}

  @Get()
  async getRecentLogs(@Query('limit') limit?: number): Promise<LogEntry[]> {
    const limitNum = limit ? parseInt(limit.toString(), 10) : 100;
    return await this.logsService.getRecentLogs(limitNum);
  }
}
