import { Injectable, Logger } from '@nestjs/common';
import { OpenClawService } from '../openclaw/openclaw.service';
import { ConfigService } from '../config/config.service';
import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

@Injectable()
export class ActionsService {
  private readonly logger = new Logger(ActionsService.name);

  constructor(
    private openclawService: OpenClawService,
    private configService: ConfigService,
  ) {}

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

  async cleanupLogs(): Promise<{ success: boolean; message: string }> {
    try {
      const config = this.configService.getConfig();
      const logPath = config.openclawLogPath;

      if (!logPath || !fs.existsSync(logPath)) {
        return { success: true, message: '日志文件未配置或不存在，无需清理' };
      }

      const stats = fs.statSync(logPath);
      // 删除 7 天前的日志
      if (stats.mtimeMs < Date.now() - 7 * 24 * 60 * 60 * 1000) {
        fs.truncateSync(logPath, 0);
        return { success: true, message: '已清理旧日志' };
      }

      return { success: true, message: '日志文件较新，无需清理' };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }
}
