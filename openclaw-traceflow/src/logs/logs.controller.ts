import { Controller, Get, Query } from '@nestjs/common';
import { LogsService, LogEntry } from './logs.service';

@Controller('api/logs')
export class LogsController {
  constructor(private readonly logsService: LogsService) {}

  @Get()
  async getRecentLogs(
    @Query('limit') limit?: number,
    @Query('level') level?: string,
    @Query('search') search?: string,
  ): Promise<LogEntry[]> {
    const limitNum = limit ? parseInt(limit.toString(), 10) : 100;
    const logs = await this.logsService.getRecentLogs(limitNum);

    // 过滤日志级别
    let filtered = logs;
    if (level && level !== 'all') {
      const validLevels = ['error', 'warn', 'info', 'debug'];
      if (validLevels.includes(level.toLowerCase())) {
        filtered = filtered.filter((log) => log.level === level.toLowerCase());
      }
    }

    // 搜索关键词（不区分大小写）
    if (search && search.trim()) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter(
        (log) =>
          log.content.toLowerCase().includes(searchLower) ||
          log.timestamp.toLowerCase().includes(searchLower),
      );
    }

    return filtered;
  }
}
