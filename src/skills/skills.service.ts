import { Injectable, Logger } from '@nestjs/common';
import { OpenClawService } from '../openclaw/openclaw.service';

export interface SkillsUsageResponse {
  skills: Array<{
    name: string;
    invocations: number;
    tokens: number;
  }>;
}

export interface SystemPromptAnalysisResponse {
  totalTokens: number;
  activeSkillsTokens: number;
  zombieSkillsTokens: number;
  duplicateSkillsTokens: number;
  savings: number;
  savingsPercent: number;
  recommendations: string[];
  zombieSkillNames: string[];
  duplicateSkillNames: string[];
}

@Injectable()
export class SkillsService {
  private readonly logger = new Logger(SkillsService.name);

  constructor(private readonly openclawService: OpenClawService) {}

  async getAllSkills(): Promise<SkillsUsageResponse> {
    this.logger.log('Getting all skills usage');
    // TODO: 实现 skills usage 统计
    return {
      skills: [],
    };
  }

  async analyzeSystemPrompt(): Promise<SystemPromptAnalysisResponse> {
    this.logger.log('Analyzing system prompt');
    // TODO: 实现 system prompt 分析
    return {
      totalTokens: 0,
      activeSkillsTokens: 0,
      zombieSkillsTokens: 0,
      duplicateSkillsTokens: 0,
      savings: 0,
      savingsPercent: 0,
      recommendations: [],
      zombieSkillNames: [],
      duplicateSkillNames: [],
    };
  }
}
