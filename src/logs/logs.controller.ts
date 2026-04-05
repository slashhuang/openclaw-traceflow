import { Controller, Get, Query } from '@nestjs/common';
import { LogsService, LogEntry } from './logs.service';

@Controller('api/logs')
export class LogsController {
  constructor(private readonly logsService: LogsService) {}

  /**
   * 获取 TraceFlow 最近日志
   */
  @Get('traceflow')
  async getTraceflowLogs(@Query('limit') limit?: number): Promise<LogEntry[]> {
    const limitNum = limit ? parseInt(limit.toString(), 10) : 100;
    return this.logsService.getTraceflowRecentLogs(limitNum);
  }

  /**
   * 获取日志（兼容旧版）
   */
  @Get()
  async getAllLogs(
    @Query('limit') limit?: number,
    @Query('source') source?: 'traceflow' | 'all',
  ): Promise<LogEntry[]> {
    const limitNum = limit ? parseInt(limit.toString(), 10) : 100;

    if (source === 'traceflow') {
      return this.logsService.getTraceflowRecentLogs(limitNum);
    } else {
      // 默认返回 TraceFlow 日志
      return this.logsService.getTraceflowRecentLogs(limitNum);
    }
  }
}
