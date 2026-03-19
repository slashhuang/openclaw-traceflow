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
   * 获取 skill × tool 关联（每个 skill 被调用时，同会话内各工具的调用分布）
   */
  @Get('skill-tool-usage')
  async getSkillToolUsage() {
    this.logger.log('Getting skill-tool usage');
    return await this.skillsService.getSkillToolUsage();
  }

  /**
   * 获取 skill × 用户 使用分布（Top 10 skills，每 skill 各用户调用次数）
   */
  @Get('usage-by-user')
  async getSkillUsageByUser() {
    this.logger.log('Getting skill usage by user');
    return await this.skillsService.getSkillUsageByUser();
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
  * 仅离线重建 system prompt 正文（不会读取 transcript system 消息）
   */
  @Get('system-prompt/probe')
  async probeSystemPrompt() {
    this.logger.log('Probing system prompt via Gateway');
    return this.openclawService.probeSystemPrompt();
  }
}
