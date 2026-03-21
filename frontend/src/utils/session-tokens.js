/**
 * 会话列表/仪表盘用的「上下文占用率」百分比。
 * contextUtilizationReliable === false 时返回 null（勿展示为准确利用率）。
 */
export function sessionTokenUtilizationPercent(session) {
  const u = session?.tokenUsage;
  if (!u?.limit) return null;
  if (u.contextUtilizationReliable === false) return null;
  if (typeof u.utilization === 'number') return Math.min(100, Math.max(0, u.utilization));
  if (typeof u.total === 'number' && u.limit > 0) {
    return Math.min(100, Math.max(0, Math.round((u.total / u.limit) * 100)));
  }
  return null;
}
