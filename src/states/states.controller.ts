import {
  Controller,
  Get,
  Param,
  Query,
  Res,
  BadRequestException,
} from '@nestjs/common';
import type { Response } from 'express';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { FileTreeService } from '../common/file-tree.service';
import { ConfigService } from '../config/config.service';

@Controller('api/states')
export class StatesController {
  constructor(
    private readonly configService: ConfigService,
    private readonly fileTreeService: FileTreeService,
  ) {}

  private getStateRoot(): string {
    const cfg = this.configService.getConfig();
    const dir = cfg.openclawStateDir?.trim();
    if (dir) return dir;
    return path.join(os.homedir(), '.openclaw');
  }

  /**
   * 获取目录树结构
   */
  @Get('tree')
  async getTree(@Query('path') queryPath?: string) {
    const stateRoot = this.getStateRoot();

    if (!fs.existsSync(stateRoot)) {
      throw new BadRequestException(
        `OpenClaw state 目录不存在：${stateRoot}\n\n` +
          `请配置正确的路径：\n` +
          `1. 编辑 config/openclaw.runtime.json\n` +
          `2. 设置 "openclawStateDir": "/your/path/to/.openclaw/state"\n` +
          `3. 或设置环境变量 OPENCLAW_STATE_DIR=/your/path/to/.openclaw/state\n` +
          `4. 重启 TraceFlow 服务`,
      );
    }

    return this.fileTreeService.getTree(stateRoot, queryPath);
  }

  /**
   * 获取文件内容
   */
  @Get('file/*path')
  async getFile(
    @Param('path') filePath: string | string[],
    @Res() res: Response,
  ) {
    const stateRoot = this.getStateRoot();
    return this.fileTreeService.getFile(stateRoot, filePath, res);
  }
}
