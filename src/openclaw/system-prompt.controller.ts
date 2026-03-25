import { Controller, Get, Logger } from '@nestjs/common';
import { OpenClawService } from './openclaw.service';

@Controller('api/skills')
export class SystemPromptController {
  private readonly logger = new Logger(SystemPromptController.name);

  constructor(private readonly openclawService: OpenClawService) {}

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

  @Get('usage')
  async getSkillsUsage() {
    this.logger.log('Getting skills usage (disabled)');
    return { skills: [] }; // 空数组（性能优化：不统计 skill usage）
  }
}
