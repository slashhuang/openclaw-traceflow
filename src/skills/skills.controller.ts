import { Controller, Get, Logger } from '@nestjs/common';
import { SkillsService } from './skills.service';
import { OpenClawService } from '../openclaw/openclaw.service';

@Controller('api/skills')
export class SkillsController {
  private readonly logger = new Logger(SkillsController.name);

  constructor(
    private readonly skillsService: SkillsService,
    private readonly openclawService: OpenClawService,
  ) {}

  @Get('usage')
  async getSkillsUsage() {
    this.logger.log('Getting skills usage');
    return await this.skillsService.getAllSkills();
  }

  @Get('system-prompt/analysis')
  async analyzeSystemPrompt() {
    this.logger.log('Analyzing system prompt');
    return await this.skillsService.analyzeSystemPrompt();
  }

  @Get('system-prompt/probe')
  async probeSystemPrompt() {
    this.logger.log('Probing system prompt via Gateway');
    return this.openclawService.probeSystemPrompt();
  }
}
