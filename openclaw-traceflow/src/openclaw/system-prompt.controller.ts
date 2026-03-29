import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Logger,
  Put,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
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

  @Put('system-prompt/workspace-file')
  @UseGuards(AuthGuard)
  async putWorkspaceBootstrapFile(@Body() body: PutWorkspaceBootstrapBody) {
    if (!this.configService.isWorkspaceBootstrapWriteAllowed()) {
      throw new ForbiddenException(
        '当前 accessMode 为 none 且未开启 OPENCLAW_WORKSPACE_WRITE，禁止写入工作区引导文件。请将访问模式设为 token 或 local-only，或设置环境变量 OPENCLAW_WORKSPACE_WRITE=1（仅限可信环境）。',
      );
    }
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
