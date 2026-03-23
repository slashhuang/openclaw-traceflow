/**
 * 双轨 Token：metrics/合并记录值 vs 日志大小启发式估算（见 PRD）。
 */

/**
 * @param {object} params
 * @param {Array} params.sessionList - GET /api/sessions 列表项
 * @param {Array|null} [params.tokenByKeyRows] - metrics getTokenUsageBySessionKey 全量行（可选；无则 staleWithActive 与分桶估算均为 0）
 * @param {object|null} [params.tokenSummary] - getTokenSummary 结果
 * @returns {{
 *   staleCount: number,
 *   staleWithActive: number,
 *   estimatedSum: number,
 *   estimatedSumActive: number,
 *   estimatedSumArchived: number,
 *   estimatedSumOrphan: number,
 *   recordedActive: number,
 *   recordedArchived: number,
 * }}
 */
export function aggregateStaleAndEstimated({ sessionList = [], tokenByKeyRows = null, tokenSummary = null }) {
  const byKey =
    Array.isArray(tokenByKeyRows) && tokenByKeyRows.length > 0
      ? new Map(tokenByKeyRows.map((r) => [r.sessionKey, r]))
      : new Map();
  let staleCount = 0;
  let staleWithActive = 0;
  let estimatedSum = 0;
  let estimatedSumActive = 0;
  let estimatedSumArchived = 0;
  let estimatedSumOrphan = 0;
  for (const s of sessionList) {
    if (s.tokenUsageMeta?.totalTokensFresh !== false) continue;
    staleCount += 1;
    const row = byKey.get(s.sessionKey);
    if (row && (row.activeTokens ?? 0) > 0) staleWithActive += 1;
    const est = s.estimatedTokensFromLog ?? 0;
    estimatedSum += est;
    if (est <= 0) continue;
    if (!row) {
      estimatedSumOrphan += est;
      continue;
    }
    const at = row.activeTokens ?? 0;
    const ar = row.archivedTokens ?? 0;
    if (at > 0) {
      estimatedSumActive += est;
    } else if (ar > 0) {
      estimatedSumArchived += est;
    } else {
      estimatedSumOrphan += est;
    }
  }
  return {
    staleCount,
    staleWithActive,
    estimatedSum,
    estimatedSumActive,
    estimatedSumArchived,
    estimatedSumOrphan,
    recordedActive: tokenSummary?.activeTokens ?? 0,
    recordedArchived: tokenSummary?.archivedTokens ?? 0,
  };
}

/**
 * 排行可比排量：优先 token-usage 记录值；仅当为 0 时用日志估算兜底（与双轨计划 §0 一致）。
 * @param {object} usageRow - token-usage 项（含 totalTokens、sessionKey）
 * @param {object|undefined} sessionRow - 同 sessionKey 的会话列表项
 * @returns {number}
 */
export function rankComparableTokens(usageRow, sessionRow) {
  const recorded = usageRow?.totalTokens ?? 0;
  if (recorded > 0) return recorded;
  const est = sessionRow?.estimatedTokensFromLog;
  if (est != null && est > 0) return est;
  return 0;
}

/**
 * @param {Array} usageRows - token-usage 列表
 * @param {Array} sessionList - GET /api/sessions 列表
 * @param {{ topN?: number }} [options]
 * @returns {Array<{ sessionKey: string, sessionId?: string, recordedTokens: number, estimatedTokens: number|null }>}
 */
export function buildTopNDualSeries(usageRows, sessionList, options = {}) {
  const topN = options.topN ?? 10;
  const sessionMap = new Map(sessionList.map((s) => [s.sessionKey, s]));
  const sorted = [...usageRows].sort(
    (a, b) => rankComparableTokens(b, sessionMap.get(b.sessionKey)) - rankComparableTokens(a, sessionMap.get(a.sessionKey)),
  );
  return sorted.slice(0, topN).map((u) => {
    const ls = sessionMap.get(u.sessionKey);
    const est = ls?.estimatedTokensFromLog;
    return {
      sessionKey: u.sessionKey,
      sessionId: u.sessionId,
      recordedTokens: u.totalTokens ?? 0,
      estimatedTokens: est != null && est > 0 ? est : null,
    };
  });
}
