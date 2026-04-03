import { Controller, Get } from '@nestjs/common';
import { HealthService } from '../health/health.service';
import { OpenClawService } from '../openclaw/openclaw.service';
import { SessionsService } from '../sessions/sessions.service';
import { LogsService } from '../logs/logs.service';
import { MetricsService } from '../metrics/metrics.service';
import type { StatusOverviewResult } from '../openclaw/gateway-rpc';

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
  async getOverview() {
    const bundleResult = await this.openclawService
      .getDashboardGatewayBundle(10)
      .catch(() => ({ ok: false as const, error: 'bundle failed' }));

    let statusOverview: StatusOverviewResult | null;
    let logs: Awaited<ReturnType<LogsService['getGatewayRecentLogs']>>;
    let connectionOverride: { connected: boolean; error?: string } | undefined;

    if (bundleResult.ok) {
      statusOverview = bundleResult.statusOverview;
      logs = this.logsService.mapGatewayTailPayloadToEntries(
        bundleResult.logsTail,
      );
      connectionOverride = { connected: true };
    } else {
      const [statusO, recentLogs, chk] = await Promise.all([
        this.openclawService.getStatusOverview().catch(() => null),
        this.logsService.getGatewayRecentLogs(10).catch(() => []),
        this.openclawService
          .checkConnection()
          .catch(() => ({ connected: false, error: undefined })),
      ]);
      statusOverview = statusO;
      logs = recentLogs;
      connectionOverride =
        statusO != null
          ? { connected: true }
          : { connected: chk.connected, error: chk.error };
    }

    const [
      health,
      sessions,
      latency,
      tokenSummary,
      archivedSessions,
      agentSessionOverview,
    ] = await Promise.all([
      this.healthService
        .getHealthStatus({ connectionOverride })
        .catch(() => null),
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
      statusOverview: statusOverview ?? { error: 'Gateway 未连接或不可用' },
      sessions,
      /** PRD：按 agent 分区的会话概览（总/活跃/空闲/归档，磁盘） */
      agentSessionOverview,
      recentLogs: logs,
      metrics: {
        latency,
        tokenSummary,
        archiveCountMap,
      },
    };
  }
}
