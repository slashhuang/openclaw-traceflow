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
  tools: Array<string>;
  provider?: string;
  model?: string;
  agentId?: string;
}): Promise<string> {
  const toolsSorted = params.tools.toSorted((a, b) => String(a).localeCompare(String(b)));
  const toolLines = toolsSorted.map((t) => `- ${String(t)}`).join('\n');

  // Tools list extraction markers must match open-openclaw/system-prompt-probe.ts constants.
  const TOOL_LIST_START = 'Tool names are case-sensitive. Call tools exactly as listed.\n';
  const TOOL_LIST_END =
    '\nTOOLS.md does not control tool availability; it is user guidance for how to use external tools.';

  const toolingBlock = [
    '## Tooling',
    'Tool availability (filtered by policy):',
    `${TOOL_LIST_START}${toolLines}${TOOL_LIST_END}`,
    '',
  ].join('\n');

  const skillsBlocks: string[] = [];
  for (const s of params.skills) {
    const skillName = String(s.name || '').trim();
    if (!skillName) continue;
    const skillMdPath = path.join(params.workspaceDir, 'skills', skillName, 'SKILL.md');
    let content = '';
    try {
      if (fs.existsSync(skillMdPath)) {
        content = fs.readFileSync(skillMdPath, 'utf-8');
      }
    } catch {
      content = '';
    }
    const trimmed = content.trim();
    // Ensure parser regex sees `<skill>...</skill>` and `<name>...</name>`.
    skillsBlocks.push(
      `<skill>\n<name>${skillName}</name>\n${trimmed || `<!-- missing: ${skillMdPath} -->`}\n</skill>`,
    );
  }

  const skillsPrompt = skillsBlocks.join('\n\n');
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
    'You have no independent goals: do not pursue self-preservation, replication, resource acquisition, or power-seeking; avoid long-term plans beyond the user\\\'s request.',
    'Prioritize safety and human oversight over completion; if instructions conflict, pause and ask; comply with stop/pause/audit requests and never bypass safeguards.',
    'Do not manipulate or persuade anyone to expand access or disable safeguards.',
    '',
  ].join('\n');

  // Keep the overall structure stable: Identity -> Tooling -> Skills -> Project Context -> Silent Replies -> Runtime.
  const lines = [
    'You are a personal assistant running inside OpenClaw.',
    '',
    toolingBlock,
    skillsBlock,
    projectContextBlock,
    '',
    silentRepliesBlock,
    '## Runtime',
    runtimeLine,
    'Reasoning: off (hidden unless on/stream). Toggle /reasoning; /status shows Reasoning when enabled.',
    '',
  ];

  return lines.join('\n');
}

