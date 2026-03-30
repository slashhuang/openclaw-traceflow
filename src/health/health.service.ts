import { Injectable, Logger } from '@nestjs/common';
import { OpenClawService } from '../openclaw/openclaw.service';

export interface HealthStatus {
  status: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY' | 'CRITICAL';
  gateway: {
    running: boolean;
    pid?: number;
    memory?: number;
    cpu?: number;
    uptime?: number;
  };
  skills: Array<{
    name: string;
    enabled: boolean;
    lastCalled?: number;
  }>;
  apiQuota: {
    used: number;
    limit: number;
    remaining: number;
  };
  lastHeartbeat?: number;
  openclawConnected?: boolean;
  /** Gateway 连接失败时的错误信息（用于前端展示和恢复引导） */
  gatewayError?: string;
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(private openclawService: OpenClawService) {}

  /** 缩短采样窗口，避免与 Gateway 检查串行后总耗时过长 */
  private static readonly LOCAL_CPU_SAMPLE_MS = 50;

  private async collectLocalRuntimeStats(): Promise<{
    memoryMb: number;
    cpuPercent: number;
    uptimeSec: number;
  }> {
    const cpuStart = process.cpuUsage();
    const hrStart = process.hrtime.bigint();

    // 短窗口采样，计算当前进程 CPU 占比（单核口径，可能 >100%）
    await new Promise((resolve) =>
      setTimeout(resolve, HealthService.LOCAL_CPU_SAMPLE_MS),
    );

    const cpuDiff = process.cpuUsage(cpuStart);
    const hrDiffNs = Number(process.hrtime.bigint() - hrStart);
    const elapsedUs = hrDiffNs / 1000;
    const cpuTotalUs = cpuDiff.user + cpuDiff.system;
    const cpuPercent = elapsedUs > 0 ? (cpuTotalUs / elapsedUs) * 100 : 0;

    return {
      memoryMb: Math.round((process.memoryUsage().rss / 1024 / 1024) * 10) / 10,
      cpuPercent: Math.round(cpuPercent * 10) / 10,
      uptimeSec: Math.round(process.uptime()),
    };
  }

  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    label: string,
  ): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`${label} timeout`)), timeoutMs),
      ),
    ]);
  }

  private static readonly GATEWAY_CHECK_BUDGET_MS = 2200;
  private static readonly GATEWAY_HTTP_HEALTH_BUDGET_MS = 1800;

  async getHealthStatus(options?: {
    /** 已由其它请求（如仪表盘合并 WS）验证过 Gateway 时传入，避免再次 skills.status 建连 */
    connectionOverride?: { connected: boolean; error?: string };
  }): Promise<HealthStatus> {
    const [localStats, connectionResult] = await Promise.all([
      this.collectLocalRuntimeStats(),
      options?.connectionOverride
        ? Promise.resolve({
            connected: options.connectionOverride.connected,
            error: options.connectionOverride.error,
          })
        : this.withTimeout(
            this.openclawService.checkConnection(),
            HealthService.GATEWAY_CHECK_BUDGET_MS,
            'checkConnection',
          ).catch((): { connected: boolean; error?: string } => ({
            connected: false,
            error: 'Gateway 连接检查超时（请确认 Gateway 可达或稍后重试）',
          })),
    ]);

    const status: HealthStatus = {
      status: 'HEALTHY',
      gateway: {
        running: false,
        memory: localStats.memoryMb,
        cpu: localStats.cpuPercent,
        uptime: localStats.uptimeSec,
      },
      skills: [],
      apiQuota: {
        used: 0,
        limit: 1000,
        remaining: 1000,
      },
      lastHeartbeat: Date.now(),
      openclawConnected: false,
    };

    status.openclawConnected = connectionResult.connected;
    status.gatewayError = connectionResult.error;

    if (!connectionResult.connected) {
      status.status = 'DEGRADED';
      this.logger.warn(
        `OpenClaw Gateway not connected: ${connectionResult.error}`,
      );
      return status;
    }

    // Gateway 已连接，设置 running 为 true
    status.gateway.running = true;

    // 从 OpenClaw HTTP /health 补充（限时，避免与 WS 检查叠加后总耗时过长）
    try {
      const health = await this.withTimeout(
        this.openclawService.getHealth(),
        HealthService.GATEWAY_HTTP_HEALTH_BUDGET_MS,
        'getHealth',
      );

      status.gateway.uptime = health.uptime ?? status.gateway.uptime;
      status.gateway.memory = health.memoryUsage ?? status.gateway.memory;
      if (typeof health.pid === 'number') status.gateway.pid = health.pid;
      if (typeof health.cpu === 'number') status.gateway.cpu = health.cpu;
      if (Array.isArray(health.skills)) {
        status.skills = health.skills as HealthStatus['skills'];
      }

      if (health.status === 'unhealthy') {
        status.status = 'UNHEALTHY';
      } else if (health.status === 'degraded') {
        status.status = 'DEGRADED';
      }
    } catch (error) {
      this.logger.debug(
        'OpenClaw HTTP /health skipped or timeout:',
        error instanceof Error ? error.message : error,
      );
    }

    return status;
  }
}
