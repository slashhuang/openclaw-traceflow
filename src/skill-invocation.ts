/**
 * 基于 read 工具调用反推 Skill 调用
 * 原理：SKILL.md 只能通过 read 访问，read 的 arguments 中任一字符串若匹配
 *       skills/xxx/SKILL.md 则推断触发了 xxx skill。不关心 key 是 path 还是 file_path。
 */

const SKILL_PATH_RE = /\/skills\/([^/]+)\/SKILL\.md$/i;

/**
 * 从文件路径推断 skill 名称，若非 SKILL.md 则返回 null
 */
export function inferSkillFromPath(filePath: string): string | null {
  if (!filePath || typeof filePath !== 'string') return null;
  const m = filePath.trim().match(SKILL_PATH_RE);
  return m ? m[1] : null;
}

export interface InvokedSkill {
  skillName: string;
  readCount: number;
}

function findSkillPathInArgs(args: Record<string, unknown> | null | undefined): string | null {
  if (!args || typeof args !== 'object') return null;
  for (const v of Object.values(args)) {
    if (typeof v === 'string' && v.trim()) {
      const skill = inferSkillFromPath(v);
      if (skill) return skill;
    }
  }
  return null;
}

/**
 * 从 toolCalls 中提取 read 调用的 path，反推触发的 skills
 * read 的 input/arguments 中任一字符串匹配 skills/xxx/SKILL.md 即视为该 skill 被调用
 */
export function inferInvokedSkillsFromToolCalls(
  toolCalls: Array<{ name: string; input?: Record<string, unknown> }>,
): InvokedSkill[] {
  const counts = new Map<string, number>();
  for (const tc of toolCalls || []) {
    if (tc.name !== 'read') continue;
    const skill = findSkillPathInArgs(tc.input ?? {});
    if (skill) {
      counts.set(skill, (counts.get(skill) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([skillName, readCount]) => ({ skillName, readCount }))
    .sort((a, b) => b.readCount - a.readCount);
}

/**
 * 按 transcript 顺序将工具调用归因到「当前激活」的 skill：
 * 遇到 read 且路径为 skills/xxx/SKILL.md 时切换当前 skill；其后工具（含读其他文件）
 * 计入该 skill，直到下一次 SKILL.md 的 read。避免同一会话多 skill 时重复累加全会话工具。
 */
export function attributeToolCallsToSkillsByOrder(
  toolCalls: Array<{ name: string; input?: Record<string, unknown> }>,
): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>();
  let current: string | null = null;

  const bump = (skill: string, toolName: string) => {
    let m = out.get(skill);
    if (!m) {
      m = new Map();
      out.set(skill, m);
    }
    m.set(toolName, (m.get(toolName) ?? 0) + 1);
  };

  for (const tc of toolCalls || []) {
    const name = tc?.name || 'unknown';
    if (name === 'read') {
      const skillFromSkillMd = findSkillPathInArgs(tc.input ?? {});
      if (skillFromSkillMd) {
        current = skillFromSkillMd;
        bump(current, 'read');
      } else if (current) {
        bump(current, 'read');
      }
    } else if (current) {
      bump(current, name);
    }
  }

  return out;
}
