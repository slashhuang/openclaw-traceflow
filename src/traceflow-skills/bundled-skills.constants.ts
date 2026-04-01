/**
 * Bundled TraceFlow companion skills (mirrors under resources/bundled-skills/<id>/).
 * Add entries when new skills are vendored.
 */
export const BUNDLED_SKILL_IDS = ['agent-audit', 'self-improvement'] as const;

export type BundledSkillId = (typeof BUNDLED_SKILL_IDS)[number];

/** Relative paths under each skill directory to expose via API */
export const BUNDLED_SKILL_FILES: Record<BundledSkillId, readonly string[]> = {
  'agent-audit': ['SKILL.md', 'README.md', 'scripts/audit-scanner.mjs'],
  'self-improvement': [
    'SKILL.md',
    'scripts/analyze.py',
    'scripts/auto_pr.py',
    'scripts/generate_pr.py',
    'scripts/promote.py',
    'scripts/recurrence_tracker.py',
    'scripts/reflect.py',
    'scripts/wakeup_report.py',
  ],
};
