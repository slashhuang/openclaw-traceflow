/**
 * 会话用户解析：统一 inferSessionTypeLabel + resolveDisplayUser
 * 供 sessions、skills、metrics 等模块共用，避免 unknown 散落各处
 */

/** 从 sessionKey/sessionId 推断任务类型 */
export function inferSessionTypeLabel(sessionKey: string, sessionId: string): string {
  const key = sessionKey || sessionId || '';
  const full = key.includes('/') ? key.split('/').pop() || key : key;
  if (full.endsWith(':main') || full === 'main') return 'heartbeat';
  if (full.includes(':cron:')) return 'cron';
  if (full.startsWith('boot-') || full.includes(':boot')) return 'boot';
  if (full.includes(':wave:')) return 'Wave 用户';
  if (full.includes(':slack:')) return 'Slack';
  if (full.includes(':telegram:')) return 'Telegram';
  if (full.includes(':discord:')) return 'Discord';
  if (full.includes(':feishu:')) return '飞书';
  if (full.includes(':cron')) return 'cron';
  return '用户';
}

/** 将 unknown 映射为 greeting/heartbeat/cron 等可读标签 */
export function resolveDisplayUser(
  userId: string | undefined,
  typeLabel: string,
  systemSent?: boolean,
): string {
  const raw = userId?.trim() || 'unknown';
  if (raw !== 'unknown') return raw;
  if (systemSent) return 'greeting';
  const sys = ['heartbeat', 'cron', 'boot'].includes(typeLabel);
  return sys ? typeLabel : raw;
}
