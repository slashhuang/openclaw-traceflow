import { Controller, Get, Query } from '@nestjs/common';
import { MetricsService, LatencyMetrics } from './metrics.service';
import { OpenClawService } from '../openclaw/openclaw.service';

@Controller('api/metrics')
export class MetricsController {
  constructor(
    private readonly metricsService: MetricsService,
    private readonly openclawService: OpenClawService,
  ) {}

  @Get('latency')
  async getLatencyMetrics(
    @Query('timeRangeMs') timeRangeMs?: number,
  ): Promise<LatencyMetrics> {
    return this.metricsService.getLatencyMetrics(timeRangeMs ? parseInt(timeRangeMs.toString(), 10) : 3600000);
  }

  @Get('tools')
  async getToolStats(@Query('timeRangeMs') timeRangeMs?: number) {
    // 从 OpenClaw sessions 数据中实时提取工具调用统计
    try {
      const sessions = await this.openclawService.listSessions();
      const toolStats = new Map<string, { count: number; success: number }>();

      for (const session of sessions) {
        const detail = await this.openclawService.getSessionDetail(session.sessionId);
        if (detail?.toolCalls) {
          for (const tool of detail.toolCalls) {
            const name = tool.name;
            if (!toolStats.has(name)) {
              toolStats.set(name, { count: 0, success: 0 });
            }
            const stats = toolStats.get(name)!;
            stats.count++;
            if (tool.success) stats.success++;
          }
        }
      }

      // 转换为数组并按调用次数排序
      const result = Array.from(toolStats.entries())
        .map(([tool, data]) => ({
          tool,
          count: data.count,
          successRate: data.count > 0 ? (data.success / data.count) * 100 : 0,
        }))
        .sort((a, b) => b.count - a.count);

      // 返回 Top 8
      return result.slice(0, 8);
    } catch (error) {
      console.error('Failed to get tool stats from sessions:', error);
      return this.metricsService.getToolStats(timeRangeMs ? parseInt(timeRangeMs.toString(), 10) : 3600000);
    }
  }

  @Get('concurrency')
  async getConcurrencyMetrics() {
    // TODO: 从 OpenClaw 获取并发数据
    return {
      currentConcurrent: 1,
      maxConcurrent: 10,
      queueLength: 0,
      activeSessions: 2,
    };
  }

  @Get('session-keys')
  async getSessionKeyStats(@Query('timeRangeMs') timeRangeMs?: number) {
    // TODO: 实现 Session Key 统计
    return [
      { sessionKey: 'calm-lagoon', requestCount: 15, avgDurationMs: 1200 },
      { sessionKey: 'tidal-bloom', requestCount: 8, avgDurationMs: 950 },
    ];
  }

  @Get('subagents')
  async getSubagentStats(@Query('timeRangeMs') timeRangeMs?: number) {
    // TODO: 实现子 Agent 统计
    return {
      totalSpawned: 5,
      successRate: 100,
      avgDurationMs: 3500,
    };
  }
}
