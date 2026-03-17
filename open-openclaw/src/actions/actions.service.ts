import { Injectable } from '@nestjs/common';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

@Injectable()
export class ActionsService {
  async restartGateway(): Promise<{ success: boolean; message: string }> {
    try {
      await execAsync('pm2 restart openclaw-gateway');
      return { success: true, message: 'Gateway restarted successfully' };
    } catch (error: any) {
      return { success: false, message: error.message || 'Failed to restart Gateway' };
    }
  }

  async killSession(sessionId: string): Promise<{ success: boolean; message: string }> {
    try {
      // TODO: 调用 OpenClaw sessions_kill API
      await execAsync(`openclaw sessions kill ${sessionId}`);
      return { success: true, message: `Session ${sessionId} killed` };
    } catch (error: any) {
      return { success: false, message: error.message || 'Failed to kill session' };
    }
  }

  async updateConcurrency(maxConcurrent: number): Promise<{ success: boolean; message: string }> {
    try {
      // TODO: 更新 OpenClaw 并发配置
      console.log('Updating max concurrent to:', maxConcurrent);
      return { success: true, message: `Max concurrent updated to ${maxConcurrent}` };
    } catch (error: any) {
      return { success: false, message: error.message || 'Failed to update concurrency' };
    }
  }

  async cleanupLogs(): Promise<{ success: boolean; message: string }> {
    try {
      await execAsync('find /root/.pm2/logs -name "*.log" -mtime +7 -delete');
      return { success: true, message: 'Old logs cleaned up' };
    } catch (error: any) {
      return { success: false, message: error.message || 'Failed to cleanup logs' };
    }
  }
}
