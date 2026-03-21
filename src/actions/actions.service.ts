import { Injectable, Logger } from '@nestjs/common';
import { OpenClawService } from '../openclaw/openclaw.service';
import { execFile } from 'child_process';
import { promisify } from 'util';

@Injectable()
export class ActionsService {
  private readonly logger = new Logger(ActionsService.name);

  constructor(private openclawService: OpenClawService) {}

  async restartGateway(): Promise<{ success: boolean; message: string }> {
    try {
      const execFileAsync = promisify(execFile);
      const cli = process.env.OPENCLAW_CLI || 'openclaw';
      await execFileAsync(cli, ['gateway', 'restart'], {
        env: process.env,
        timeout: 120_000,
      });
      return { success: true, message: 'Gateway 已重启' };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to restart gateway:', msg);
      return {
        success: false,
        message: `重启失败：${msg}`,
      };
    }
  }

  async killSession(sessionId: string): Promise<{ success: boolean; message: string }> {
    const result = await this.openclawService.killSession(sessionId);
    if (result) {
      return { success: true, message: `会话 ${sessionId} 已终止` };
    }
    return { success: false, message: '终止会话失败' };
  }

  async updateConcurrency(maxConcurrent: number): Promise<{ success: boolean; message: string }> {
    try {
      const result = await this.openclawService.updateConfig({
        sessions: { maxConcurrent },
      });

      if (result) {
        return { success: true, message: `并发数已更新为 ${maxConcurrent}` };
      }

      return { success: false, message: '更新配置失败' };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }
}
