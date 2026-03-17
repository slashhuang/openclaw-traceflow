import { Injectable } from '@nestjs/common';

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
}

@Injectable()
export class HealthService {
  async getHealthStatus(): Promise<HealthStatus> {
    // TODO: 连接到 PM2 API 获取真实状态
    // 当前环境没有运行 PM2，返回模拟数据
    return {
      status: 'HEALTHY',
      gateway: {
        running: true,
        pid: process.pid,
        memory: process.memoryUsage().heapUsed,
        cpu: 0,
        uptime: process.uptime() * 1000,
      },
      skills: [],
      apiQuota: {
        used: 0,
        limit: 1000,
        remaining: 1000,
      },
      lastHeartbeat: Date.now(),
    };
  }
}
