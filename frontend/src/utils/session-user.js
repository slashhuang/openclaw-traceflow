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

/**
 * 从 sessionKey 推断群聊 / 频道 / 单聊（与 OpenClaw classifySessionKey 语义对齐，仅前端展示）。
 * 系统类会话（heartbeat / cron / boot / wave）不区分，返回 null。
 * @returns {'group' | 'channel' | 'direct' | null}
 */
export function inferSessionChatKind(sessionKey, sessionId) {
  const key = sessionKey || sessionId || '';
  const full = key.includes('/') ? key.split('/').pop() || key : key;
  if (full.endsWith(':main') || full === 'main') return null;
  if (full.includes(':cron:')) return null;
  if (full.startsWith('boot-') || full.includes(':boot')) return null;
  if (full.includes(':wave:')) return null;
  if (key.includes(':group:')) return 'group';
  if (key.includes(':channel:')) return 'channel';
  if (
    key.includes(':feishu:') ||
    key.includes(':slack:') ||
    key.includes(':telegram:') ||
    key.includes(':discord:')
  ) {
    return 'direct';
  }
  return null;
}
