/**
 * 会话用户解析：统一 inferSessionTypeLabel + resolveDisplayUser
 * 供 sessions、skills、metrics 等模块共用，避免 unknown 散落各处
 */

/**
 * 解析 OpenClaw canonical `agent:<agentId>:<rest>`（与 openclaw routing/session-key 语义一致）。
 */
function parseAgentSessionKeyParts(sessionKey: string): { agentId: string; rest: string } | null {
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
 * OpenClaw canonical 主会话桶：`buildAgentMainSessionKey` → `agent:<id>:main`（rest 仅为 `main`）。
 * `dmScope === "main"` 时私聊折叠到此 key；heartbeat 可能写入同一桶，但 key 本身不是「heartbeat 专用」。
 * 不能用 `endsWith(':main')`：通道路由里可能出现含 `:main` 片段的非 canonical key。
 */
function isCanonicalAgentMainSessionKey(fullKey: string): boolean {
  const parsed = parseAgentSessionKeyParts(fullKey);
  if (parsed && parsed.rest === 'main') return true;
  return fullKey.trim().toLowerCase() === 'main';
}

/** 从 sessionKey/sessionId 推断任务类型 */
export function inferSessionTypeLabel(sessionKey: string, sessionId: string): string {
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
