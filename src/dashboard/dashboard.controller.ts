import { Controller, Get } from '@nestjs/common';
import { HealthService } from '../health/health.service';
import { OpenClawService } from '../openclaw/openclaw.service';
import { SessionsService } from '../sessions/sessions.service';
import { MetricsService } from '../metrics/metrics.service';

@Controller('api/dashboard')
export class DashboardController {
  constructor(
    private readonly healthService: HealthService,
    private readonly openclawService: OpenClawService,
    private readonly sessionsService: SessionsService,
    private readonly metricsService: MetricsService,
  ) {}

  @Get('overview')
  async getOverview() {
    const [
      health,
      paths,
      sessions,
      latency,
      tokenSummary,
      archivedSessions,
      agentSessionOverview,
    ] = await Promise.all([
      this.healthService.getHealthStatus().catch(() => null),
      this.openclawService.getResolvedPaths().catch(() => null),
      this.sessionsService.listSessions().catch(() => []),
      this.metricsService
        .getLatencyMetrics()
        .catch(() => ({ p50: 0, p95: 0, p99: 0, count: 0 })),
      this.metricsService.getTokenSummary().catch(() => ({
        totalInput: 0,
        totalOutput: 0,
        totalTokens: 0,
        activeInput: 0,
        activeOutput: 0,
        activeTokens: 0,
        archivedInput: 0,
        archivedOutput: 0,
        archivedTokens: 0,
        nearLimitCount: 0,
        limitReachedCount: 0,
        sessionCount: 0,
      })),
      this.sessionsService
        .getAllSessions('archived')
        .catch(() => ({ items: [], total: 0 })),
      this.sessionsService.getAgentSessionOverview().catch(() => []),
    ]);

    // 构建归档计数映射（按 sessionId 分组）
    const archiveCountMap: Record<string, number> = {};
    for (const session of archivedSessions.items) {
      archiveCountMap[session.sessionId] = 1;
    }

    return {
      health,
      openclawPaths: paths,
      sessions,
      /** PRD：按 agent 分区的会话概览（总/活跃/空闲/归档，磁盘） */
      agentSessionOverview,
      metrics: {
        latency,
        tokenSummary,
        archiveCountMap,
      },
    };
  }
}
