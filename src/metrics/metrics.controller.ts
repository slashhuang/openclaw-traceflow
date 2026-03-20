import { Controller, Get, Query } from '@nestjs/common';
import {
  MetricsService,
  LatencyMetrics,
  TokenSummaryMetrics,
  TokenUsageBySession,
  TokenUsageBySessionKey,
} from './metrics.service';

function parsePage(v: unknown, fallback: number): number {
  const n = Number.parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

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
    try {
      const snapshot = this.metricsService.getToolStatsSnapshot();
      if (snapshot) {
        return snapshot;
      }
      return await this.metricsService.refreshToolStatsSnapshot();
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

  @Get('token-summary')
  async getTokenSummary(
    @Query('timeRangeMs') timeRangeMs?: number,
  ): Promise<TokenSummaryMetrics> {
    return this.metricsService.getTokenSummary(timeRangeMs ? parseInt(timeRangeMs.toString(), 10) : 86400000);
  }

  @Get('token-usage')
  async getTokenUsageBySession(
    @Query('timeRangeMs') timeRangeMs?: number,
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
  ): Promise<{ items: TokenUsageBySession[]; total: number; page: number; pageSize: number }> {
    const all = await this.metricsService.getTokenUsageBySession(
      timeRangeMs ? parseInt(timeRangeMs.toString(), 10) : 86400000,
    );
    const p = parsePage(page, 1);
    const ps = Math.min(200, parsePage(pageSize, 10));
    const start = (p - 1) * ps;
    return { items: all.slice(start, start + ps), total: all.length, page: p, pageSize: ps };
  }

  /** 按 sessionKey 聚合的 token 消耗（进行中 + 归档） */
  @Get('token-usage-by-session-key')
  async getTokenUsageBySessionKey(
    @Query('timeRangeMs') timeRangeMs?: number,
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
  ): Promise<{ items: TokenUsageBySessionKey[]; total: number; page: number; pageSize: number }> {
    const all = await this.metricsService.getTokenUsageBySessionKey(
      timeRangeMs ? parseInt(timeRangeMs.toString(), 10) : 86400000,
    );
    const p = parsePage(page, 1);
    const ps = Math.min(200, parsePage(pageSize, 20));
    const start = (p - 1) * ps;
    return { items: all.slice(start, start + ps), total: all.length, page: p, pageSize: ps };
  }

  /** 每个 sessionKey 的归档次数（用于 sessions 列表） */
  @Get('archive-count-by-session-key')
  async getArchiveCountBySessionKey(): Promise<Record<string, number>> {
    return this.metricsService.getArchivedCountBySessionKey();
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
