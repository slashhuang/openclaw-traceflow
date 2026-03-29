/**
 * 将 Gateway `health` RPC 的 payload 近似映射为 `status` RPC（getStatusSummary）形态，
 * 供 Dashboard GatewayStatusCard 使用。
 *
 * 背景：无设备身份的 backend 连接在 Gateway 侧会清空 scopes，随后 `status` / `usage.status` /
 * `logs.tail` 会报 missing scope: operator.read；`health` 在 Gateway 中不按 operator scope 拦截。
 */
function mapHealthRecentEntry(raw: unknown): Record<string, unknown> {
  const r = raw as Record<string, unknown> | null;
  if (!r || typeof r !== 'object') {
    return {
      key: '—',
      model: '?',
      totalTokens: 0,
      contextTokens: null,
      percentUsed: null,
    };
  }
  const key = typeof r.key === 'string' && r.key.trim() ? r.key.trim() : '—';
  const updatedAt = typeof r.updatedAt === 'number' ? r.updatedAt : undefined;
  const age =
    typeof r.age === 'number'
      ? r.age
      : updatedAt != null
        ? Math.max(0, Date.now() - updatedAt)
        : null;
  return {
    key,
    model: '?',
    totalTokens: 0,
    contextTokens: null,
    percentUsed: null,
    updatedAt: updatedAt ?? null,
    age,
    kind: 'direct',
    thinkingLevel: 'off',
    compactionCount: 0,
  };
}

/**
 * 从 `health` RPC 结果构造 StatusOverviewResult（usage 为空对象；与完整 status RPC 相比为降级展示）。
 */
export function buildStatusOverviewFromHealth(
  healthPayload: unknown,
  gatewayVersion?: string,
): {
  version?: string;
  status?: Record<string, unknown>;
  usage?: Record<string, unknown>;
} {
  const h = healthPayload as Record<string, unknown> | null;
  if (!h || typeof h !== 'object') {
    return {
      version: gatewayVersion,
      status: {
        sessions: { defaults: { model: '?', contextTokens: null }, recent: [] },
        queuedSystemEvents: [],
      },
      usage: {},
    };
  }

  const sessionsBlock = (h.sessions as Record<string, unknown>) || {};
  const recentRaw = Array.isArray(sessionsBlock.recent)
    ? sessionsBlock.recent
    : [];
  const recent =
    recentRaw.length > 0
      ? recentRaw.map((r) => mapHealthRecentEntry(r))
      : [mapHealthRecentEntry(null)];

  return {
    version: gatewayVersion,
    status: {
      runtimeVersion: gatewayVersion,
      sessions: {
        defaults: { model: '?', contextTokens: null },
        recent,
      },
      queuedSystemEvents: Array.isArray(h.queuedSystemEvents)
        ? h.queuedSystemEvents
        : [],
    },
    usage: {},
  };
}
