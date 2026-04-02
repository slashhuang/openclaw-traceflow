import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  Res,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import { OpenClawService } from '../openclaw/openclaw.service';

interface Reflection {
  id: string;
  timestamp: string;
  sessionId: string;
  dimension: 'ai' | 'user' | 'interaction';
  category: string;
  priority: 'high' | 'medium' | 'low';
  triggerType: 'realtime-keyword' | 'periodic' | 'manual';
  finding: string;
  suggestion: string;
  userGuidance?: string;
  impact: string;
  occurrenceCount: number;
  sessionIds: string[];
  lastSeen: string;
  applicableTo: 'ai' | 'user' | 'both';
  status: 'pending' | 'applied' | 'ignored' | 'escalated';
  appliedAt?: string;
  note?: string;
  diff?: {
    file: string;
    old: Record<string, any>;
    new: Record<string, any>;
  };
  fullContent?: string;
}

@Controller('api/reflections')
export class ReflectionsController {
  constructor(private readonly openClawService: OpenClawService) {}

  /**
   * 获取反思记录文件路径
   *
   * 优先级（与 self-improvement skill 保持一致）：
   * 1. OPENCLAW_AUDIT_DIR 环境变量
   * 2. OPENCLAW_WORKSPACE_DIR/.openclawSelfImprovements
   * 3. ~/.openclaw/workspace/.openclawSelfImprovements
   */
  private async getReflectionsFile(): Promise<string> {
    // 1. 环境变量 OPENCLAW_AUDIT_DIR
    if (process.env.OPENCLAW_AUDIT_DIR?.trim()) {
      return path.resolve(
        process.env.OPENCLAW_AUDIT_DIR.trim(),
        'reflections.jsonl',
      );
    }

    // 2. OPENCLAW_WORKSPACE_DIR/.openclawSelfImprovements
    if (process.env.OPENCLAW_WORKSPACE_DIR?.trim()) {
      const workspaceDir = path.resolve(
        process.env.OPENCLAW_WORKSPACE_DIR.trim(),
      );
      return path.join(
        workspaceDir,
        '.openclawSelfImprovements',
        'reflections.jsonl',
      );
    }

    // 3. ~/.openclaw/workspace/.openclawSelfImprovements
    return path.join(
      os.homedir(),
      '.openclaw',
      'workspace',
      '.openclawSelfImprovements',
      'reflections.jsonl',
    );
  }

  /**
   * 读取反思记录文件（若不存在则 exists 为 false）
   */
  private async loadReflectionsFromFile(): Promise<{
    exists: boolean;
    reflections: Reflection[];
  }> {
    const reflectionsFile = await this.getReflectionsFile();

    try {
      await fs.access(reflectionsFile);
    } catch {
      return { exists: false, reflections: [] };
    }

    const content = await fs.readFile(reflectionsFile, 'utf-8');
    const lines = content
      .trim()
      .split('\n')
      .filter((line) => line.trim());

    const reflections: Reflection[] = [];
    for (const line of lines) {
      try {
        reflections.push(JSON.parse(line));
      } catch (e) {
        console.warn('[ReflectionsController] Failed to parse reflection:', e);
      }
    }

    return { exists: true, reflections };
  }

  /**
   * 写入反思记录（追加）
   */
  private async appendReflection(
    reflection: Partial<Reflection>,
  ): Promise<void> {
    const reflectionsFile = await this.getReflectionsFile();

    // 确保目录存在（从文件路径推断目录）
    const reflectionsDir = path.dirname(reflectionsFile);
    await fs.mkdir(reflectionsDir, { recursive: true });

    // JSONL 格式：单行 JSON
    const line = JSON.stringify(reflection) + '\n';
    await fs.appendFile(reflectionsFile, line, 'utf-8');
  }

  /**
   * 获取反思列表
   */
  @Get()
  async getReflections(
    @Query('status') status?: string,
    @Query('priority') priority?: string,
    @Query('dimension') dimension?: string,
    @Query('limit') limit?: number,
  ) {
    const { exists: reflectionsFileExists, reflections: allReflections } =
      await this.loadReflectionsFromFile();

    let reflections = allReflections;

    // 筛选
    if (status) {
      reflections = reflections.filter((r) => r.status === status);
    }
    if (priority) {
      reflections = reflections.filter((r) => r.priority === priority);
    }
    if (dimension) {
      reflections = reflections.filter((r) => r.dimension === dimension);
    }

    // 按时间倒序
    reflections.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );

    // 限制数量
    if (limit) {
      reflections = reflections.slice(0, limit);
    }

    // 统计
    const stats = {
      pending: reflections.filter((r) => r.status === 'pending').length,
      applied: reflections.filter((r) => r.status === 'applied').length,
      ignored: reflections.filter((r) => r.status === 'ignored').length,
      escalated: reflections.filter((r) => r.status === 'escalated').length,
    };

    return {
      reflections,
      stats,
      source: { reflectionsFileExists },
      ...(!reflectionsFileExists
        ? { code: 'REFLECTIONS_SOURCE_MISSING' as const }
        : {}),
      filters: {
        dimensions: ['ai', 'user', 'interaction'],
        categories: [
          'config',
          'skill',
          'prompt',
          'input-clarity',
          'interaction',
        ],
        priorities: ['high', 'medium', 'low'],
      },
    };
  }

  /**
   * 获取单条反思
   */
  @Get(':id')
  async getReflection(@Param('id') id: string) {
    const { reflections } = await this.loadReflectionsFromFile();
    const reflection = reflections.find((r) => r.id === id);

    if (!reflection) {
      return { error: 'Reflection not found' };
    }

    return reflection;
  }

  /**
   * 获取 Diff 内容
   */
  @Get(':id/diff')
  async getDiff(@Param('id') id: string) {
    const { reflections } = await this.loadReflectionsFromFile();
    const reflection = reflections.find((r) => r.id === id);

    if (!reflection) {
      return { error: 'Reflection not found' };
    }

    if (!reflection.diff) {
      return { error: 'No diff available' };
    }

    // 生成 unified diff
    const unified = [
      `--- ${reflection.diff.file} (old)`,
      `+++ ${reflection.diff.file} (new)`,
      ...Object.entries(reflection.diff.old).map(
        ([k, v]) => `- "${k}": ${JSON.stringify(v)}`,
      ),
      ...Object.entries(reflection.diff.new).map(
        ([k, v]) => `+ "${k}": ${JSON.stringify(v)}`,
      ),
    ].join('\n');

    return {
      file: reflection.diff.file,
      old: reflection.diff.old,
      new: reflection.diff.new,
      unified,
    };
  }

  /**
   * 获取完整内容
   */
  @Get(':id/full')
  async getFullContent(@Param('id') id: string) {
    const { reflections } = await this.loadReflectionsFromFile();
    const reflection = reflections.find((r) => r.id === id);

    if (!reflection) {
      return { error: 'Reflection not found' };
    }

    if (!reflection.fullContent) {
      return { error: 'No full content available' };
    }

    // 检测文件类型
    const file = reflection.diff?.file || 'config.json';
    const ext = path.extname(file).toLowerCase();
    const language =
      ext === '.json' ? 'json' : ext === '.md' ? 'markdown' : 'text';

    return {
      file,
      content: reflection.fullContent,
      language,
    };
  }

  /**
   * 标记为已应用
   */
  @Post(':id/apply')
  async applyReflection(
    @Param('id') id: string,
    @Body()
    body: { action?: 'apply' | 'ignore' | 'escalate'; note?: string } = {},
  ) {
    const { reflections } = await this.loadReflectionsFromFile();
    const index = reflections.findIndex((r) => r.id === id);

    if (index === -1) {
      return { error: 'Reflection not found' };
    }

    const action = body.action || 'apply';
    reflections[index].status =
      action === 'apply'
        ? 'applied'
        : action === 'ignore'
          ? 'ignored'
          : 'escalated';
    reflections[index].appliedAt = new Date().toISOString();

    if (body.note) {
      reflections[index].note = body.note;
    }

    // 重写整个文件
    const reflectionsFile = await this.getReflectionsFile();
    const content = reflections.map((r) => JSON.stringify(r)).join('\n') + '\n';
    await fs.writeFile(reflectionsFile, content, 'utf-8');

    return { success: true, reflection: reflections[index] };
  }

  /**
   * 创建反思（手动触发）
   */
  @Post()
  async createReflection(@Body() body: Partial<Reflection>) {
    const reflection: Partial<Reflection> = {
      id: `reflection-${Date.now()}`,
      timestamp: new Date().toISOString(),
      status: 'pending',
      applicableTo: 'both',
      ...body,
    };

    await this.appendReflection(reflection);

    return { success: true, reflection };
  }
}
