/**
 * 会话用户解析：与后端 common/session-user-resolver 保持一致
 * 供 Dashboard、Sessions、TokenMonitor 等页面共用
 */

/**
 * 从 sessionKey/sessionId 推断任务类型
 * @param {string} sessionKey
 * @param {string} [sessionId]
 * @returns {string}
 */
export function inferSessionTypeLabel(sessionKey, sessionId) {
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
