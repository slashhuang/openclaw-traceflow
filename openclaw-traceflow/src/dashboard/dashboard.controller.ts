import { Controller, Get, Query } from '@nestjs/common';
import { HealthService } from '../health/health.service';
import { OpenClawService } from '../openclaw/openclaw.service';
import { SessionsService } from '../sessions/sessions.service';
import { LogsService } from '../logs/logs.service';
import { MetricsService } from '../metrics/metrics.service';

@Controller('api/dashboard')
export class DashboardController {
  constructor(
    private readonly healthService: HealthService,
    private readonly openclawService: OpenClawService,
    private readonly sessionsService: SessionsService,
    private readonly logsService: LogsService,
    private readonly metricsService: MetricsService,
  ) {}

  @Get('overview')
  async getOverview(@Query('timeRangeMs') timeRangeMs?: number) {
    const tokenRange = timeRangeMs ? parseInt(String(timeRangeMs), 10) : 86400000;
    const [health, statusOverview, sessions, logs, latency, tools, tokenSummary, tokenUsage, tokenByKey, archiveCountMap] =
      await Promise.all([
        this.healthService.getHealthStatus().catch(() => null),
        this.openclawService.getStatusOverview().catch(() => null),
        this.sessionsService.listSessions().catch(() => []),
        this.logsService.getRecentLogs(10).catch(() => []),
        this.metricsService.getLatencyMetrics().catch(() => ({ p50: 0, p95: 0, p99: 0, count: 0 })),
        (async () => this.metricsService.getToolStatsSnapshot() ?? this.metricsService.refreshToolStatsSnapshot())().catch(() => []),
        this.metricsService.getTokenSummary(tokenRange).catch(() => null),
        this.metricsService.getTokenUsageBySession(tokenRange).catch(() => []),
        this.metricsService.getTokenUsageBySessionKey(tokenRange).catch(() => []),
        this.metricsService.getArchivedCountBySessionKey().catch(() => ({})),
      ]);

    return {
      health,
      statusOverview: statusOverview ?? { error: 'Gateway 未连接或不可用' },
      sessions,
      recentLogs: logs,
      metrics: {
        latency,
        tools,
        tokenSummary,
        tokenUsage,
        tokenByKey,
        archiveCountMap,
      },
    };
  }
}
