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

/**
 * 从详情页已解析的 user 消息（含 sender）按出现顺序去重，过滤占位串。
 */
export function participantsFromSessionMessages(
  messages: Array<{ role: string; sender?: string }>,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of messages) {
    if (m.role !== 'user') continue;
    const raw = m.sender?.trim();
    if (!raw || raw.length > 200 || isPlaceholderParticipantId(raw)) continue;
    if (seen.has(raw)) continue;
    seen.add(raw);
    out.push(raw);
  }
  return out;
}

/**
 * 以「当前响应里解析到的消息」为主序，再追加扫描缓存中有而消息里未出现的人（如 head_tail 截断时补全）。
 */
export function mergeParticipantListsOrdered(fromMessages: string[], fromScanCache: string[] | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (s: string) => {
    const t = s.trim();
    if (!t || t.length > 200 || isPlaceholderParticipantId(t)) return;
    if (seen.has(t)) return;
    seen.add(t);
    out.push(t);
  };
  for (const s of fromMessages) push(s);
  if (fromScanCache) {
    for (const s of fromScanCache) push(s);
  }
  return out;
}
