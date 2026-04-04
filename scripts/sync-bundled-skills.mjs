#!/usr/bin/env node
/**
 * Copy companion OpenClaw skills from a sibling **claw-brains** clone into TraceFlow `resources/bundled-skills/`.
 * 
 * This is an **optional maintainer-only script**. The `resources/bundled-skills/` directory
 * contains standalone skill definitions (SKILL.md, README.md) that work independently.
 * 
 * Prerequisites (optional):
 * - A sibling `claw-brains` repository at `../claw-brains/` for syncing full skill implementations
 * 
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
      'README.md',
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
      `[sync-bundled-skills] Skip ${skillId}: source not found.`,
      `This is OK — bundled skills in resources/ are standalone.`,
      `Expected: ${srcRoot}`,
    );
    return;
  }

  for (const rel of relFiles) {
    const from = path.join(srcRoot, rel);
    const to = path.join(destRoot, rel);
    
    if (!fs.existsSync(from)) {
      console.warn(`[sync-bundled-skills] Skip ${skillId}/${rel}: source file not found`);
      continue;
    }
    
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
    console.log('[sync-bundled-skills]', skillId, rel, '->', to);
  }
}

console.log('[sync-bundled-skills] Syncing from claw-brains (optional maintainer tool)...');
for (const { id, files } of SKILLS) {
  syncSkill(id, files);
}
console.log('[sync-bundled-skills] done. Bundled skills in resources/ work standalone.');
