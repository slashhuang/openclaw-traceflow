/**
 * 用本地 agents/<agent>/sessions/sessions.json 补全 health 降级映射的 Gateway 仪表盘字段（model、token、compaction 等），
 * 优先磁盘索引，避免依赖 status RPC。
 */
import * as fs from 'fs';
import * as path from 'path';
import type { StatusOverviewResult, TraceflowGatewayStatusSource } from './gateway-rpc';

function agentFolderFromSessionKey(sessionKey: string): string | null {
  const parts = sessionKey.split(':');
  if (parts[0] === 'agent' && parts.length >= 2 && parts[1]?.trim()) {
    return parts[1].trim();
  }
  return null;
}

function resolveModel(entry: Record<string, unknown>): string | undefined {
  const m = entry.model;
  if (typeof m === 'string' && m.trim()) {
    return m.trim();
  }
  const o = entry.modelOverride;
  if (typeof o === 'string' && o.trim()) {
    return o.trim();
  }
  return undefined;
}

/**
 * 读取 OpenClaw 会话索引中指定 sessionKey 的一行（与 Gateway health.recent[].key 对应）。
 */
export function readSessionsStoreEntry(stateDir: string, sessionKey: string): Record<string, unknown> | null {
  const agentFolder = agentFolderFromSessionKey(sessionKey);
  if (!agentFolder) {
    return null;
  }
  const storePath = path.join(stateDir, 'agents', agentFolder, 'sessions', 'sessions.json');
  if (!fs.existsSync(storePath)) {
    return null;
  }
  try {
    const raw = fs.readFileSync(storePath, 'utf8');
    const store = JSON.parse(raw) as Record<string, unknown>;
    const entry = store[sessionKey];
    if (!entry || typeof entry !== 'object') {
      return null;
    }
    return entry as Record<string, unknown>;
  } catch {
    return null;
  }
}

function overlayFromDiskEntry(entry: Record<string, unknown>): Record<string, unknown> {
  const totalTokens = typeof entry.totalTokens === 'number' ? entry.totalTokens : undefined;
  const contextTokens = typeof entry.contextTokens === 'number' ? entry.contextTokens : undefined;
  const totalTokensFresh = entry.totalTokensFresh;
  let percentUsed: number | null = null;
  if (totalTokensFresh !== false && contextTokens != null && contextTokens > 0 && totalTokens != null) {
    percentUsed = Math.min(999, Math.round((totalTokens / contextTokens) * 100));
  }
  const updatedAt = typeof entry.updatedAt === 'number' ? entry.updatedAt : undefined;
  const age = updatedAt != null ? Math.max(0, Date.now() - updatedAt) : null;
  const chatType = entry.chatType;
  const kind = chatType === 'group' ? 'group' : 'direct';
  const thinkingRaw = entry.thinkingLevel;
  const thinkingLevel =
    typeof thinkingRaw === 'string' && thinkingRaw.trim() ? thinkingRaw.trim() : 'off';

  const out: Record<string, unknown> = {};
  const model = resolveModel(entry);
  if (model) {
    out.model = model;
  }
  if (totalTokens != null) {
    out.totalTokens = totalTokens;
  }
  if (contextTokens != null) {
    out.contextTokens = contextTokens;
  }
  out.percentUsed = percentUsed;
  if (typeof entry.sessionId === 'string' && entry.sessionId.trim()) {
    out.sessionId = entry.sessionId.trim();
  }
  if (typeof entry.compactionCount === 'number') {
    out.compactionCount = entry.compactionCount;
  }
  out.kind = kind;
  out.thinkingLevel = thinkingLevel;
  if (typeof entry.fastMode === 'boolean') {
    out.fastMode = entry.fastMode;
  }
  if (typeof entry.elevatedLevel === 'string' && entry.elevatedLevel.trim()) {
    out.elevatedLevel = entry.elevatedLevel.trim();
  }
  if (updatedAt != null) {
    out.updatedAt = updatedAt;
    out.age = age;
  }
  return out;
}

function enrichDefaults(
  defaults: unknown,
  entry: Record<string, unknown>,
): Record<string, unknown> {
  const d =
    defaults && typeof defaults === 'object' ? { ...(defaults as Record<string, unknown>) } : {};
  const model = resolveModel(entry);
  if (model) {
    d.model = model;
  }
  if (typeof entry.contextTokens === 'number') {
    d.contextTokens = entry.contextTokens;
  }
  return d;
}

function attachTraceflowGatewayStatusSource(
  overview: StatusOverviewResult,
  sessionsJsonMerged: boolean,
  stateDirConfigured: boolean,
): StatusOverviewResult {
  const traceflowGatewayStatusSource: TraceflowGatewayStatusSource = {
    metricsFrom: sessionsJsonMerged ? 'sessions.json' : 'health-only',
    queueVersionFrom: 'health',
    stateDirConfigured,
  };
  return { ...overview, traceflowGatewayStatusSource };
}

/**
 * 将 sessions.json 中与 health.recent[0].key 匹配的一行合并进概览（浅拷贝 status），
 * 并写入 traceflowGatewayStatusSource 供 UI 标明数据来源。
 */
export function mergeGatewayOverviewFromSessionsStore(
  overview: StatusOverviewResult,
  stateDir: string | null | undefined,
): StatusOverviewResult {
  const stateDirConfigured = Boolean(stateDir?.trim());
  if (!stateDir?.trim()) {
    return attachTraceflowGatewayStatusSource(overview, false, false);
  }
  const status = overview.status;
  if (!status || typeof status !== 'object') {
    return attachTraceflowGatewayStatusSource(overview, false, true);
  }
  const sessionsBlock = (status as Record<string, unknown>).sessions as Record<string, unknown> | undefined;
  if (!sessionsBlock) {
    return attachTraceflowGatewayStatusSource(overview, false, true);
  }
  const recent = sessionsBlock.recent;
  if (!Array.isArray(recent) || recent.length === 0) {
    return attachTraceflowGatewayStatusSource(overview, false, true);
  }
  const first = recent[0] as Record<string, unknown>;
  const rawKey = typeof first.key === 'string' && first.key.trim() ? first.key.trim() : '';
  const sessionKey = rawKey && rawKey !== '—' ? rawKey : 'agent:main:main';
  const entry = readSessionsStoreEntry(stateDir.trim(), sessionKey);
  if (!entry) {
    return attachTraceflowGatewayStatusSource(overview, false, true);
  }
  const overlay = overlayFromDiskEntry(entry);
  const merged = { ...first, ...overlay };
  const mergedOverview: StatusOverviewResult = {
    ...overview,
    status: {
      ...status,
      sessions: {
        ...sessionsBlock,
        defaults: enrichDefaults(sessionsBlock.defaults, entry),
        recent: [merged, ...recent.slice(1)],
      },
    },
  };
  return attachTraceflowGatewayStatusSource(mergedOverview, true, true);
}
