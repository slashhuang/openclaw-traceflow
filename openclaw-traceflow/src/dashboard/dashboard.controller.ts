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
    const bundle = await this.openclawService.getDashboardGatewayBundle(10).catch(() => ({ ok: false, error: 'bundle failed' }));

    let statusOverview: StatusOverviewResult | null;
    let logs: Awaited<ReturnType<LogsService['getRecentLogs']>>;
    let connectionOverride: { connected: boolean; error?: string } | undefined;

    if (bundle.ok) {
      statusOverview = bundle.statusOverview;
      logs = this.logsService.mapGatewayTailPayloadToEntries(bundle.logsTail);
      connectionOverride = { connected: true };
    } else {
      const [statusO, recentLogs, chk] = await Promise.all([
        this.openclawService.getStatusOverview().catch(() => null),
        this.logsService.getRecentLogs(10).catch(() => []),
        this.openclawService.checkConnection().catch(() => ({ connected: false, error: undefined })),
      ]);
      statusOverview = statusO;
      logs = recentLogs;
      connectionOverride = statusO != null ? { connected: true } : { connected: chk.connected, error: chk.error };
    }

    const [health, sessions, latency] = await Promise.all([
      this.healthService.getHealthStatus({ connectionOverride }).catch(() => null),
      this.sessionsService.listSessions().catch(() => []),
      this.metricsService.getLatencyMetrics().catch(() => ({ p50: 0, p95: 0, p99: 0, count: 0 })),
    ]);

    return {
      health,
      statusOverview: statusOverview ?? { error: 'Gateway 未连接或不可用' },
      sessions,
      recentLogs: logs,
      metrics: { latency },
    };
  }
}
