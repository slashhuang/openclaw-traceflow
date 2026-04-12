import {
  Controller,
  Get,
  Param,
  Query,
  Res,
  Put,
  Delete,
  Body,
} from '@nestjs/common';
import type { Response } from 'express';
import * as path from 'path';
import * as os from 'os';
import { FileTreeService } from '../common/file-tree.service';
import type {
  FileWriteRequest,
  FileWriteResponse,
} from '../common/file-tree.service';
import { ConfigService } from '../config/config.service';

@Controller('api/workspace')
export class WorkspaceController {
  constructor(
    private readonly configService: ConfigService,
    private readonly fileTreeService: FileTreeService,
  ) {}

  private getWorkspaceRoot(): string {
    const cfg = this.configService.getConfig();
    const dir = cfg.openclawWorkspaceDir?.trim();
    if (dir) return dir;
    return path.join(os.homedir(), '.openclaw', 'workspace');
  }

  /**
   * 获取目录树结构
   */
  @Get('tree')
  async getTree(@Query('path') queryPath?: string) {
    const workspaceRoot = this.getWorkspaceRoot();
    return this.fileTreeService.getTree(workspaceRoot, queryPath);
  }

  /**
   * 获取文件内容
   */
  @Get('file/*path')
  async getFile(
    @Param('path') filePath: string | string[],
    @Res() res: Response,
  ) {
    const workspaceRoot = this.getWorkspaceRoot();
    return this.fileTreeService.getFile(workspaceRoot, filePath, res);
  }

  /**
   * 写入/编辑文件内容
   */
  @Put('file/*path')
  async putFile(
    @Param('path') filePath: string | string[],
    @Body() body: FileWriteRequest,
  ): Promise<FileWriteResponse> {
    const workspaceRoot = this.getWorkspaceRoot();
    return this.fileTreeService.writeFile(workspaceRoot, filePath, body);
  }

  /**
   * 删除文件
   */
  @Delete('file/*path')
  async deleteFile(@Param('path') filePath: string | string[]) {
    const workspaceRoot = this.getWorkspaceRoot();
    return this.fileTreeService.deleteFile(workspaceRoot, filePath);
  }
}
