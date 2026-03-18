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
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(private openclawService: OpenClawService) {}

  async getHealthStatus(): Promise<HealthStatus> {
    const status: HealthStatus = {
      status: 'HEALTHY',
      gateway: {
        running: false,
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

    // 1. 检查 OpenClaw Gateway 连接
    const connectionResult = await this.openclawService.checkConnection();
    status.openclawConnected = connectionResult.connected;

    if (!connectionResult.connected) {
      status.status = 'DEGRADED';
      this.logger.warn('OpenClaw Gateway not connected');
      return status;
    }

    // 2. Gateway 已连接，设置 running 为 true
    status.gateway.running = true;

    // 3. 尝试从 OpenClaw 获取更多信息（可选）
    try {
      const health = await this.openclawService.getHealth();

      // 如果返回了详细信息，使用它
      if (health && typeof health === 'object' && 'status' in health) {
        status.gateway.uptime = (health as any).uptime;
        status.gateway.memory = (health as any).memoryUsage;
        status.gateway.pid = (health as any).pid;
        status.gateway.cpu = (health as any).cpu;
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
