/**
 * 会话用户解析：与后端 common/session-user-resolver 保持一致
 * 供 Dashboard、Sessions、TokenMonitor 等页面共用
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
 * 列表「参与者」列：优先展示索引/解析得到的真实身份（如飞书 open_id）；
 * 若仍为 unknown 或与 heartbeat/cron/boot 占位一致，再用会话类型标签兜底。
 * @param {{ sessionKey?: string, sessionId?: string, user?: string, participantSummary?: string, typeLabel?: string }} row
 * @returns {string}
 */
export function formatSessionParticipantDisplay(row) {
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
