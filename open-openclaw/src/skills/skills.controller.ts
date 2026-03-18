import { Controller, Get, Logger } from '@nestjs/common';
import { OpenClawService } from '../openclaw/openclaw.service';
import { SkillsService, SkillUsage, SystemPromptAnalysis } from './skills.service';

@Controller('api/skills')
export class SkillsController {
  private readonly logger = new Logger(SkillsController.name);

  constructor(
    private readonly skillsService: SkillsService,
    private readonly openclawService: OpenClawService,
  ) {}

  /**
   * 获取所有 skills 的使用情况
   */
  @Get('usage')
  async getSkillsUsage(): Promise<SkillUsage[]> {
    this.logger.log('Getting skills usage');
    return await this.skillsService.getAllSkills();
  }

  /**
   * 分析 SystemPrompt
   */
  @Get('system-prompt/analysis')
  async analyzeSystemPrompt(): Promise<SystemPromptAnalysis> {
    this.logger.log('Analyzing system prompt');
    return await this.skillsService.analyzeSystemPrompt();
  }

  /**
   * Gateway 连接后嗅探 systemPromptReport（sessions.usage）+ transcript system 消息
   */
  @Get('system-prompt/probe')
  async probeSystemPrompt() {
    this.logger.log('Probing system prompt via Gateway');
    return this.openclawService.probeSystemPrompt();
  }
}
