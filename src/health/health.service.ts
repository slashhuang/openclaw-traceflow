import { Injectable, Logger } from '@nestjs/common';
import { OpenClawService } from '../openclaw/openclaw.service';
import { SkillsService } from '../skills/skills.service';

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

  constructor(
    private openclawService: OpenClawService,
    private skillsService: SkillsService,
  ) {}

  private async collectLocalRuntimeStats(): Promise<{
    memoryMb: number;
    cpuPercent: number;
    uptimeSec: number;
  }> {
    const cpuStart = process.cpuUsage();
    const hrStart = process.hrtime.bigint();

    // 短窗口采样，计算当前进程 CPU 占比（单核口径，可能 >100%）
    await new Promise((resolve) => setTimeout(resolve, 120));

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

  async getHealthStatus(options?: {
    /** 已由其它请求（如仪表盘合并 WS）验证过 Gateway 时传入，避免再次 skills.status 建连 */
    connectionOverride?: { connected: boolean; error?: string };
  }): Promise<HealthStatus> {
    const localStats = await this.collectLocalRuntimeStats();
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

    // 1. 检查 OpenClaw Gateway 连接（WebSocket 协议，含 token 鉴权）
    const connectionResult = options?.connectionOverride
      ? {
          connected: options.connectionOverride.connected,
          error: options.connectionOverride.error,
        }
      : await this.openclawService.checkConnection();
    status.openclawConnected = connectionResult.connected;
    status.gatewayError = connectionResult.error;

    if (!connectionResult.connected) {
      status.status = 'DEGRADED';
      this.logger.warn(`OpenClaw Gateway not connected: ${connectionResult.error}`);
      return status;
    }

    // 2. Gateway 已连接，设置 running 为 true，并触发 systemPrompt 缓存刷新
    status.gateway.running = true;
    void this.skillsService.refreshCache();

    // 3. 尝试从 OpenClaw 获取更多信息（可选）
    try {
      const health = await this.openclawService.getHealth();

      // 如果返回了详细信息，使用它
      if (health && typeof health === 'object' && 'status' in health) {
        status.gateway.uptime = (health as any).uptime ?? status.gateway.uptime;
        status.gateway.memory = (health as any).memoryUsage ?? status.gateway.memory;
        status.gateway.pid = (health as any).pid;
        status.gateway.cpu = (health as any).cpu ?? status.gateway.cpu;
        status.skills = (health as any).skills || [];

        if ((health as any).status === 'unhealthy') {
          status.status = 'UNHEALTHY';
        } else if ((health as any).status === 'degraded') {
          status.status = 'DEGRADED';
        }
      }
    } catch (error) {
      // OpenClaw HTTP API 可能只返回简单响应，忽略错误
      this.logger.debug('OpenClaw health API returned simple response');
    }

    return status;
  }
}
