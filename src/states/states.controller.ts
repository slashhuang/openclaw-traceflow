import { Controller, Get, Param, Query, Res, BadRequestException } from '@nestjs/common';
import type { Response } from 'express';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { OpenClawService } from '../openclaw/openclaw.service';
import { FileTreeService } from '../common/file-tree.service';

@Controller('api/states')
export class StatesController {
  constructor(
    private readonly openClawService: OpenClawService,
    private readonly fileTreeService: FileTreeService,
  ) {}

  /**
   * 从 OpenClawService 获取 state 根目录（与 SystemPrompt / Setup 等模块保持一致）。
   * 降级：若 getResolvedPaths() 未解析到 stateDir，退化为 ~/.openclaw/state。
   */
  private async getStateRoot(): Promise<string> {
    try {
      const paths = await this.openClawService.getResolvedPaths();
      if (paths.stateDir?.trim()) {
        return paths.stateDir.trim();
      }
    } catch (err) {
      console.warn(
        '[StatesController] getResolvedPaths failed, falling back to default:',
        err instanceof Error ? err.message : err,
      );
    }
    // 回退到默认路径
    const defaultStateDir = path.join(os.homedir(), '.openclaw', 'state');
    return defaultStateDir;
  }

  /**
   * 获取目录树结构
   */
  @Get('tree')
  async getTree(@Query('path') queryPath?: string) {
    const stateRoot = await this.getStateRoot();
    
    // 检查目录是否存在
    if (!fs.existsSync(stateRoot)) {
      throw new BadRequestException(
        `OpenClaw state 目录不存在：${stateRoot}\n\n` +
        `请配置正确的路径：\n` +
        `1. 编辑 config/openclaw.runtime.json\n` +
        `2. 设置 "openclawStateDir": "/your/path/to/.openclaw/state"\n` +
        `3. 或设置环境变量 OPENCLAW_STATE_DIR=/your/path/to/.openclaw/state\n` +
        `4. 重启 TraceFlow 服务`
      );
    }
    
    return this.fileTreeService.getTree(stateRoot, queryPath);
  }

  /**
   * 获取文件内容
   */
  @Get('file/*path')
  async getFile(@Param('path') filePath: string | string[], @Res() res: Response) {
    const stateRoot = await this.getStateRoot();
    return this.fileTreeService.getFile(stateRoot, filePath, res);
  }
}
