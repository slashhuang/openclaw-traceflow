import {
  Body,
  Controller,
  Get,
  Logger,
  Put,
} from '@nestjs/common';
import { ConfigService } from '../config/config.service';
import { OpenClawService } from './openclaw.service';

export type PutWorkspaceBootstrapBody = {
  file: string;
  content: string;
  /** 与 probe workspaceFileContents[].mtimeMs 一致时用于乐观并发 */
  ifMatchMtimeMs?: number;
};

@Controller('api/skills')
export class SystemPromptController {
  private readonly logger = new Logger(SystemPromptController.name);

  constructor(
    private readonly openclawService: OpenClawService,
    private readonly configService: ConfigService,
  ) {}

  @Get('system-prompt/probe')
  async probeSystemPrompt() {
    this.logger.log('Probing system prompt via Gateway');
    return this.openclawService.probeSystemPrompt();
  }

  @Get('system-prompt/analysis')
  async analyzeSystemPrompt() {
    this.logger.log('Analyzing system prompt');
    return this.openclawService.analyzeSystemPrompt();
  }

  /**
   * 写入工作区引导文件（如 AGENTS.md 等）
   * 无权限限制，直接写入磁盘
   */
  @Put('system-prompt/workspace-file')
  async putWorkspaceBootstrapFile(@Body() body: PutWorkspaceBootstrapBody) {
    return this.openclawService.writeWorkspaceBootstrapFile({
      file: body?.file ?? '',
      content: body?.content ?? '',
      ifMatchMtimeMs: body?.ifMatchMtimeMs,
    });
  }

  @Get('usage')
  async getSkillsUsage() {
    this.logger.log('Getting skills usage (disabled)');
    return { skills: [] }; // 空数组（性能优化：不统计 skill usage）
  }
}
