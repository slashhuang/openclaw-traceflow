import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '../config/config.service';
import { OpenClawService } from '../openclaw/openclaw.service';
import * as fs from 'fs';
import * as path from 'path';

/** 缓存 TTL：5 分钟 */
const CACHE_TTL_MS = 5 * 60 * 1000;

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

/** 按 md 文件分类的 token 分布 */
export interface ByMdFile {
  file: string;
  tokenCount: number;
  bytes: number;
  source?: string;
  /** 文件内容（用于 assembledPrompt） */
  content?: string;
}

/** 按 skill 分类的 token 分布 */
export interface BySkill {
  name: string;
  tokenCount: number;
  enabled: boolean;
  isZombie?: boolean;
  duplicateWith?: string[];
}

/** 分层结构（与 wave-openclaw-wrapper dashboard 对齐，用于堆叠条形图） */
export interface PromptLayer {
  id: string;
  label: string;
  bytes: number;
  tokenCount: number;
  color: string;
  controllable: boolean;
  count?: number;
  categories?: Record<string, number>;
  files?: { name: string; bytes: number; source?: string }[];
}

export interface SystemPromptAnalysis {
  totalTokens: number;
  activeSkillsTokens: number;
  zombieSkillsTokens: number;
  duplicateSkillsTokens: number;
  savings: number;
  savingsPercent: number;
  recommendations: string[];
  /** 按 md 文件分门别类 */
  byMdFile: ByMdFile[];
  /** 按 skill 分门别类 */
  bySkill: BySkill[];
  /** 分层结构（工具定义、框架核心、Skills 目录等，用于堆叠条形图） */
  layers: PromptLayer[];
  /** 总字节数 */
  totalBytes: number;
  /** 混合中英文 token 估算：bytes / 2.5 */
  estimatedTokens: number;
  /** 完整 system prompt（markdown，用于前端渲染） */
  assembledPrompt?: string;
  updatedAt: number;
}

interface SystemPromptCache {
  analysis: SystemPromptAnalysis;
  skills: SkillUsage[];
  updatedAt: number;
}

@Injectable()
export class SkillsService {
  private readonly logger = new Logger(SkillsService.name);
  private cache: SystemPromptCache | null = null;

  constructor(
    private readonly openclaw: OpenClawService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * 从 gateway URL 推导 dashboard URL（同 host，端口 8899）
   */
  private getDashboardUrl(): string | null {
    const gatewayUrl = this.configService.getConfig().openclawGatewayUrl?.trim();
    if (!gatewayUrl) return null;
    try {
      const u = new URL(gatewayUrl);
      return `${u.protocol}//${u.hostname}:8899`;
    } catch {
      return null;
    }
  }

  /**
   * 通过 HTTP 嗅探 dashboard 获取 system prompt（非磁盘读取）
   */
  private async sniffFromDashboard(dashboardUrl: string): Promise<{
    analysis: SystemPromptAnalysis;
    skills: SkillUsage[];
  } | null> {
    const apiUrl = `${dashboardUrl.replace(/\/$/, '')}/api/system-prompt`;
    try {
      const res = await fetch(apiUrl, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) return null;
      const data = (await res.json()) as {
        layers?: PromptLayer[];
        totalBytes?: number;
        estimatedTokens?: number;
        assembledPrompt?: string;
        updatedAt?: number;
      };
      if (!data?.layers || typeof data.totalBytes !== 'number') return null;

      const totalTokens = data.estimatedTokens ?? Math.round((data.totalBytes ?? 0) / 2.5);
      const skills = await this.getAllSkills();
      const analysis: SystemPromptAnalysis = {
        totalTokens,
        activeSkillsTokens: 0,
        zombieSkillsTokens: 0,
        duplicateSkillsTokens: 0,
        savings: 0,
        savingsPercent: 0,
        recommendations: [],
        byMdFile: [],
        bySkill: skills.map(s => ({
          name: s.name,
          tokenCount: s.tokenCount,
          enabled: s.enabled,
          isZombie: s.isZombie,
          duplicateWith: s.duplicateWith,
        })),
        layers: data.layers.map(l => ({
          ...l,
          tokenCount: l.tokenCount ?? Math.round((l.bytes ?? 0) / 2.5),
        })),
        totalBytes: data.totalBytes ?? 0,
        estimatedTokens: totalTokens,
        assembledPrompt: data.assembledPrompt ?? '',
        updatedAt: data.updatedAt ?? Date.now(),
      };
      return { analysis, skills };
    } catch (err) {
      this.logger.debug(`Dashboard 嗅探失败: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  /**
   * 鉴权成功后调用：优先通过 HTTP 嗅探 dashboard 获取 systemPrompt，失败则回退到磁盘读取
   */
  async refreshCache(): Promise<void> {
    try {
      const dashboardUrl = this.getDashboardUrl();
      if (dashboardUrl) {
        const sniffed = await this.sniffFromDashboard(dashboardUrl);
        if (sniffed) {
          this.cache = { ...sniffed, updatedAt: Date.now() };
          this.logger.debug(
            `SystemPrompt 缓存已刷新（嗅探）: ${sniffed.analysis.totalTokens} tokens, ${sniffed.skills.length} skills`,
          );
          return;
        }
      }

      // 回退：从磁盘读取
      const skills = await this.getAllSkills();
      const analysis = await this.buildAnalysis(skills);
      this.cache = { analysis, skills, updatedAt: Date.now() };
      this.logger.debug(
        `SystemPrompt 缓存已刷新（磁盘）: ${analysis.totalTokens} tokens, ${skills.length} skills`,
      );
    } catch (err) {
      this.logger.warn(`SystemPrompt 缓存刷新失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** 获取缓存的 analysis，若无或过期则刷新 */
  async getCachedAnalysis(): Promise<SystemPromptAnalysis> {
    const now = Date.now();
    if (!this.cache || now - this.cache.updatedAt > CACHE_TTL_MS) {
      await this.refreshCache();
    }
    if (this.cache) return this.cache.analysis;
    return this.buildEmptyAnalysis();
  }

  /** 获取缓存的 skills */
  async getCachedSkills(): Promise<SkillUsage[]> {
    const now = Date.now();
    if (!this.cache || now - this.cache.updatedAt > CACHE_TTL_MS) {
      await this.refreshCache();
    }
    return this.cache?.skills ?? [];
  }

  private buildEmptyAnalysis(): SystemPromptAnalysis {
    return {
      totalTokens: 0,
      activeSkillsTokens: 0,
      zombieSkillsTokens: 0,
      duplicateSkillsTokens: 0,
      savings: 0,
      savingsPercent: 0,
      recommendations: [],
      byMdFile: [],
      bySkill: [],
      layers: [],
      totalBytes: 0,
      estimatedTokens: 0,
      assembledPrompt: '',
      updatedAt: Date.now(),
    };
  }

  /**
   * 获取 workspace 路径（优先 workspaceDir，fallback stateDir）
   */
  async getWorkspacePath(): Promise<string> {
    const paths = await this.openclaw.getResolvedPaths();
    return paths.workspaceDir || paths.stateDir || '';
  }

  /**
   * 嗅探 md 文件（AGENTS.md、TOOLS.md 等）的 token 分布
   */
  private async sniffByMdFile(workspacePath: string): Promise<ByMdFile[]> {
    const result: ByMdFile[] = [];
    const presetNames = [
      'AGENTS.md',
      'SOUL.md',
      'TOOLS.md',
      'IDENTITY.md',
      'USER.md',
      'HEARTBEAT.md',
    ];

    if (!workspacePath || !fs.existsSync(workspacePath)) {
      return result;
    }

    // 1. 从 workspace 根目录
    for (const name of presetNames) {
      const p = path.join(workspacePath, name);
      if (fs.existsSync(p)) {
        const content = fs.readFileSync(p, 'utf-8');
        const bytes = Buffer.byteLength(content, 'utf-8');
        result.push({
          file: name,
          tokenCount: Math.ceil(bytes / 4),
          bytes,
          source: 'workspace',
          content,
        });
      }
    }

    // 2. 从 workspace 上级目录寻找 wave-fe-agent-preset（wave-openclaw-wrapper 结构）
    let dir = workspacePath;
    for (let i = 0; i < 5 && dir; i++) {
      const presetDir = path.join(dir, 'wave-fe-agent-preset');
      if (fs.existsSync(presetDir)) {
        for (const name of presetNames) {
          const p = path.join(presetDir, name);
          if (fs.existsSync(p) && !result.some(r => r.file === name)) {
            const content = fs.readFileSync(p, 'utf-8');
            const bytes = Buffer.byteLength(content, 'utf-8');
            result.push({
              file: name,
              tokenCount: Math.ceil(bytes / 4),
              bytes,
              source: 'preset',
              content,
            });
          }
        }
        break;
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }

    // 3. MEMORY.md
    const memoryPath = path.join(workspacePath, 'MEMORY.md');
    if (fs.existsSync(memoryPath)) {
      const content = fs.readFileSync(memoryPath, 'utf-8');
      const bytes = Buffer.byteLength(content, 'utf-8');
      result.push({
        file: 'MEMORY.md',
        tokenCount: Math.ceil(bytes / 4),
        bytes,
        source: 'workspace',
        content,
      });
    }

    return result;
  }

  /**
   * 嗅探工具定义（tool-definitions.json，与 dashboard 对齐）
   */
  private sniffToolDefinitions(workspacePath: string): {
    bytes: number;
    count: number;
    categories: Record<string, number>;
  } {
    let dir = workspacePath;
    for (let i = 0; i < 6 && dir; i++) {
      const candidates = [
        path.join(dir, 'dashboard', 'data', 'tool-definitions.json'),
        path.join(dir, '..', 'dashboard', 'data', 'tool-definitions.json'),
      ];
      for (const p of candidates) {
        if (fs.existsSync(p)) {
          try {
            const raw = fs.readFileSync(p, 'utf-8');
            const parsed = JSON.parse(raw) as { tools?: Array<{ category?: string }> };
            const tools = parsed.tools || [];
            const categories: Record<string, number> = {};
            for (const t of tools) {
              const cat = t.category || '未分类';
              categories[cat] = (categories[cat] || 0) + 1;
            }
            return {
              bytes: tools.length * 600,
              count: tools.length,
              categories,
            };
          } catch {
            /* ignore */
          }
        }
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
    return { bytes: 0, count: 0, categories: {} };
  }

  /**
   * 获取 skills 目录路径（尝试 workspace/skills、stateDir/skills、repo_root/skills）
   */
  private async getSkillsPath(): Promise<string | null> {
    const paths = await this.openclaw.getResolvedPaths();
    const candidates = [
      paths.workspaceDir ? path.join(paths.workspaceDir, 'skills') : null,
      paths.stateDir ? path.join(paths.stateDir, 'skills') : null,
      paths.workspaceDir ? path.join(paths.workspaceDir, '..', '..', '..', 'skills') : null, // wave-openclaw-wrapper 结构
    ].filter(Boolean) as string[];

    for (const p of candidates) {
      if (p && fs.existsSync(p)) return p;
    }
    return null;
  }

  /**
   * 获取所有 skills 的元数据
   */
  async getAllSkills(): Promise<SkillUsage[]> {
    const skillsPath = await this.getSkillsPath();

    if (!skillsPath) {
      this.logger.warn('Skills directory not found');
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

  /** 混合中英文 token 估算：bytes / 2.5（与 dashboard 一致） */
  private bytesToTokens(bytes: number): number {
    return Math.round(bytes / 2.5);
  }

  /**
   * 构建完整分析结果（含 layers、byMdFile、bySkill，与 dashboard 对齐）
   */
  private async buildAnalysis(skills: SkillUsage[]): Promise<SystemPromptAnalysis> {
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const workspacePath = await this.getWorkspacePath();
    const activeSkills = skills.filter(s => s.enabled);
    const zombieSkills = skills.filter(
      s => !s.lastUsed || s.lastUsed < thirtyDaysAgo,
    );
    const duplicates = this.detectDuplicates(skills);
    const duplicateSkillNames = new Set<string>();
    for (const [, dupes] of duplicates) {
      for (const dupe of dupes) {
        duplicateSkillNames.add(dupe);
      }
    }
    const duplicateSkills = skills.filter(s => duplicateSkillNames.has(s.name));

    const activeSkillsTokens = activeSkills.reduce(
      (sum, s) => sum + s.tokenCount,
      0,
    );
    const zombieSkillsTokens = zombieSkills.reduce(
      (sum, s) => sum + s.tokenCount,
      0,
    );
    const duplicateSkillsTokens = duplicateSkills.reduce(
      (sum, s) => sum + s.tokenCount,
      0,
    );

    const byMdFile = await this.sniffByMdFile(workspacePath);
    const toolDefs = this.sniffToolDefinitions(workspacePath);

    // Skills 目录：available_skills 块中的大小（name+description + XML 标签 ~120 bytes/skill）
    const skillsCatalogBytes = skills.reduce(
      (sum, s) =>
        sum + Buffer.byteLength(s.name + s.description, 'utf-8') + 120,
      0,
    );

    // 构建 layers（与 wave-openclaw-wrapper dashboard 一致）
    const layers: PromptLayer[] = [];

    // 1. Project Context
    const presetFiles = byMdFile.filter(f => f.file !== 'MEMORY.md');
    const projectContextBytes = presetFiles.reduce((s, f) => s + f.bytes, 0);
    if (projectContextBytes > 0) {
      layers.push({
        id: 'project-context',
        label: 'Project Context',
        bytes: projectContextBytes,
        tokenCount: this.bytesToTokens(projectContextBytes),
        color: '#bc8cff',
        controllable: true,
        files: presetFiles.map(f => ({
          name: f.file,
          bytes: f.bytes,
          source: f.source,
        })),
      });
    }

    // 2. MEMORY.md
    const memoryFile = byMdFile.find(f => f.file === 'MEMORY.md');
    if (memoryFile) {
      layers.push({
        id: 'memory',
        label: 'MEMORY.md',
        bytes: memoryFile.bytes,
        tokenCount: this.bytesToTokens(memoryFile.bytes),
        color: '#f85149',
        controllable: true,
      });
    }

    // 3. Skills 目录
    if (skillsCatalogBytes > 0) {
      layers.push({
        id: 'skills-catalog',
        label: 'Skills 目录',
        bytes: skillsCatalogBytes,
        tokenCount: this.bytesToTokens(skillsCatalogBytes),
        color: '#3fb950',
        controllable: true,
        count: skills.length,
      });
    }

    // 4. 工具定义
    if (toolDefs.bytes > 0) {
      layers.push({
        id: 'tool-definitions',
        label: '工具定义',
        bytes: toolDefs.bytes,
        tokenCount: this.bytesToTokens(toolDefs.bytes),
        color: '#58a6ff',
        controllable: false,
        count: toolDefs.count,
        categories: toolDefs.categories,
      });
    }

    // 5. 框架核心指令
    const frameworkBytes = 15000;
    layers.push({
      id: 'framework',
      label: '框架核心指令',
      bytes: frameworkBytes,
      tokenCount: this.bytesToTokens(frameworkBytes),
      color: '#484f58',
      controllable: false,
    });

    // 6. 运行时注入
    const runtimeBytes = 1500;
    layers.push({
      id: 'runtime',
      label: '运行时注入',
      bytes: runtimeBytes,
      tokenCount: this.bytesToTokens(runtimeBytes),
      color: '#6e7681',
      controllable: false,
    });

    const totalBytes = layers.reduce((s, l) => s + l.bytes, 0);
    const estimatedTokens = this.bytesToTokens(totalBytes);
    const totalTokens = estimatedTokens;

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

    const bySkill: BySkill[] = skills.map(s => ({
      name: s.name,
      tokenCount: s.tokenCount,
      enabled: s.enabled,
      isZombie: !s.lastUsed || s.lastUsed < thirtyDaysAgo,
      duplicateWith: duplicates.get(s.name),
    }));

    const assembledPrompt = this.buildAssembledPrompt(byMdFile, skills);

    return {
      totalTokens,
      activeSkillsTokens,
      zombieSkillsTokens,
      duplicateSkillsTokens,
      savings,
      savingsPercent,
      recommendations,
      byMdFile,
      bySkill,
      layers,
      totalBytes,
      estimatedTokens,
      assembledPrompt,
      updatedAt: Date.now(),
    };
  }

  /**
   * 组装完整 system prompt（markdown 格式，供前端渲染）
   */
  private buildAssembledPrompt(
    byMdFile: ByMdFile[],
    skills: SkillUsage[],
  ): string {
    const parts: string[] = [];

    const presetFiles = byMdFile.filter(f => f.file !== 'MEMORY.md');
    if (presetFiles.length > 0) {
      parts.push('## Project Context\n');
      for (const f of presetFiles) {
        if (f.content) {
          parts.push(`### ${f.file}\n\n`);
          parts.push(f.content.trim());
          parts.push('\n\n');
        }
      }
    }

    const memoryFile = byMdFile.find(f => f.file === 'MEMORY.md');
    if (memoryFile?.content) {
      parts.push('## MEMORY.md\n\n');
      parts.push(memoryFile.content.trim());
      parts.push('\n\n');
    }

    if (skills.length > 0) {
      parts.push('## Skills 目录\n\n');
      for (const s of skills) {
        parts.push(`- **${s.name}**${s.enabled ? '' : ' _(禁用)_'}: ${s.description || '（无描述）'}\n`);
      }
      parts.push('\n');
    }

    parts.push('---\n\n_（工具定义、框架核心指令、运行时注入等由 OpenClaw 运行时自动注入）_');

    return parts.join('');
  }

  /**
   * 分析 SystemPrompt（从缓存返回，鉴权成功后由 refreshCache 预加载）
   */
  async analyzeSystemPrompt(): Promise<SystemPromptAnalysis> {
    return this.getCachedAnalysis();
  }
}
