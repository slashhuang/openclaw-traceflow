import { Injectable } from '@nestjs/common';
import * as pm2 from 'pm2';

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
    return new Promise((resolve, reject) => {
      pm2.connect((err) => {
        if (err) {
          resolve({
            status: 'CRITICAL',
            gateway: { running: false },
            skills: [],
            apiQuota: { used: 0, limit: 0, remaining: 0 },
          });
          return;
        }

        pm2.list((listErr, list) => {
          pm2.disconnect();

          if (listErr) {
            resolve({
              status: 'CRITICAL',
              gateway: { running: false },
              skills: [],
              apiQuota: { used: 0, limit: 0, remaining: 0 },
            });
            return;
          }

          const gatewayProcess = list.find(
            (proc) => proc.name === 'openclaw-gateway' || proc.pm2_env?.name === 'openclaw-gateway',
          );

          if (!gatewayProcess) {
            resolve({
              status: 'CRITICAL',
              gateway: { running: false },
              skills: [],
              apiQuota: { used: 0, limit: 0, remaining: 0 },
            });
            return;
          }

          const isRunning = gatewayProcess.pm2_env?.status === 'online';
          const memory = gatewayProcess.monit?.memory || 0;
          const cpu = gatewayProcess.monit?.cpu || 0;
          const uptime = gatewayProcess.pm2_env?.pm_uptime || 0;

          // 计算健康状态
          let status: HealthStatus['status'] = 'HEALTHY';
          if (!isRunning) {
            status = 'CRITICAL';
          } else if (memory > 1024 * 1024 * 1024) {
            // 内存 > 1GB
            status = 'DEGRADED';
          }

          resolve({
            status,
            gateway: {
              running: isRunning,
              pid: gatewayProcess.pid,
              memory,
              cpu,
              uptime: Date.now() - uptime,
            },
            skills: [], // TODO: 从 OpenClaw API 获取
            apiQuota: {
              used: 0,
              limit: 0,
              remaining: 0,
            },
            lastHeartbeat: Date.now(),
          });
        });
      });
    });
  }
}
