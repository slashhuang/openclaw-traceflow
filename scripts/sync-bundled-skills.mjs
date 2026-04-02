#!/usr/bin/env node
/**
 * Copy companion OpenClaw skills from a sibling **claw-brains** clone into TraceFlow `resources/bundled-skills/`.
 * Optional maintainer workflow: only when `../claw-brains/skills/` exists on disk (e.g. same machine workspace).
 * Run: `pnpm run sync:bundled-skills` from openclaw-traceflow/
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tfRoot = path.resolve(__dirname, '..');
const monorepoSkills = path.resolve(tfRoot, '..', 'claw-brains', 'skills');

/** @type {{ id: string; files: string[] }[]} */
const SKILLS = [
  {
    id: 'agent-audit',
    files: ['SKILL.md', 'README.md', 'scripts/audit-scanner.mjs'],
  },
  {
    id: 'self-improvement',
    files: [
      'SKILL.md',
      'scripts/analyze.py',
      'scripts/auto_pr.py',
      'scripts/generate_pr.py',
      'scripts/promote.py',
      'scripts/recurrence_tracker.py',
      'scripts/reflect.py',
      'scripts/wakeup_report.py',
    ],
  },
];

function syncSkill(skillId, relFiles) {
  const srcRoot = path.join(monorepoSkills, skillId);
  const destRoot = path.join(tfRoot, 'resources', 'bundled-skills', skillId);
  const marker = path.join(srcRoot, 'SKILL.md');

  if (!fs.existsSync(marker)) {
    console.warn(
      `[sync-bundled-skills] Skip ${skillId}: source not found (optional sibling ../claw-brains/skills):`,
      srcRoot,
    );
    return;
  }

  for (const rel of relFiles) {
    const from = path.join(srcRoot, rel);
    const to = path.join(destRoot, rel);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
    console.log('[sync-bundled-skills]', skillId, rel, '->', to);
  }
}

for (const { id, files } of SKILLS) {
  syncSkill(id, files);
}
console.log('[sync-bundled-skills] done.');
