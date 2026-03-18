import { Controller, Get, Logger } from '@nestjs/common';
import { SkillsService, SkillUsage, SystemPromptAnalysis } from './skills.service';

@Controller('api/skills')
export class SkillsController {
  private readonly logger = new Logger(SkillsController.name);

  constructor(private readonly skillsService: SkillsService) {}

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
}
