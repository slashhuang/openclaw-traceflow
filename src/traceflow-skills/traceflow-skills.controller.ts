import { Controller, Get } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs/promises';
import {
  BUNDLED_SKILL_FILES,
  BUNDLED_SKILL_IDS,
  type BundledSkillId,
} from './bundled-skills.constants';

export type TraceflowBundledSkillFile = { path: string; content: string };

export type TraceflowBundledSkill = {
  id: BundledSkillId;
  files: TraceflowBundledSkillFile[];
};

export type TraceflowSkillsResponse =
  | { success: true; skills: TraceflowBundledSkill[] }
  | { success: false; error: string };

/**
 * TraceFlow 配套 OpenClaw skills 的只读副本（供用户自行安装到 OpenClaw）。
 */
@Controller('api/traceflow-skills')
export class TraceflowSkillsController {
  private async resolveBundledSkillsRoot(): Promise<string | null> {
    const candidates = [
      path.join(process.cwd(), 'resources', 'bundled-skills'),
      path.join(__dirname, '..', 'resources', 'bundled-skills'),
    ];
    for (const root of candidates) {
      try {
        await fs.access(path.join(root, 'agent-audit', 'SKILL.md'));
        return root;
      } catch {
        /* try next */
      }
    }
    return null;
  }

  @Get()
  async listSkills(): Promise<TraceflowSkillsResponse> {
    try {
      const root = await this.resolveBundledSkillsRoot();
      if (!root) {
        return {
          success: false,
          error:
            'Bundled skills directory not found. Ensure resources/bundled-skills is present (run from TraceFlow project root).',
        };
      }

      const skills: TraceflowBundledSkill[] = [];

      for (const id of BUNDLED_SKILL_IDS) {
        const relFiles = BUNDLED_SKILL_FILES[id];
        const skillDir = path.join(root, id);
        const files: TraceflowBundledSkillFile[] = [];

        for (const rel of relFiles) {
          const filePath = path.join(skillDir, rel);
          const content = await fs.readFile(filePath, 'utf-8');
          files.push({ path: rel.replace(/\\/g, '/'), content });
        }

        skills.push({ id, files });
      }

      return {
        success: true,
        skills,
      };
    } catch (e) {
      console.error('[TraceflowSkillsController] listSkills error:', e);
      return {
        success: false,
        error: e instanceof Error ? e.message : 'Unknown error',
      };
    }
  }
}
