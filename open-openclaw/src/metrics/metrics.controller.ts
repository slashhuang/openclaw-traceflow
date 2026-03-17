import { Controller, Get, Query } from '@nestjs/common';
import { MetricsService, LatencyMetrics } from './metrics.service';

@Controller('api/metrics')
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get('latency')
  async getLatencyMetrics(
    @Query('timeRangeMs') timeRangeMs?: number,
  ): Promise<LatencyMetrics> {
    return this.metricsService.getLatencyMetrics(timeRangeMs ? parseInt(timeRangeMs.toString(), 10) : 3600000);
  }

  @Get('tools')
  async getToolStats(@Query('timeRangeMs') timeRangeMs?: number) {
    return this.metricsService.getToolStats(timeRangeMs ? parseInt(timeRangeMs.toString(), 10) : 3600000);
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
