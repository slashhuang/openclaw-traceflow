#!/usr/bin/env node
/**
 * Copy claw-family companion skills into TraceFlow resources (monorepo only).
 * Run from openclaw-traceflow/: pnpm run sync:bundled-skills
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tfRoot = path.resolve(__dirname, '..');
const monorepoSkills = path.resolve(tfRoot, '..', 'claw-family', 'skills');

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
      `[sync-bundled-skills] Skip ${skillId}: source not found (expected monorepo):`,
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
