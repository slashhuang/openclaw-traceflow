/**
 * 会话用户解析：与后端 common/session-user-resolver 保持一致
 * 供 Dashboard、Sessions 等页面共用
 */

/**
 * 解析 OpenClaw canonical `agent:<agentId>:<rest>`（与后端 session-user-resolver / openclaw routing 一致）。
 * @param {string} sessionKey
 * @returns {{ agentId: string, rest: string } | null}
 */
function parseAgentSessionKeyParts(sessionKey) {
  const raw = (sessionKey ?? '').trim().toLowerCase();
  if (!raw) return null;
  const parts = raw.split(':').filter(Boolean);
  if (parts.length < 3) return null;
  if (parts[0] !== 'agent') return null;
  const agentId = parts[1]?.trim() ?? '';
  const rest = parts.slice(2).join(':');
  if (!agentId || !rest) return null;
  return { agentId, rest };
}

/**
 * OpenClaw canonical 主会话桶：`buildAgentMainSessionKey` → `agent:<agentId>:<mainKey>`（默认 mainKey 为 `main`）。
 * 在 `dmScope === "main"` 时私聊会折叠到此 key；与 heartbeat 定时任务是否写入同一 transcript 无必然对应关系。
 * 勿用 endsWith(':main')：通道路由里可能出现 `...:feishu:...` 等片段。
 */
function isCanonicalAgentMainSessionKey(fullKey) {
  const parsed = parseAgentSessionKeyParts(fullKey);
  if (parsed && parsed.rest === 'main') return true;
  return fullKey.trim().toLowerCase() === 'main';
}

/**
 * 从 sessionKey/sessionId 推断任务类型
 * @param {string} sessionKey
 * @param {string} [sessionId]
 * @returns {string}
 */
export function inferSessionTypeLabel(sessionKey, sessionId) {
  const key = sessionKey || sessionId || '';
  const full = key.includes('/') ? key.split('/').pop() || key : key;
  if (isCanonicalAgentMainSessionKey(full)) return '主会话';
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
 * 主会话桶（agent:*:main）在 OpenClaw 中为折叠后的私聊，返回 direct。
 * 系统类会话（cron / boot / wave）不区分，返回 null。
 * @returns {'group' | 'channel' | 'direct' | null}
 */
export function inferSessionChatKind(sessionKey, sessionId) {
  const key = sessionKey || sessionId || '';
  const full = key.includes('/') ? key.split('/').pop() || key : key;
  if (isCanonicalAgentMainSessionKey(full)) return 'direct';
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

/**
 * 列表「参与者」列：优先用 participants 列表（与消息抽取同源），再 participantSummary / user。
 * @param {{ sessionKey?: string, sessionId?: string, user?: string, participants?: string[], participantIds?: string[], participantSummary?: string, typeLabel?: string }} row
 * @returns {string}
 */
export function formatSessionParticipantDisplay(row) {
  const parts = row.participants ?? row.participantIds;
  if (Array.isArray(parts) && parts.length > 1) {
    const first = String(parts[0] ?? '').trim();
    const n = parts.length - 1;
    return first ? `${first} (+${n})` : `+${n}`;
  }
  if (Array.isArray(parts) && parts.length === 1) {
    const one = String(parts[0] ?? '').trim();
    if (one) return one;
  }
  const summary = (row.participantSummary ?? '').trim();
  if (summary) return summary;
  const typeLabel = row.typeLabel || inferSessionTypeLabel(row.sessionKey || '', row.sessionId || '');
  const sys = ['heartbeat', 'cron', 'boot'].includes(typeLabel);
  const u = (row.user ?? '').trim();
  const isPlaceholder =
    !u ||
    u === 'unknown' ||
    u === 'greeting' ||
    u === 'heartbeat' ||
    u === 'cron' ||
    u === 'boot';
  if (u && !isPlaceholder) return u;
  if (sys) return typeLabel;
  return u || '—';
}

/**
 * 列表「消息」列：有 messageCount 时显示数字；达到扫描行上限时显示 >maxLines（非精确条数）。
 * @param {{ messageCount?: number, messageCountCapped?: boolean, messageCountScanMaxLines?: number }} row
 * @returns {string}
 */
export function formatSessionListMessageCount(row) {
  if (row.messageCount == null) return '—';
  if (row.messageCountCapped) {
    const cap = row.messageCountScanMaxLines ?? 1000;
    return `>${cap}`;
  }
  return String(row.messageCount);
}
