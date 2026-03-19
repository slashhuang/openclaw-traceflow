import * as fs from 'fs';
import * as path from 'path';
import type { WorkspaceFileContent } from './system-prompt-probe';

type SkillEntry = { name: string; blockChars: number };

type ToolEntry = {
  id: string;
};

export function guessRuntimeLine(params: {
  agentId?: string;
  host?: string;
  os?: string;
  arch?: string;
  node?: string;
  model?: string;
  shell?: string;
  channel?: string;
}): string {
  const host = params.host ?? 'localhost';
  const osStr = params.os ?? `${process.platform}`;
  const arch = params.arch ?? process.arch;
  const node = params.node ?? process.version;
  const model = params.model ?? '';
  const shell = params.shell ?? process.env.SHELL ?? '';
  const channel = params.channel ?? '';

  // Keep format close to openclaw's Runtime line: "Runtime: a=... | b=... | thinking=off".
  const parts = [
    params.agentId ? `agent=${params.agentId}` : '',
    host ? `host=${host}` : '',
    osStr ? `os=${osStr}` : '',
    arch ? `arch=${arch}` : '',
    node ? `node=${node}` : '',
    model ? `model=${model}` : '',
    shell ? `shell=${shell}` : '',
    channel ? `channel=${channel}` : '',
    'thinking=off',
  ].filter(Boolean);
  return `Runtime: ${parts.join(' | ')}`;
}

/**
 * 离线重建一个“尽量贴近 openclaw buildAgentSystemPrompt 结构”的 systemPrompt markdown。
 * 目的不是字符级一致，而是生成可展示的结构化正文，并让前端 parseSystemPromptSections 能工作：
 * - 含 `# Project Context` 与 `## Silent Replies`
 * - 含 tool list 标记区（用于抽取 toolsListText）
 * - 含 `<skill>...</skill>` 块（用于抽取 skillBlocks）
 */
export async function rebuildSystemPromptMarkdown(params: {
  workspaceDir: string;
  workspaceFileContents: WorkspaceFileContent[];
  skills: SkillEntry[];
  /** skill name -> SKILL.md 绝对路径，来自 sessions.json skillsSnapshot.resolvedSkills */
  skillPaths?: Record<string, string>;
  /** 优先使用：OpenClaw 实际注入的 skills 文本（name+description+location，非 SKILL 全文） */
  skillsPromptOverride?: string;
  /** 用于 fallback：name+description+location 格式 */
  resolvedSkills?: Array<{ name: string; filePath?: string; description?: string }>;
  tools: Array<string>;
  provider?: string;
  model?: string;
  agentId?: string;
}): Promise<string> {
  const toolsSorted = params.tools.toSorted((a, b) => String(a).localeCompare(String(b)));
  const toolLines = toolsSorted.map((t) => `- ${String(t)}`).join('\n');

  // Tools list extraction markers must match system-prompt-probe.ts constants.
  const TOOL_LIST_START = 'Tool names are case-sensitive. Call tools exactly as listed.\n';
  const TOOL_LIST_END =
    '\nTOOLS.md does not control tool availability; it is user guidance for how to use external tools.';

  const toolingBlock = [
    '## Tooling',
    'Tool availability (filtered by policy):',
    `${TOOL_LIST_START}${toolLines}${TOOL_LIST_END}`,
    '',
  ].join('\n');

  function escapeXml(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  // OpenClaw 只注入 name+description+location（frontmatter），不加载 SKILL 全文
  const skillsPrompt =
    params.skillsPromptOverride?.trim() ||
    (() => {
      const skillPaths = params.skillPaths ?? {};
      const resolved = params.resolvedSkills;
      if (resolved?.length) {
        return resolved
          .map(
            (r) =>
              `<skill>\n<name>${String(r.name || '').trim()}</name>\n<description>${escapeXml(String(r.description || ''))}</description>\n<location>${escapeXml(String(r.filePath || ''))}</location>\n</skill>`,
          )
          .join('\n');
      }
      // 无 resolvedSkills 时用 name+location 兜底（Gateway 场景）
      return params.skills
        .map((s) => {
          const name = String(s.name || '').trim();
          if (!name) return '';
          const path_ = skillPaths[name] || path.join(params.workspaceDir, 'skills', name, 'SKILL.md');
          return `<skill>\n<name>${name}</name>\n<description>(use read to load)</description>\n<location>${escapeXml(path_)}</location>\n</skill>`;
        })
        .filter(Boolean)
        .join('\n');
    })();
  const skillsBlock = skillsPrompt
    ? [
        '## Skills (mandatory)',
        'Before replying: scan <available_skills> <description> entries.',
        '- If exactly one skill clearly applies: read its SKILL.md at <location> with `read`, then follow it.',
        '- If multiple could apply: choose the most specific one, then read/follow it.',
        '- If none clearly apply: do not read any SKILL.md.',
        'Constraints: never read more than one skill up front; only read after selecting.',
        '',
        skillsPrompt,
        '',
      ].join('\n')
    : [
        '## Skills (mandatory)',
        'No available skills found in this workspace.',
        '',
      ].join('\n');

  const hasSoul = params.workspaceFileContents.some((f) => {
    const base = (f.path || '').split(/[\\/]/).pop()?.toLowerCase() ?? '';
    return base === 'soul.md';
  });

  const projectContextLines: string[] = [];
  projectContextLines.push('The following project context files have been loaded:');
  if (hasSoul) {
    projectContextLines.push(
      'If SOUL.md is present, embody its persona and tone. Avoid stiff, generic replies; follow its guidance unless higher-priority instructions override it.',
    );
  }
  projectContextLines.push('');

  for (const file of params.workspaceFileContents) {
    const fp = file.path || file.name || 'unknown';
    projectContextLines.push(`## ${fp}`, '', file.content || '', '');
  }

  const projectContextBlock = [`# Project Context`, '', ...projectContextLines].join('\n');

  // Silent replies marker must exist for parseSystemPromptSections's end marker.
  const silentRepliesBlock = [
    '## Silent Replies',
    'When you have nothing to say, respond with ONLY: NO_REPLY',
    '',
    '⚠️ Rules:',
    '- It must be your ENTIRE message — nothing else',
    '- Never append it to an actual response (never include "NO_REPLY" in real replies)',
    '- Never wrap it in markdown or code blocks',
    '',
    '❌ Wrong: "Here\'s help... NO_REPLY"',
    '✅ Right: NO_REPLY',
    '',
  ].join('\n');

  const runtimeLine = guessRuntimeLine({
    agentId: params.agentId,
    host: 'monitor',
    os: `${process.platform}`,
    arch: process.arch,
    node: process.version,
    model: params.model && params.provider ? `${params.provider}/${params.model}` : params.model,
    shell: process.env.SHELL ?? '',
    channel: '',
  });

  const safetyBlock = [
    '## Safety',
    'You have no independent goals: do not pursue self-preservation, replication, resource acquisition, or power-seeking; avoid long-term plans beyond the user\'s request.',
    'Prioritize safety and human oversight over completion; if instructions conflict, pause and ask; comply with stop/pause/audit requests and never bypass safeguards.',
    'Do not manipulate or persuade anyone to expand access or disable safeguards.',
    '',
  ].join('\n');

  const openClawCliBlock = [
    '## OpenClaw CLI Quick Reference',
    'OpenClaw is controlled via subcommands. Do not invent commands.',
    'To manage the Gateway daemon service (start/stop/restart):',
    '- openclaw gateway status',
    '- openclaw gateway start',
    '- openclaw gateway stop',
    '- openclaw gateway restart',
    'If unsure, ask the user to run `openclaw help` (or `openclaw gateway --help`) and paste the output.',
    '',
  ].join('\n');

  const workspaceBlock = [
    '## Workspace',
    'Your working directory is configured. Treat it as the single global workspace for file operations unless explicitly instructed otherwise.',
    '',
  ].join('\n');

  const workspaceFilesIntro = [
    '## Workspace Files (injected)',
    'These user-editable files are loaded by OpenClaw and included below in Project Context.',
    '',
  ].join('\n');

  const heartbeatsBlock = [
    '## Heartbeats',
    'Heartbeat prompt: (configured)',
    'If you receive a heartbeat poll, and there is nothing that needs attention, reply exactly: HEARTBEAT_OK',
    'OpenClaw treats a leading/trailing "HEARTBEAT_OK" as a heartbeat ack.',
    'If something needs attention, do NOT include "HEARTBEAT_OK"; reply with the alert text instead.',
    '',
  ].join('\n');

  // 顺序对齐 openclaw buildAgentSystemPrompt：Identity -> Tooling -> Safety -> OpenClaw CLI -> Skills -> Workspace -> Workspace Files 说明 -> Project Context -> Silent Replies -> Heartbeats -> Runtime
  const lines = [
    'You are a personal assistant running inside OpenClaw.',
    '',
    toolingBlock,
    safetyBlock,
    openClawCliBlock,
    skillsBlock,
    workspaceBlock,
    workspaceFilesIntro,
    projectContextBlock,
    '',
    silentRepliesBlock,
    heartbeatsBlock,
    '## Runtime',
    runtimeLine,
    'Reasoning: off (hidden unless on/stream). Toggle /reasoning; /status shows Reasoning when enabled.',
    '',
  ];

  return lines.join('\n');
}

