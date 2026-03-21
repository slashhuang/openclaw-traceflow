import { Injectable, Logger } from '@nestjs/common';
import { OpenClawService } from '../openclaw/openclaw.service';
import {
  attributeToolCallsToSkillsByOrder,
  inferInvokedSkillsFromToolCalls,
} from '../skill-invocation';
import { inferSessionTypeLabel, resolveDisplayUser } from '../common/session-user-resolver';
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
  /** 调度/调用该 skill 的会话数 */
  sessionCount: number;
  /** 使用该 skill 的用户数 */
  userCount: number;
  /** 最近 7 天调用次数 */
  recent7dCalls: number;
  /** 最近 30 天调用次数 */
  recent30dCalls: number;
  /** 平均每会话调用次数 */
  avgCallsPerSession: number;
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
  /** 僵尸 skill 名称列表（30 天未使用），便于用户确认 */
  zombieSkillNames: string[];
  /** 重复 skill 名称列表，便于用户确认 */
  duplicateSkillNames: string[];
}

@Injectable()
export class SkillsService {
  private readonly logger = new Logger(SkillsService.name);
  /** SystemPrompt 分析结果缓存，避免健康检查/轮询造成重复重算 */
  private systemPromptCache: { at: number; value: SystemPromptAnalysis } | null = null;
  private static readonly SYSTEM_PROMPT_CACHE_TTL_MS = 30 * 1000;

  constructor(private readonly openclaw: OpenClawService) {}

  /**
   * 获取 skills 目录的根路径（优先 workspaceDir，skills 通常在 workspace/skills）
   */
  async getWorkspacePath(): Promise<string> {
    const paths = await this.openclaw.getResolvedPaths();
    return paths.workspaceDir || paths.stateDir || '';
  }

  /**
   * 解析 skills 目录：优先 workspace/skills，若不存在则从 stateDir 向上查找
   */
  private resolveSkillsDir(workspacePath: string, stateDir: string | null): string | null {
    const candidates: string[] = [];
    if (workspacePath) {
      candidates.push(path.join(workspacePath, 'skills'));
    }
    if (stateDir) {
      candidates.push(path.join(stateDir, 'skills'));
      // stateDir 如 .../wave-openclaw-wrapper/.runtime/home/.openclaw，向上找 wrapper/skills
      let dir = stateDir;
      for (let i = 0; i < 6; i++) {
        const parent = path.dirname(dir);
        if (parent === dir) break;
        const skillsInParent = path.join(parent, 'skills');
        if (fs.existsSync(skillsInParent)) {
          candidates.push(skillsInParent);
          break;
        }
        dir = parent;
      }
    }
    for (const p of candidates) {
      if (fs.existsSync(p)) return p;
    }
    return null;
  }

  /**
   * 获取所有 skills 的元数据
   */
  async getAllSkills(): Promise<SkillUsage[]> {
    const paths = await this.openclaw.getResolvedPaths();
    const workspacePath = paths.workspaceDir || paths.stateDir || '';
    const skillsPath = this.resolveSkillsDir(workspacePath, paths.stateDir);

    if (!skillsPath) {
      this.logger.warn(`Skills directory not found (tried workspace=${workspacePath}, stateDir=${paths.stateDir})`);
      return [];
    }

    const skillPathList: string[] = fs
      .readdirSync(skillsPath)
      .map((d) => path.join(skillsPath, d))
      .filter((p) => fs.statSync(p).isDirectory());
    // 合并 vendor 下的 skills（如 wave-openclaw-wrapper/vendor/openclaw-wave-extension/skills）
    const vendorSkillsPath = path.join(path.dirname(skillsPath), 'vendor', 'openclaw-wave-extension', 'skills');
    if (fs.existsSync(vendorSkillsPath)) {
      try {
        for (const d of fs.readdirSync(vendorSkillsPath)) {
          const p = path.join(vendorSkillsPath, d);
          if (fs.statSync(p).isDirectory()) skillPathList.push(p);
        }
      } catch {
        /* ignore */
      }
    }
    const skills: SkillUsage[] = [];
    for (const skillPath of skillPathList) {
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
      sessionCount: 0,
      userCount: 0,
      recent7dCalls: 0,
      recent30dCalls: 0,
      avgCallsPerSession: 0,
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
    const stats = new Map<
      string,
      Partial<SkillUsage> & {
        sessionIds: Set<string>;
        userIds: Set<string>;
      }
    >();

    try {
      const sessions = await this.openclaw.listSessions();
      const now = Date.now();
      const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
      const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

      for (const session of sessions) {
        const sessionDetail = await this.openclaw.getSessionDetail(session.sessionId);
        const rawUserId = sessionDetail?.userId ?? (session as { userId?: string }).userId ?? 'unknown';
        const typeLabel = inferSessionTypeLabel(session.sessionKey, session.sessionId);
        const systemSent = sessionDetail?.systemSent ?? (session as { systemSent?: boolean }).systemSent;
        const userId = resolveDisplayUser(rawUserId, typeLabel, systemSent);
        const sessionKey = session.sessionKey;

        if (sessionDetail?.toolCalls) {
          const invoked = inferInvokedSkillsFromToolCalls(sessionDetail.toolCalls);
          const date = new Date(session.lastActiveAt).toISOString().split('T')[0];
          for (const { skillName, readCount } of invoked) {
            let existing = stats.get(skillName);
            if (!existing) {
              existing = {
                callCount: 0,
                callHistory: [],
                sessionIds: new Set(),
                userIds: new Set(),
              };
              stats.set(skillName, existing);
            }
            existing.callCount = (existing.callCount || 0) + readCount;
            existing.sessionIds!.add(sessionKey);
            existing.userIds!.add(userId);
            const dateEntry = existing.callHistory?.find((h) => h.date === date);
            if (dateEntry) {
              dateEntry.count += readCount;
            } else {
              existing.callHistory = existing.callHistory || [];
              existing.callHistory.push({ date, count: readCount });
            }
          }
        }
      }

      for (const [skillName, skillStats] of stats.entries()) {
        const { sessionIds, userIds, callHistory, ...rest } = skillStats;
        const sessionCount = sessionIds?.size ?? 0;
        const userCount = userIds?.size ?? 0;
        const callCount = rest.callCount ?? 0;

        let recent7dCalls = 0;
        let recent30dCalls = 0;
        if (callHistory?.length) {
          for (const h of callHistory) {
            const t = new Date(h.date).getTime();
            if (t >= sevenDaysAgo) recent7dCalls += h.count;
            if (t >= thirtyDaysAgo) recent30dCalls += h.count;
          }
        }

        let lastUsed: number | null = null;
        if (callHistory?.length) {
          const sorted = [...callHistory].sort((a, b) =>
            new Date(b.date).getTime() - new Date(a.date).getTime()
          );
          lastUsed = new Date(sorted[0].date).getTime();
        }

        const avgCallsPerSession = sessionCount > 0 ? Math.round((callCount / sessionCount) * 10) / 10 : 0;

        stats.set(skillName, {
          ...rest,
          sessionIds: sessionIds ?? new Set(),
          userIds: userIds ?? new Set(),
          callCount,
          callHistory,
          sessionCount,
          userCount,
          recent7dCalls,
          recent30dCalls,
          lastUsed,
          avgCallsPerSession,
          isZombie: lastUsed != null && lastUsed < thirtyDaysAgo,
        });
      }
    } catch (error) {
      this.logger.error('Failed to analyze skill usage', error);
    }

    const result = new Map<string, Partial<SkillUsage>>();
    for (const [k, v] of stats.entries()) {
      const { sessionIds, userIds, ...rest } = v as any;
      result.set(k, rest);
    }
    return result;
  }

  /**
   * 获取 skill × tool 关联统计
   * 原理：按 transcript 顺序，在 read skills/xxx/SKILL.md 之后将后续工具归因到该 skill（见 attributeToolCallsToSkillsByOrder）
   */
  async getSkillToolUsage(): Promise<
    Array<{
      skillName: string;
      tools: Array<{ toolName: string; count: number }>;
      totalToolCalls: number;
    }>
  > {
    const skillToolMap = new Map<string, Map<string, number>>();

    try {
      const sessions = await this.openclaw.listSessions();
      for (const session of sessions) {
        const detail = await this.openclaw.getSessionDetail(session.sessionId);
        if (!detail?.toolCalls?.length) continue;

        const perSkill = attributeToolCallsToSkillsByOrder(detail.toolCalls);
        for (const [skillName, toolCounts] of perSkill) {
          let toolMap = skillToolMap.get(skillName);
          if (!toolMap) {
            toolMap = new Map<string, number>();
            skillToolMap.set(skillName, toolMap);
          }
          for (const [toolName, count] of toolCounts) {
            toolMap.set(toolName, (toolMap.get(toolName) ?? 0) + count);
          }
        }
      }

      return [...skillToolMap.entries()]
        .map(([skillName, toolMap]) => {
          const tools = [...toolMap.entries()]
            .map(([toolName, count]) => ({ toolName, count }))
            .sort((a, b) => b.count - a.count);
          const totalToolCalls = tools.reduce((s, t) => s + t.count, 0);
          return { skillName, tools, totalToolCalls };
        })
        .sort((a, b) => b.totalToolCalls - a.totalToolCalls);
    } catch (error) {
      this.logger.error('Failed to get skill-tool usage', error);
      return [];
    }
  }

  /**
   * 获取 skill × 用户 使用分布（用于柱状图）
   * 返回 top 10 skills，每 skill 含各用户的调用次数
   */
  async getSkillUsageByUser(): Promise<
    Array<{ skillName: string; users: Array<{ userId: string; count: number }> }>
  > {
    const skillUserMap = new Map<string, Map<string, number>>();

    try {
      const sessions = await this.openclaw.listSessions();
      for (const session of sessions) {
        const detail = await this.openclaw.getSessionDetail(session.sessionId);
        const rawUserId = detail?.userId ?? (session as { userId?: string }).userId ?? 'unknown';
        const typeLabel = inferSessionTypeLabel(session.sessionKey, session.sessionId);
        const systemSent = detail?.systemSent ?? (session as { systemSent?: boolean }).systemSent;
        const userId = resolveDisplayUser(rawUserId, typeLabel, systemSent);
        if (!detail?.toolCalls) continue;
        const invoked = inferInvokedSkillsFromToolCalls(detail.toolCalls);
        for (const { skillName, readCount } of invoked) {
          let userMap = skillUserMap.get(skillName);
          if (!userMap) {
            userMap = new Map<string, number>();
            skillUserMap.set(skillName, userMap);
          }
          userMap.set(userId, (userMap.get(userId) ?? 0) + readCount);
        }
      }

      const totalBySkill = new Map<string, number>();
      for (const [skill, userMap] of skillUserMap) {
        totalBySkill.set(skill, [...userMap.values()].reduce((a, b) => a + b, 0));
      }
      const topSkills = [...skillUserMap.entries()]
        .sort((a, b) => (totalBySkill.get(b[0]) ?? 0) - (totalBySkill.get(a[0]) ?? 0))
        .slice(0, 10);

      return topSkills.map(([skillName, userMap]) => ({
        skillName,
        users: [...userMap.entries()]
          .map(([userId, count]) => ({ userId, count }))
          .sort((a, b) => b.count - a.count),
      }));
    } catch (error) {
      this.logger.error('Failed to get skill usage by user', error);
      return [];
    }
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
  async refreshCache(): Promise<void> {
    try {
      const value = await this.computeSystemPromptAnalysis();
      this.systemPromptCache = { at: Date.now(), value };
    } catch (error) {
      // 健康检查场景下不希望因为分析失败导致请求失败
      this.logger.error('Failed to refresh system prompt cache', error);
    }
  }

  async analyzeSystemPrompt(): Promise<SystemPromptAnalysis> {
    const cache = this.systemPromptCache;
    const isFresh = cache && Date.now() - cache.at < SkillsService.SYSTEM_PROMPT_CACHE_TTL_MS;
    if (isFresh) {
      return cache!.value;
    }

    const value = await this.computeSystemPromptAnalysis();
    this.systemPromptCache = { at: Date.now(), value };
    return value;
  }

  private async computeSystemPromptAnalysis(): Promise<SystemPromptAnalysis> {
    const skills = await this.getAllSkills();

    const activeSkills = skills.filter((s) => s.enabled);
    const zombieSkills = skills.filter(
      (s) => !s.lastUsed || s.lastUsed < Date.now() - 30 * 24 * 60 * 60 * 1000,
    );

    // 找出重复的 skills
    const duplicates = this.detectDuplicates(skills);
    const duplicateSkillNames = new Set<string>();
    for (const [, dupes] of duplicates) {
      for (const dupe of dupes) {
        duplicateSkillNames.add(dupe);
      }
    }

    const duplicateSkills = skills.filter((s) => duplicateSkillNames.has(s.name));

    const totalTokens = skills.reduce((sum, s) => sum + s.tokenCount, 0);
    const activeSkillsTokens = activeSkills.reduce((sum, s) => sum + s.tokenCount, 0);
    const zombieSkillsTokens = zombieSkills.reduce((sum, s) => sum + s.tokenCount, 0);
    const duplicateSkillsTokens = duplicateSkills.reduce((sum, s) => sum + s.tokenCount, 0);

    const savings = zombieSkillsTokens + duplicateSkillsTokens;
    const savingsPercent =
      totalTokens > 0 ? Math.round((savings / totalTokens) * 100) : 0;

    const recommendations: string[] = [];

    if (zombieSkills.length > 0) {
      recommendations.push(
        `建议移除 ${zombieSkills.length} 个僵尸 skills（30 天未使用），可节省 ${zombieSkillsTokens} tokens`,
      );
    }

    if (duplicateSkills.length > 0) {
      recommendations.push(
        `建议合并 ${duplicateSkills.length} 个重复 skills，可节省 ${duplicateSkillsTokens} tokens`,
      );
    }

    return {
      totalTokens,
      activeSkillsTokens,
      zombieSkillsTokens,
      duplicateSkillsTokens,
      savings,
      savingsPercent,
      recommendations,
      zombieSkillNames: zombieSkills.map((s) => s.name),
      duplicateSkillNames: duplicateSkills.map((s) => s.name),
    };
  }
}
