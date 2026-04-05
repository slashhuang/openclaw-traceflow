import { Injectable, Logger } from '@nestjs/common';
import { OpenClawService } from '../openclaw/openclaw.service';

export interface HealthStatus {
  status: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY' | 'CRITICAL';
  /** OpenClaw 本地状态目录配置 */
  openclaw: {
    stateDir?: string | null;
    configPath?: string | null;
    workspaceDir?: string | null;
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

  async getHealthStatus(): Promise<HealthStatus> {
    const [localStats, paths] = await Promise.all([
      this.collectLocalRuntimeStats(),
      this.openclawService.getResolvedPaths(),
    ]);

    const status: HealthStatus = {
      status: 'HEALTHY',
      openclaw: {
        stateDir: paths.stateDir,
        configPath: paths.configPath,
        workspaceDir: paths.workspaceDir,
      },
      skills: [],
      apiQuota: {
        used: 0,
        limit: 1000,
        remaining: 1000,
      },
      lastHeartbeat: Date.now(),
    };

    // 检查 OpenClaw 状态目录是否配置
    if (!paths.stateDir) {
      status.status = 'DEGRADED';
      status.openclaw.stateDir = null;
      this.logger.warn('OpenClaw stateDir not configured');
    }

    return status;
  }
}
