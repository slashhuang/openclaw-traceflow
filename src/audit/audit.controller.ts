import { Controller, Get, Post, Param, Query, HttpStatus } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import { OpenClawService } from '../openclaw/openclaw.service';
import type { AuditSnapshot, AuditEvent, ScanAnchors } from './types';

/**
 * Agent 贡献审计 API
 * 
 * 提供审计快照查询、事件列表、扫描触发等功能
 * 数据来源于 claw-family/skills/agent-audit/audit-scanner.mjs
 */
@Controller('api/audit')
export class AuditController {
  constructor(private readonly openClawService: OpenClawService) {}

  /**
   * 获取审计目录根路径
   * 
   * 优先使用 OpenClawService 解析的 workspaceDir，
   * 降级到 ~/.openclaw/workspace/.openclawAudits
   */
  private async getAuditDir(): Promise<string> {
    try {
      const paths = await this.openClawService.getResolvedPaths();
      if (paths.workspaceDir?.trim()) {
        return path.join(paths.workspaceDir, '.openclawAudits');
      }
    } catch (err) {
      console.warn(
        '[AuditController] getResolvedPaths failed, falling back to default:',
        err instanceof Error ? err.message : err,
      );
    }
    return path.join(os.homedir(), '.openclaw', 'workspace', '.openclawAudits');
  }

  /**
   * 获取最新审计快照
   * 
   * @returns 最新审计快照数据
   * 
   * @example
   * GET /api/audit/snapshot
   * 
   * @example Response
   * {
   *   "success": true,
   *   "data": {
   *     "generatedAt": "2026-03-31T15:00:00Z",
   *     "codeDelivery": { "totalMRs": 6, ... },
   *     "qaService": { "totalQuestions": 196, ... },
   *     ...
   *   }
   * }
   */
  @Get('snapshot')
  async getSnapshot(): Promise<{ success: boolean; data?: AuditSnapshot; error?: string }> {
    try {
      const auditDir = await this.getAuditDir();
      const snapshotPath = path.join(auditDir, 'snapshots', 'latest.json');
      
      await fs.access(snapshotPath);
      const content = await fs.readFile(snapshotPath, 'utf-8');
      const snapshot = JSON.parse(content) as AuditSnapshot;
      
      return { success: true, data: snapshot };
    } catch (error) {
      console.error('[AuditController] getSnapshot error:', error);
      if ((error as any).code === 'ENOENT') {
        return { 
          success: false, 
          error: '审计快照不存在，请先运行审计扫描器' 
        };
      }
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  /**
   * 获取指定月份的审计快照
   * 
   * @param month 月份（格式：YYYY-MM）
   * @returns 指定月份的审计快照
   * 
   * @example
   * GET /api/audit/snapshot/2026-03
   */
  @Get('snapshot/:month')
  async getSnapshotByMonth(
    @Param('month') month: string,
  ): Promise<{ success: boolean; data?: AuditSnapshot; error?: string }> {
    try {
      const auditDir = await this.getAuditDir();
      const snapshotPath = path.join(auditDir, 'snapshots', `${month}.json`);
      
      await fs.access(snapshotPath);
      const content = await fs.readFile(snapshotPath, 'utf-8');
      const snapshot = JSON.parse(content) as AuditSnapshot;
      
      return { success: true, data: snapshot };
    } catch (error) {
      console.error('[AuditController] getSnapshotByMonth error:', error);
      if ((error as any).code === 'ENOENT') {
        return { 
          success: false, 
          error: `找不到 ${month} 的审计快照` 
        };
      }
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  /**
   * 获取审计事件列表
   * 
   * @param month 月份过滤（可选）
   * @param type 事件类型过滤（可选）：qa | code_delivery | automation
   * @param senderId 发送者 ID 过滤（可选）
   * @param limit 返回数量限制（默认 100）
   * @returns 审计事件列表
   * 
   * @example
   * GET /api/audit/events?month=2026-03&type=qa&limit=50
   */
  @Get('events')
  async getEvents(
    @Query('month') month?: string,
    @Query('type') type?: string,
    @Query('senderId') senderId?: string,
    @Query('limit') limit?: number,
  ): Promise<{ success: boolean; events?: AuditEvent[]; total?: number; error?: string }> {
    try {
      const auditDir = await this.getAuditDir();
      const eventsDir = path.join(auditDir, 'events');
      
      await fs.access(eventsDir);
      
      // 确定要读取的文件
      let eventFiles: string[];
      if (month) {
        eventFiles = [`${month}.jsonl`];
      } else {
        const files = await fs.readdir(eventsDir);
        eventFiles = files.filter(f => f.endsWith('.jsonl')).sort().reverse();
      }
      
      const events: AuditEvent[] = [];
      const maxEvents = limit || 100;
      
      for (const file of eventFiles) {
        if (events.length >= maxEvents) break;
        
        const filePath = path.join(eventsDir, file);
        const content = await fs.readFile(filePath, 'utf-8');
        const lines = content.trim().split('\n').filter(line => line.trim());
        
        for (const line of lines) {
          if (events.length >= maxEvents) break;
          
          try {
            const event = JSON.parse(line) as AuditEvent;
            
            // 过滤
            if (type && event.type !== type) continue;
            if (senderId && (event as any).senderId !== senderId) continue;
            
            events.push(event);
          } catch (e) {
            console.warn('[AuditController] Failed to parse event:', e);
          }
        }
      }
      
      return { success: true, events, total: events.length };
    } catch (error) {
      console.error('[AuditController] getEvents error:', error);
      if ((error as any).code === 'ENOENT') {
        return { 
          success: false, 
          error: '审计事件目录不存在，请先运行审计扫描器' 
        };
      }
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  /**
   * 获取扫描锚点
   * 
   * @returns 扫描锚点数据（包含每个 JSONL 文件的处理进度）
   * 
   * @example
   * GET /api/audit/anchors
   * 
   * @example Response
   * {
   *   "success": true,
   *   "data": {
   *     "version": 1,
   *     "lastRunAt": "2026-03-31T15:00:00Z",
   *     "files": {
   *       "244eae7f-....jsonl": {
   *         "byteOffset": 45230,
   *         "lineCount": 58,
   *         "status": "active"
   *       }
   *     }
   *   }
   * }
   */
  @Get('anchors')
  async getAnchors(): Promise<{ success: boolean; data?: ScanAnchors; error?: string }> {
    try {
      const auditDir = await this.getAuditDir();
      const anchorsPath = path.join(auditDir, 'anchors.json');
      
      await fs.access(anchorsPath);
      const content = await fs.readFile(anchorsPath, 'utf-8');
      const anchors = JSON.parse(content) as ScanAnchors;
      
      return { success: true, data: anchors };
    } catch (error) {
      console.error('[AuditController] getAnchors error:', error);
      if ((error as any).code === 'ENOENT') {
        return { 
          success: false, 
          error: '扫描锚点不存在，请先运行审计扫描器' 
        };
      }
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  /**
   * 触发审计扫描
   * 
   * 调用 claw-family/skills/agent-audit/scripts/audit-scanner.mjs 执行增量扫描
   * 
   * @param full 是否全量重扫（默认 false）
   * @returns 扫描结果
   * 
   * @example
   * POST /api/audit/scan
   * POST /api/audit/scan?full=true
   * 
   * @example Response
   * {
   *   "success": true,
   *   "message": "审计扫描完成",
   *   "output": "[audit] 扫描完成，处理 1234 行...",
   *   "error": null
   * }
   */
  @Post('scan')
  async triggerScan(
    @Query('full') full?: string,
  ): Promise<{ success: boolean; message?: string; output?: string; error?: string }> {
    try {
      const auditDir = await this.getAuditDir();
      const sessionsDir = path.join(os.homedir(), '.openclaw', 'agents', 'main', 'sessions');
      
      // 构建命令
      const scannerPath = path.join(
        os.homedir(),
        'githubRepo/claw-sources/claw-family/skills/agent-audit/scripts/audit-scanner.mjs',
      );
      
      const args = [
        scannerPath,
        '--sessions-dir', sessionsDir,
        '--audit-dir', auditDir,
      ];
      
      if (full === 'true') {
        args.push('--full');
      }
      
      // 执行扫描器
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);
      
      const { stdout, stderr } = await execAsync(`node ${args.join(' ')}`);
      
      return {
        success: true,
        message: '审计扫描完成',
        output: stdout,
        error: stderr || undefined,
      };
    } catch (error) {
      console.error('[AuditController] triggerScan error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
