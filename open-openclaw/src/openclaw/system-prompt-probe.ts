/**
 * 将 Gateway sessions.usage 返回的 systemPromptReport 转为仪表盘用 breakdown + 兜底 Markdown
 * 字段对齐 OpenClaw SessionSystemPromptReport（config/sessions/types.ts）
 */

export type SystemPromptBreakdownItem = {
  id: string;
  label: string;
  chars: number;
  tokens: number;
  percent: number;
};

export type SystemPromptToolsEntry = {
  name: string;
  summaryChars: number;
  schemaChars: number;
  propertiesCount?: number | null;
};

/** 从完整 system prompt 文本解析出的可展示正文（与 OpenClaw buildSystemPromptReport 标记一致） */
export type SystemPromptParsedSections = {
  /** 是否从 transcript 拉取到足够长的 system 正文（否则多为统计兜底，解析可能不准） */
  fromTranscript: boolean;
  coreText: string;
  projectContextText: string;
  toolsListText: string;
  skillBlocks: Array<{ name: string; content: string }>;
};

export type WorkspaceFileContent = {
  name: string;
  path: string;
  content: string;
  truncated: boolean;
  readError?: string;
};

export type SystemPromptProbeResult = {
  ok: boolean;
  error?: string;
  sessionKey?: string;
  sessionId?: string;
  agentId?: string;
  reportSource?: string;
  reportGeneratedAt?: number;
  model?: string;
  provider?: string;
  workspaceDir?: string;
  breakdown: SystemPromptBreakdownItem[];
  workspaceFiles: Array<{
    name: string;
    path: string;
    missing: boolean;
    rawChars: number;
    injectedChars: number;
    truncated: boolean;
  }>;
  /** 从 workspace 目录读取的注入文件正文（单文件有长度上限） */
  workspaceFileContents: WorkspaceFileContent[];
  skillsDetail: Array<{ name: string; blockChars: number }>;
  toolsDetail: SystemPromptToolsEntry[];
  toolsSummary: { listChars: number; schemaChars: number; entryCount: number };
  systemPromptMarkdown: string;
  sections: SystemPromptParsedSections;
};

function charsToTok(c: number): number {
  return Math.max(0, Math.ceil(Math.max(0, c) / 4));
}

const PROJECT_CTX_START = '\n# Project Context\n';
const PROJECT_CTX_END = '\n## Silent Replies\n';
const TOOL_LIST_START = 'Tool names are case-sensitive. Call tools exactly as listed.\n';
const TOOL_LIST_END =
  '\nTOOLS.md does not control tool availability; it is user guidance for how to use external tools.';

function extractBetweenMarkers(
  input: string,
  startMarker: string,
  endMarker: string,
): { text: string; found: boolean } {
  const start = input.indexOf(startMarker);
  if (start === -1) {
    return { text: '', found: false };
  }
  const end = input.indexOf(endMarker, start + startMarker.length);
  if (end === -1) {
    return { text: input.slice(start + startMarker.length), found: true };
  }
  return { text: input.slice(start + startMarker.length, end), found: true };
}

/**
 * 从单条或多条拼接的 system 消息全文解析各区块正文。
 */
export function parseSystemPromptSections(
  fullText: string,
  fromTranscript: boolean,
): SystemPromptParsedSections {
  const sp = fullText || '';
  const i0 = sp.indexOf(PROJECT_CTX_START);
  const i1 = i0 === -1 ? -1 : sp.indexOf(PROJECT_CTX_END, i0 + PROJECT_CTX_START.length);

  let coreText = sp;
  let projectContextText = '';
  if (i0 !== -1 && i1 !== -1) {
    coreText = sp.slice(0, i0) + sp.slice(i1);
    projectContextText = sp.slice(i0 + PROJECT_CTX_START.length, i1);
  } else if (i0 !== -1 && i1 === -1) {
    coreText = sp.slice(0, i0);
    projectContextText = sp.slice(i0 + PROJECT_CTX_START.length);
  }

  const tl = extractBetweenMarkers(sp, TOOL_LIST_START, TOOL_LIST_END);
  const toolsListText = tl.found ? tl.text.trim() : '';

  const skillBlocks: Array<{ name: string; content: string }> = [];
  for (const m of sp.matchAll(/<skill>[\s\S]*?<\/skill>/gi)) {
    const block = m[0] ?? '';
    const name = block.match(/<name>\s*([^<]+?)\s*<\/name>/i)?.[1]?.trim() || '(unknown)';
    skillBlocks.push({ name, content: block });
  }

  return {
    fromTranscript,
    coreText,
    projectContextText,
    toolsListText,
    skillBlocks,
  };
}

export function buildBreakdownFromReport(report: Record<string, unknown>): SystemPromptBreakdownItem[] {
  const sp = (report.systemPrompt as Record<string, number>) || {};
  const nonP = Number(sp.nonProjectContextChars) || 0;
  const proj = Number(sp.projectContextChars) || 0;
  const files = Array.isArray(report.injectedWorkspaceFiles)
    ? (report.injectedWorkspaceFiles as Array<{ injectedChars?: number }>)
    : [];
  const wsChars = files.reduce((s, f) => s + (Number(f.injectedChars) || 0), 0);
  const skills = (report.skills as Record<string, unknown>) || {};
  const skillChars = Number(skills.promptChars) || 0;
  const tools = (report.tools as Record<string, unknown>) || {};
  const toolList = Number(tools.listChars) || 0;
  const toolSchema = Number(tools.schemaChars) || 0;
  const entries = Array.isArray(tools.entries) ? (tools.entries as unknown[]).length : 0;

  const rows = [
    { id: 'core', label: '核心 System（非 Workspace）', chars: nonP },
    { id: 'project', label: 'System · Project 上下文', chars: proj },
    { id: 'workspace', label: 'Workspace（AGENTS.md 等）', chars: wsChars },
    { id: 'skills', label: 'Skills 注入', chars: skillChars },
    { id: 'tools_list', label: 'Tools 列表', chars: toolList },
    { id: 'tools_schema', label: 'Tools Schema', chars: toolSchema },
  ];
  const totalChars = rows.reduce((s, r) => s + r.chars, 0) || 1;
  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    chars: r.chars,
    tokens: charsToTok(r.chars),
    percent: Math.round((r.chars / totalChars) * 1000) / 10,
  }));
}

export function buildMarkdownFallbackFromReport(
  report: Record<string, unknown>,
  sessionKey: string,
): string {
  const breakdown = buildBreakdownFromReport(report);
  const totalTok = breakdown.reduce((s, x) => s + x.tokens, 0);
  const src = String(report.source || '?');
  const at = report.generatedAt ? new Date(Number(report.generatedAt)).toLocaleString('zh-CN') : '?';
  const model = report.model ? `**模型**: ${report.model}\n\n` : '';
  const ws = Array.isArray(report.injectedWorkspaceFiles)
    ? (report.injectedWorkspaceFiles as Array<Record<string, unknown>>)
    : [];
  const skills = ((report.skills as Record<string, unknown>)?.entries as Array<{ name: string; blockChars: number }>) || [];
  const toolsEntries =
    (report.tools as Record<string, unknown>)?.entries as Array<{
      name: string;
      summaryChars?: number;
      schemaChars?: number;
      propertiesCount?: number | null;
    }> | undefined;

  const toolsRows = Array.isArray(toolsEntries)
    ? toolsEntries
        .slice(0, 30)
        .map((t) => {
          const props = t.propertiesCount ?? '';
          return `| ${t.name || '-'} | ${t.summaryChars ?? 0} | ${t.schemaChars ?? 0} | ${props} |`;
        })
        .join('\n')
    : '';

  const fileRows = ws
    .map(
      (f) =>
        `| ${String(f.name || f.path || '-')} | ${f.injectedChars ?? 0} | ${f.truncated ? '是' : '否'} | ${f.missing ? '缺失' : ''} |`,
    )
    .join('\n');

  const skillRows = skills
    .slice(0, 30)
    .map((s) => `| ${s.name} | ${s.blockChars} | ${charsToTok(s.blockChars)} |`)
    .join('\n');

  return [
    '# System Prompt 构成',
    '',
    '> 数据来自 Gateway **`sessions.usage`**（`includeContextWeight`）中的 **systemPromptReport**。若下方无完整正文，说明 transcript 中未找到 system 消息；Agent 至少成功跑过一次后报告更准确。',
    '',
    `${model}**会话 Key**: \`${sessionKey}\`  ·  **报告来源**: \`${src}\`  ·  **生成时间**: ${at}`,
    '',
    '## Token 占比（约 char÷4）',
    '',
    '| 区块 | 字符 | ~Token | 占比 |',
    '|------|------|--------|------|',
    ...breakdown.map((b) => `| ${b.label} | ${b.chars} | ${b.tokens} | ${b.percent}% |`),
    '',
    `**合计约 ${totalTok.toLocaleString()} tokens**`,
    '',
    '## Workspace 文件',
    '',
    '| 文件 | 注入字符 | 截断 | 备注 |',
    '|------|----------|------|------|',
    fileRows || '| — | — | — | — |',
    '',
    '## Skills 明细（前 30 个）',
    '',
    '| Skill | 字符 | ~Token |',
    '|-------|------|--------|',
    skillRows || '| — | — | — |',
    '',
    '## Tools 明细（前 30 个）',
    '',
    '| Tool | summary chars | schema chars | propertiesCount |',
    '|------|----------------|--------------|------------------|',
    toolsRows || '| — | — | — | — |',
    '',
  ].join('\n');
}
