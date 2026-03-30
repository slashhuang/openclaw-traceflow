import { Injectable, BadRequestException } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ConfigService } from '../config/config.service';
import {
  SESSION_EVALUATION_PROMPT_V1,
  WORKSPACE_BOOTSTRAP_EVALUATION_PROMPT_V1,
} from './evaluation-prompt';

export const EVALUATION_PROMPT_OVERRIDE_FILENAME =
  'evaluation-prompt-override.json';
export const WORKSPACE_BOOTSTRAP_EVAL_PROMPT_OVERRIDE_FILENAME =
  'workspace-bootstrap-eval-prompt-override.json';
export const EVALUATION_PROMPT_MAX_BYTES = 256 * 1024;
export const CONTEXT_PLACEHOLDER = '{context}';

export type PromptTemplateSource = 'builtin' | 'override';

export interface EffectiveEvaluationPrompt {
  template: string;
  promptVersion: string;
  source: PromptTemplateSource;
}

interface OverrideFileShape {
  template: string;
  updatedAt: string;
}

@Injectable()
export class EvaluationPromptConfigService {
  constructor(private readonly configService: ConfigService) {}

  private overridePath(): string {
    return path.join(
      this.configService.getConfig().dataDir,
      EVALUATION_PROMPT_OVERRIDE_FILENAME,
    );
  }

  private workspaceOverridePath(): string {
    return path.join(
      this.configService.getConfig().dataDir,
      WORKSPACE_BOOTSTRAP_EVAL_PROMPT_OVERRIDE_FILENAME,
    );
  }

  getBuiltinTemplate(): string {
    return SESSION_EVALUATION_PROMPT_V1;
  }

  getBuiltinWorkspaceTemplate(): string {
    return WORKSPACE_BOOTSTRAP_EVALUATION_PROMPT_V1;
  }

  async getEffective(): Promise<EffectiveEvaluationPrompt> {
    try {
      const raw = await fs.readFile(this.overridePath(), 'utf8');
      const parsed = JSON.parse(raw) as OverrideFileShape;
      if (typeof parsed.template !== 'string' || parsed.template.length === 0) {
        return this.builtinEffective();
      }
      return {
        template: parsed.template,
        promptVersion: 'eval-prompt-v1',
        source: 'override',
      };
    } catch (e: unknown) {
      const err = e as NodeJS.ErrnoException;
      if (err?.code === 'ENOENT') {
        return this.builtinEffective();
      }
      throw e;
    }
  }

  private builtinEffective(): EffectiveEvaluationPrompt {
    return {
      template: SESSION_EVALUATION_PROMPT_V1,
      promptVersion: 'eval-prompt-v1',
      source: 'builtin',
    };
  }

  validateTemplate(template: string): void {
    const t = template ?? '';
    if (!t.includes(CONTEXT_PLACEHOLDER)) {
      throw new BadRequestException(
        `模板必须包含占位符 ${CONTEXT_PLACEHOLDER}`,
      );
    }
    const bytes = Buffer.byteLength(t, 'utf8');
    if (bytes > EVALUATION_PROMPT_MAX_BYTES) {
      throw new BadRequestException(
        `模板过长（>${EVALUATION_PROMPT_MAX_BYTES} 字节）`,
      );
    }
  }

  async saveOverride(template: string): Promise<EffectiveEvaluationPrompt> {
    this.validateTemplate(template);
    const dir = this.configService.getConfig().dataDir;
    await fs.mkdir(dir, { recursive: true });
    const body: OverrideFileShape = {
      template,
      updatedAt: new Date().toISOString(),
    };
    await fs.writeFile(
      this.overridePath(),
      JSON.stringify(body, null, 2),
      'utf8',
    );
    return this.getEffective();
  }

  async clearOverride(): Promise<EffectiveEvaluationPrompt> {
    try {
      await fs.unlink(this.overridePath());
    } catch (e: unknown) {
      const err = e as NodeJS.ErrnoException;
      if (err?.code !== 'ENOENT') throw e;
    }
    return this.getEffective();
  }

  async getEffectiveWorkspace(): Promise<EffectiveEvaluationPrompt> {
    try {
      const raw = await fs.readFile(this.workspaceOverridePath(), 'utf8');
      const parsed = JSON.parse(raw) as OverrideFileShape;
      if (typeof parsed.template !== 'string' || parsed.template.length === 0) {
        return this.builtinWorkspaceEffective();
      }
      return {
        template: parsed.template,
        promptVersion: 'workspace-bootstrap-eval-v1',
        source: 'override',
      };
    } catch (e: unknown) {
      const err = e as NodeJS.ErrnoException;
      if (err?.code === 'ENOENT') {
        return this.builtinWorkspaceEffective();
      }
      throw e;
    }
  }

  private builtinWorkspaceEffective(): EffectiveEvaluationPrompt {
    return {
      template: WORKSPACE_BOOTSTRAP_EVALUATION_PROMPT_V1,
      promptVersion: 'workspace-bootstrap-eval-v1',
      source: 'builtin',
    };
  }

  async saveWorkspaceOverride(
    template: string,
  ): Promise<EffectiveEvaluationPrompt> {
    this.validateTemplate(template);
    const dir = this.configService.getConfig().dataDir;
    await fs.mkdir(dir, { recursive: true });
    const body: OverrideFileShape = {
      template,
      updatedAt: new Date().toISOString(),
    };
    await fs.writeFile(
      this.workspaceOverridePath(),
      JSON.stringify(body, null, 2),
      'utf8',
    );
    return this.getEffectiveWorkspace();
  }

  async clearWorkspaceOverride(): Promise<EffectiveEvaluationPrompt> {
    try {
      await fs.unlink(this.workspaceOverridePath());
    } catch (e: unknown) {
      const err = e as NodeJS.ErrnoException;
      if (err?.code !== 'ENOENT') throw e;
    }
    return this.getEffectiveWorkspace();
  }
}
