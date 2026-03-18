import { Injectable, Logger } from '@nestjs/common';
import { OpenClawService } from '../openclaw/openclaw.service';
import * as fs from 'fs';
import * as path from 'path';

export interface SkillUsage {
  name: string;
  enabled: boolean;
  description: string;
  triggers: string[];
  tokenCount: number;
  lastUsed: number | null;
  callCount: number;
  callHistory: { date: string; count: number }[];
  successRate: number;
  avgDuration: number;
  duplicateWith?: string[];
  conflictWith?: string[];
  isZombie?: boolean;
}

export interface SystemPromptAnalysis {
  totalTokens: number;
  activeSkillsTokens: number;
  zombieSkillsTokens: number;
  duplicateSkillsTokens: number;
  savings: number;
  savingsPercent: number;
  recommendations: string[];
}

@Injectable()
export class SkillsService {
  private readonly logger = new Logger(SkillsService.name);

  constructor(private readonly openclaw: OpenClawService) {}

  /**
   * 获取 workspace 路径
   */
  async getWorkspacePath(): Promise<string> {
    const paths = await this.openclaw.getResolvedPaths();
    return paths.stateDir || '';
  }

  /**
   * 获取所有 skills 的元数据
   */
  async getAllSkills(): Promise<SkillUsage[]> {
    const workspacePath = await this.getWorkspacePath();
    const skillsPath = path.join(workspacePath, 'skills');

    if (!fs.existsSync(skillsPath)) {
      this.logger.warn(`Skills directory not found: ${skillsPath}`);
      return [];
    }

    const skillDirs = fs.readdirSync(skillsPath);
    const skills: SkillUsage[] = [];

    for (const dir of skillDirs) {
      const skillPath = path.join(skillsPath, dir);
      if (!fs.statSync(skillPath).isDirectory()) continue;

      const skillMeta = await this.parseSkillMeta(skillPath);
      if (skillMeta) {
        skills.push(skillMeta);
      }
    }

    // 分析调用频率
    const usageStats = await this.analyzeUsage(skills);
    
    // 检测重复和冲突
    const duplicates = this.detectDuplicates(skills);
    const conflicts = this.detectConflicts(skills);

    // 合并分析结果
    return skills.map(skill => ({
      ...skill,
      ...usageStats.get(skill.name),
      duplicateWith: duplicates.get(skill.name),
      conflictWith: conflicts.get(skill.name),
    }));
  }

  /**
   * 解析单个 skill 的元数据
   */
  private async parseSkillMeta(skillPath: string): Promise<SkillUsage | null> {
    const skillMdPath = path.join(skillPath, 'SKILL.md');
    
    if (!fs.existsSync(skillMdPath)) {
      return null;
    }

    const content = fs.readFileSync(skillMdPath, 'utf-8');
    
    // 解析 SKILL.md 的 frontmatter
    const frontmatter = this.parseFrontmatter(content);
    
    // 计算 token 数量（简单估算：每 4 个字符约 1 个 token）
    const tokenCount = Math.ceil(content.length / 4);

    return {
      name: path.basename(skillPath),
      enabled: frontmatter.enabled !== false,
      description: frontmatter.description || '',
      triggers: frontmatter.triggers || [],
      tokenCount,
      lastUsed: null,
      callCount: 0,
      callHistory: [],
      successRate: 0,
      avgDuration: 0,
    };
  }

  /**
   * 解析 frontmatter
   */
  private parseFrontmatter(content: string): any {
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (!match) return {};

    const frontmatter: any = {};
    const lines = match[1].split('\n');

    for (const line of lines) {
      const [key, ...valueParts] = line.split(':');
      if (key && valueParts.length) {
        const value = valueParts.join(':').trim().replace(/['"]/g, '');
        frontmatter[key.trim()] = value;
      }
    }

    // 解析 triggers（可能是数组或字符串）
    if (frontmatter.triggers) {
      const triggersStr = frontmatter.triggers;
      if (triggersStr.startsWith('[')) {
        // 数组格式：["搜索", "查询"]
        frontmatter.triggers = triggersStr
          .replace(/[\[\]"]/g, '')
          .split(',')
          .map(s => s.trim())
          .filter(Boolean);
      } else {
        // 字符串格式：搜索，查询
        frontmatter.triggers = triggersStr.split(/[,,]/).map(s => s.trim());
      }
    }

    return frontmatter;
  }

  /**
   * 分析 skills 使用情况
   */
  private async analyzeUsage(skills: SkillUsage[]): Promise<Map<string, Partial<SkillUsage>>> {
    const stats = new Map<string, Partial<SkillUsage>>();

    try {
      // 获取会话列表
      const sessions = await this.openclaw.listSessions();

      // 分析每个会话的历史
      for (const session of sessions) {
        const sessionDetail = await this.openclaw.getSessionDetail(session.sessionKey);

        // 分析 tool calls
        if (sessionDetail?.toolCalls) {
          for (const toolCall of sessionDetail.toolCalls) {
            const skillName = toolCall.name;
            const existing = stats.get(skillName) || { callCount: 0, callHistory: [] };

            existing.callCount = (existing.callCount || 0) + 1;

            // 按日期统计
            const date = new Date(session.lastActiveAt).toISOString().split('T')[0];
            const dateEntry = existing.callHistory?.find(h => h.date === date);
            if (dateEntry) {
              dateEntry.count += 1;
            } else {
              existing.callHistory?.push({ date, count: 1 });
            }
          }
        }
      }

      // 计算最后使用频率
      const now = Date.now();
      const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

      for (const [skillName, skillStats] of stats.entries()) {
        // 找出最后使用时间
        if (skillStats.callHistory && skillStats.callHistory.length > 0) {
          const sortedHistory = [...skillStats.callHistory].sort((a, b) =>
            new Date(b.date).getTime() - new Date(a.date).getTime()
          );
          skillStats.lastUsed = new Date(sortedHistory[0].date).getTime();
        }

        // 标记僵尸 skills（30 天未使用）- 使用可选属性
        if (skillStats.lastUsed && skillStats.lastUsed < thirtyDaysAgo) {
          (skillStats as any).isZombie = true;
        }
      }
    } catch (error) {
      this.logger.error('Failed to analyze skill usage', error);
    }

    return stats;
  }

  /**
   * 检测重复的 skills
   */
  private detectDuplicates(skills: SkillUsage[]): Map<string, string[]> {
    const duplicates = new Map<string, string[]>();
    
    for (let i = 0; i < skills.length; i++) {
      for (let j = i + 1; j < skills.length; j++) {
        const skill1 = skills[i];
        const skill2 = skills[j];
        
        // 检测触发条件重叠
        const overlapTriggers = skill1.triggers.filter(t1 => 
          skill2.triggers.some(t2 => t1 === t2)
        );
        
        if (overlapTriggers.length > 0) {
          // 触发条件有重叠
          const existing1 = duplicates.get(skill1.name) || [];
          const existing2 = duplicates.get(skill2.name) || [];
          
          if (!existing1.includes(skill2.name)) {
            existing1.push(skill2.name);
            duplicates.set(skill1.name, existing1);
          }
          
          if (!existing2.includes(skill1.name)) {
            existing2.push(skill1.name);
            duplicates.set(skill2.name, existing2);
          }
        }
      }
    }
    
    return duplicates;
  }

  /**
   * 检测冲突的 skills
   */
  private detectConflicts(skills: SkillUsage[]): Map<string, string[]> {
    // TODO: 实现冲突检测逻辑
    // 需要分析 skills 的指令内容，识别相互矛盾的指令
    return new Map<string, string[]>();
  }

  /**
   * 分析 SystemPrompt
   */
  async analyzeSystemPrompt(): Promise<SystemPromptAnalysis> {
    const skills = await this.getAllSkills();
    
    const activeSkills = skills.filter(s => s.enabled);
    const zombieSkills = skills.filter(s => !s.lastUsed || s.lastUsed < Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    // 找出重复的 skills
    const duplicates = this.detectDuplicates(skills);
    const duplicateSkillNames = new Set<string>();
    for (const [_, dupes] of duplicates) {
      for (const dupe of dupes) {
        duplicateSkillNames.add(dupe);
      }
    }
    
    const duplicateSkills = skills.filter(s => duplicateSkillNames.has(s.name));
    
    const totalTokens = skills.reduce((sum, s) => sum + s.tokenCount, 0);
    const activeSkillsTokens = activeSkills.reduce((sum, s) => sum + s.tokenCount, 0);
    const zombieSkillsTokens = zombieSkills.reduce((sum, s) => sum + s.tokenCount, 0);
    const duplicateSkillsTokens = duplicateSkills.reduce((sum, s) => sum + s.tokenCount, 0);
    
    const savings = zombieSkillsTokens + duplicateSkillsTokens;
    const savingsPercent = totalTokens > 0 ? Math.round((savings / totalTokens) * 100) : 0;
    
    const recommendations: string[] = [];
    
    if (zombieSkills.length > 0) {
      recommendations.push(`建议移除 ${zombieSkills.length} 个僵尸 skills（30 天未使用），可节省 ${zombieSkillsTokens} tokens`);
    }
    
    if (duplicateSkills.length > 0) {
      recommendations.push(`建议合并 ${duplicateSkills.length} 个重复 skills，可节省 ${duplicateSkillsTokens} tokens`);
    }
    
    return {
      totalTokens,
      activeSkillsTokens,
      zombieSkillsTokens,
      duplicateSkillsTokens,
      savings,
      savingsPercent,
      recommendations,
    };
  }
}
