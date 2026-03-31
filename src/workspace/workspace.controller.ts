import { Controller, Get, Param, Query, Res, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import * as path from 'path';
import * as os from 'os';
import { OpenClawService } from '../openclaw/openclaw.service';
import { FileTreeService } from '../common/file-tree.service';

@Controller('api/workspace')
export class WorkspaceController {
  constructor(
    private readonly openClawService: OpenClawService,
    private readonly fileTreeService: FileTreeService,
  ) {}

  /**
   * 从 OpenClawService 获取 workspace 根目录（与 SystemPrompt / Setup 等模块保持一致）。
   * 降级：若 getResolvedPaths() 未解析到 workspaceDir，退化为 ~/.openclaw/workspace。
   */
  private async getWorkspaceRoot(): Promise<string> {
    try {
      const paths = await this.openClawService.getResolvedPaths();
      if (paths.workspaceDir?.trim()) {
        return paths.workspaceDir.trim();
      }
    } catch (err) {
      console.warn(
        '[WorkspaceController] getResolvedPaths failed, falling back to default:',
        err instanceof Error ? err.message : err,
      );
    }
    return path.join(os.homedir(), '.openclaw', 'workspace');
  }

  /**
   * 获取目录树结构
   */
  @Get('tree')
  async getTree(@Query('path') queryPath?: string) {
    const workspaceRoot = await this.getWorkspaceRoot();
    return this.fileTreeService.getTree(workspaceRoot, queryPath);
  }

  /**
   * 获取文件内容
   */
  @Get('file/*path')
  async getFile(@Param('path') filePath: string | string[], @Res() res: Response) {
    const workspaceRoot = await this.getWorkspaceRoot();
    return this.fileTreeService.getFile(workspaceRoot, filePath, res);
  }
}
