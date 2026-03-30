import { Controller, Get, Query } from '@nestjs/common';
import { LogsService, LogEntry } from './logs.service';

@Controller('api/logs')
export class LogsController {
  constructor(private readonly logsService: LogsService) {}

  /**
   * 获取 Gateway 最近日志
   */
  @Get('gateway')
  async getGatewayLogs(@Query('limit') limit?: number): Promise<LogEntry[]> {
    const limitNum = limit ? parseInt(limit.toString(), 10) : 100;
    return this.logsService.getGatewayRecentLogs(limitNum);
  }

  /**
   * 获取 TraceFlow 最近日志
   */
  @Get('traceflow')
  async getTraceflowLogs(@Query('limit') limit?: number): Promise<LogEntry[]> {
    const limitNum = limit ? parseInt(limit.toString(), 10) : 100;
    return this.logsService.getTraceflowRecentLogs(limitNum);
  }

  /**
   * 获取混合日志（兼容旧版）
   */
  @Get()
  async getAllLogs(
    @Query('limit') limit?: number,
    @Query('source') source?: 'gateway' | 'traceflow' | 'all',
  ): Promise<LogEntry[]> {
    const limitNum = limit ? parseInt(limit.toString(), 10) : 100;

    if (source === 'gateway') {
      return this.logsService.getGatewayRecentLogs(limitNum);
    } else if (source === 'traceflow') {
      return this.logsService.getTraceflowRecentLogs(limitNum);
    } else {
      // 默认返回混合日志
      const gatewayLogs = await this.logsService.getGatewayRecentLogs(
        limitNum / 2,
      );
      const traceflowLogs = await this.logsService.getTraceflowRecentLogs(
        limitNum / 2,
      );
      return [...gatewayLogs, ...traceflowLogs].sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      );
    }
  }
}
