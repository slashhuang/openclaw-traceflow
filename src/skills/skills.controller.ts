import { Controller, Get, Header, Logger } from '@nestjs/common';
import {
  SkillsService,
  SkillUsage,
  SystemPromptAnalysis,
} from './skills.service';

@Controller('api/skills')
export class SkillsController {
  private readonly logger = new Logger(SkillsController.name);

  constructor(private readonly skillsService: SkillsService) {}

  /**
   * 获取所有 skills 的使用情况（从缓存返回）
   */
  @Get('usage')
  async getSkillsUsage(): Promise<SkillUsage[]> {
    return await this.skillsService.getCachedSkills();
  }

  /**
   * 分析 SystemPrompt（从缓存返回，鉴权成功后由 refreshCache 预加载）
   * Cache-Control 避免浏览器返回 304 导致展示过期数据
   */
  @Get('system-prompt/analysis')
  @Header('Cache-Control', 'no-cache, max-age=60')
  async analyzeSystemPrompt(): Promise<SystemPromptAnalysis> {
    return await this.skillsService.getCachedAnalysis();
  }
}
