/** 列表/详情展示：跳过与系统会话类型同名的占位串 */
const PLACEHOLDER_SENDERS = new Set(['heartbeat', 'cron', 'boot', 'greeting']);

/** 索引或首行里的 user 是否应被 transcript 中的真实 sender 覆盖 */
export function isPlaceholderParticipantId(userId: string): boolean {
  const t = userId.trim();
  if (t === '' || t === 'unknown') return true;
  return PLACEHOLDER_SENDERS.has(t);
}

/**
 * 列表列：首位参与者 + 其余人数（不含首位的个数），例如 `ou_xxx (+2)` 表示共 3 人。
 * 仅当至少 2 个不同（且非占位）参与者时返回摘要。
 */
export function formatParticipantSummary(distinctIds: string[]): string | undefined {
  const ids = distinctIds
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.length <= 200 && !PLACEHOLDER_SENDERS.has(s));
  if (ids.length <= 1) return undefined;
  const first = ids[0];
  const others = ids.length - 1;
  return `${first} (+${others})`;
}
