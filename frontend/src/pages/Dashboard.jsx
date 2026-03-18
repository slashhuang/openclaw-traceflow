import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { healthApi, sessionsApi, logsApi, metricsApi, statusApi } from '../api';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';

function StatCard({ value, label, color = 'primary', icon, hint }) {
  const colors = {
    primary: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    success: 'linear-gradient(135deg, #48bb78 0%, #38a169 100%)',
    warning: 'linear-gradient(135deg, #ed8936 0%, #dd6b20 100%)',
    danger: 'linear-gradient(135deg, #f56565 0%, #e53e3e 100%)',
  };

  return (
    <div className="stat-card" style={{ background: colors[color] || colors.primary }} title={hint}>
      {icon && <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>{icon}</div>}
      <div className="stat-value" style={{ color: '#fff' }}>{value}</div>
      <div className="stat-label" style={{ color: 'rgba(255,255,255,0.9)' }}>{label}</div>
      {hint && (
        <div style={{ fontSize: '0.65rem', opacity: 0.85, marginTop: '0.25rem', fontWeight: 'normal' }}>{hint}</div>
      )}
    </div>
  );
}

function LatencyCard({ title, value, unit, color }) {
  return (
    <div style={{
      padding: '1rem',
      background: 'rgba(255,255,255,0.05)',
      borderRadius: '0.5rem',
      border: `1px solid ${color}`,
    }}>
      <div className="text-muted text-sm">{title}</div>
      <div style={{ fontSize: '1.5rem', fontWeight: '700', color, marginTop: '0.25rem' }}>
        {value} <span style={{ fontSize: '0.875rem', fontWeight: '400' }}>{unit}</span>
      </div>
    </div>
  );
}

function inferSessionTypeLabel(sessionKey) {
  const key = sessionKey || '';
  const full = key.includes('/') ? key.split('/').pop() || key : key;
  if (full.endsWith(':main') || full === 'main') return 'heartbeat';
  if (full.includes(':cron:')) return 'cron';
  if (full.includes(':wave:')) return 'Wave';
  if (full.includes(':slack:')) return 'Slack';
  if (full.includes(':telegram:')) return 'Telegram';
  if (full.includes(':cron')) return 'cron';
  return '用户';
}

const TYPE_SORT_ORDER = { heartbeat: 0, cron: 1, Wave: 2, 'Wave 用户': 2, Slack: 3, Telegram: 3, Discord: 3, 飞书: 3, 用户: 4 };

function formatTokenShort(n) {
  if (n == null || typeof n !== 'number') return '?';
  if (n >= 1000) return `${(n / 1000).toFixed(0)}k`;
  return String(n);
}

function formatSessionShort(sessionId, sessionKey) {
  const id = (sessionId || '').includes('/') ? (sessionId || '').split('/').pop() : sessionId;
  if (id && id.length >= 8) return `${id.slice(0, 8)}...`;
  const keyPart = (sessionKey || '').split(':').pop() || sessionKey || '-';
  return keyPart.slice(0, 12);
}

function formatTimeAgo(ms) {
  if (ms == null || typeof ms !== 'number') return '';
  const sec = Math.floor(ms / 1000);
  const min = Math.floor(sec / 60);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min} 分钟前`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} 小时前`;
  return `${Math.floor(h / 24)} 天前`;
}

function StatusOverviewCard({ overview }) {
  if (!overview || overview.error) return null;
  const status = overview.status || {};
  const usage = overview.usage || {};
  const sessions = status.sessions || {};
  const defaults = sessions.defaults || {};
  const recent = sessions.recent || [];
  const mainSession = recent[0];
  const queuedEvents = status.queuedSystemEvents || [];

  const model = mainSession?.model || defaults.model || '?';
  const inputTokens = mainSession?.inputTokens ?? 0;
  const outputTokens = mainSession?.outputTokens ?? 0;
  const totalTokens = mainSession?.totalTokens ?? inputTokens + outputTokens;
  const contextTokens = mainSession?.contextTokens ?? defaults.contextTokens;
  const pct = contextTokens && totalTokens ? Math.round((totalTokens / contextTokens) * 100) : null;
  const contextLine = contextTokens
    ? `${formatTokenShort(totalTokens)}/${formatTokenShort(contextTokens)}${pct != null ? ` (${pct}%)` : ''}`
    : 'N/A';
  const sessionKey = mainSession?.key || 'N/A';
  const sessionId = mainSession?.sessionId;
  const sessionAge = mainSession?.age != null ? formatTimeAgo(mainSession.age) : '';
  const queueMode = queuedEvents.length > 0 ? `collect (depth ${queuedEvents.length})` : 'collect (depth 0)';
  const thinkingLevel = mainSession?.thinkingLevel || 'low';
  const typeLabel = inferSessionTypeLabel(sessionKey);

  return (
    <div className="card mt-4" style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
      <h3 className="card-title" style={{ marginBottom: '0.5rem' }}>📋 Status 概览</h3>
      <p className="text-muted" style={{ fontSize: '0.7rem', marginBottom: '0.75rem' }}>
        以下为 <strong>最近一次有活动的会话</strong>（可能已空闲），非「活跃中」的实时会话
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', color: 'var(--text-secondary)' }}>
        <div>🦞 OpenClaw {overview.version || '?'}</div>
        <div>🧠 Model: {model}</div>
        <div>
          <strong>🧵 当前会话</strong>
          {sessionId ? (
            <Link to={`/sessions/${encodeURIComponent(sessionId)}`} style={{ color: 'var(--primary)', marginLeft: '0.5rem', textDecoration: 'underline' }}>
              {sessionKey}
            </Link>
          ) : (
            <span style={{ marginLeft: '0.5rem' }}>{sessionKey}</span>
          )}
          {sessionAge && <span className="text-muted" style={{ marginLeft: '0.25rem' }}>· {sessionAge}</span>}
          <span className="text-muted" style={{ marginLeft: '0.25rem', fontSize: '0.65rem' }}>（{typeLabel}）</span>
        </div>
        <div style={{ marginLeft: '1.25rem', paddingLeft: '0.5rem', borderLeft: '2px solid var(--border)' }}>
          <div>🧮 Tokens: {formatTokenShort(inputTokens)} in / {formatTokenShort(outputTokens)} out</div>
          <div>📚 Context: {contextLine}</div>
        </div>
        <div>⚙️ Runtime: direct · Think: {thinkingLevel}</div>
        <div>🪢 Queue: {queueMode}</div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [health, setHealth] = useState(null);
  const [statusOverview, setStatusOverview] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [recentLogs, setRecentLogs] = useState([]);
  const [metrics, setMetrics] = useState({ latency: null, tools: [], tokenSummary: null, tokenUsage: [] });
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      const [healthData, statusData, sessionsData, logsData, latencyData, toolsData, tokenSummaryData, tokenUsageData] = await Promise.all([
        healthApi.getHealth().catch(() => null),
        statusApi.getOverview().catch(() => null),
        sessionsApi.list().catch(() => []),
        logsApi.getRecent(10).catch(() => []),
        metricsApi.getLatency().catch(() => ({ p50: 0, p95: 0, p99: 0, count: 0 })),
        metricsApi.getTools().catch(() => []),
        metricsApi.getTokenSummary().catch(() => ({ totalInput: 0, totalOutput: 0, totalTokens: 0, nearLimitCount: 0, limitReachedCount: 0, sessionCount: 0 })),
        metricsApi.getTokenUsage().catch(() => []),
      ]);
      setHealth(healthData);
      setStatusOverview(statusData?.error ? null : statusData);
      setSessions(Array.isArray(sessionsData) ? sessionsData : []);
      setRecentLogs(Array.isArray(logsData) ? logsData : []);
      setMetrics({
        latency: latencyData || { p50: 0, p95: 0, p99: 0, count: 0 },
        tools: Array.isArray(toolsData) ? toolsData : [],
        tokenSummary: tokenSummaryData || { totalInput: 0, totalOutput: 0, totalTokens: 0, nearLimitCount: 0, limitReachedCount: 0, sessionCount: 0 },
        tokenUsage: Array.isArray(tokenUsageData) ? tokenUsageData : [],
      });
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 3000); // 3 秒刷新
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return <div className="loading">加载数据中...</div>;
  }

  const activeSessions = sessions.filter(s => s.status === 'active').length;
  const idleSessions = sessions.filter(s => s.status === 'idle').length;
  const completedSessions = sessions.filter(s => s.status === 'completed').length;
  const totalSessions = sessions.length;

  // 会话状态分布数据
  const sessionDistribution = [
    { name: '活跃', value: activeSessions, color: '#48bb78' },
    { name: '空闲', value: idleSessions, color: '#ed8936' },
    { name: '已完成', value: completedSessions, color: '#667eea' },
  ].filter(item => item.value > 0);

  // 工具调用图表数据
  const toolChartData = (metrics.tools || []).slice(0, 8).map(t => ({
    name: t.tool?.length > 15 ? t.tool.slice(0, 15) + '...' : t.tool,
    count: t.count,
    successRate: Math.round(t.successRate || 0),
  }));

  return (
    <div>
      <h2 className="card-title" style={{ marginBottom: '1.5rem' }}>🦞 OpenClaw 监控仪表盘</h2>

      {/* 统计卡片 */}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        <StatCard value={health?.status || 'N/A'} label="系统状态" color="success" icon="💚" hint="Gateway 连接状态" />
        <StatCard value={totalSessions} label="总会话" color="primary" icon="📊" hint="所有会话总数" />
        <StatCard value={activeSessions} label="活跃中" color="success" icon="🟢" hint="5 分钟内有活动的会话" />
        <StatCard value={idleSessions} label="空闲" color="warning" icon="🟡" hint="超过 5 分钟无活动的会话" />
      </div>

      {/* Status 概览 */}
      <StatusOverviewCard overview={statusOverview} />

      {/* 延迟指标 */}
      {metrics.latency && metrics.latency.count > 0 && (
        <div className="card mt-4">
          <h3 className="card-title" style={{ marginBottom: '1rem' }}>⚡ 响应延迟指标 (过去 1 小时)</h3>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
            <LatencyCard title="P50" value={metrics.latency.p50} unit="ms" color="#48bb78" />
            <LatencyCard title="P95" value={metrics.latency.p95} unit="ms" color="#ed8936" />
            <LatencyCard title="P99" value={metrics.latency.p99} unit="ms" color="#f56565" />
            <LatencyCard title="总请求数" value={metrics.latency.count} unit="次" color="#667eea" />
          </div>
        </div>
      )}

      {/* Token 用量汇总 */}
      {metrics.tokenSummary && (
        <div className="card mt-4">
          <h3 className="card-title" style={{ marginBottom: '0.5rem' }}>💰 Token 用量汇总 (过去 24 小时)</h3>
          <p className="text-muted" style={{ fontSize: '0.7rem', marginBottom: '1rem' }}>
            预警 = 某次采集时会话上下文使用率 ≥ 80% 记录 1 次 · 触顶 = 使用率 ≥ 100% 记录 1 次 · 每 30 秒采集
          </p>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(6, 1fr)' }}>
            <StatCard value={metrics.tokenSummary.totalInput?.toLocaleString() || '0'} label="Input Tokens" color="primary" />
            <StatCard value={metrics.tokenSummary.totalOutput?.toLocaleString() || '0'} label="Output Tokens" color="success" />
            <StatCard value={metrics.tokenSummary.totalTokens?.toLocaleString() || '0'} label="Total Tokens" color="warning" />
            <StatCard value={metrics.tokenSummary.sessionCount || '0'} label="会话数" color="primary" />
            <StatCard
              value={metrics.tokenSummary.nearLimitCount || '0'}
              label="预警次数"
              color={metrics.tokenSummary.nearLimitCount > 0 ? 'warning' : 'success'}
              icon={metrics.tokenSummary.nearLimitCount > 0 ? '⚠️' : undefined}
              hint="过去 24h 内，会话 token 使用率 ≥ 80% 时记录的事件次数"
            />
            <StatCard
              value={metrics.tokenSummary.limitReachedCount || '0'}
              label="触顶次数"
              color={metrics.tokenSummary.limitReachedCount > 0 ? 'danger' : 'success'}
              icon={metrics.tokenSummary.limitReachedCount > 0 ? '🚨' : undefined}
              hint="过去 24h 内，会话 token 使用率达到 100% 时记录的事件次数"
            />
          </div>
        </div>
      )}

      {/* 图表区域 */}
      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
        {/* 会话状态分布 */}
        <div className="card">
          <h3 className="card-title">会话状态分布</h3>
          <p className="text-muted" style={{ fontSize: '0.7rem', marginBottom: '0.5rem' }}>
            活跃=5 分钟内有活动 · 空闲=超 5 分钟无活动 · 已完成=会话已结束
          </p>
          {sessionDistribution.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={sessionDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                    label={({ name, value }) => `${name}: ${value}`}
                  >
                    {sessionDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex" style={{ justifyContent: 'center', gap: '1rem', marginTop: '1rem' }}>
                {sessionDistribution.map(item => (
                  <div key={item.name} className="flex" style={{ alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{ width: '12px', height: '12px', borderRadius: '2px', background: item.color }} />
                    <span className="text-muted text-sm">{item.name}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '3rem' }}>
              暂无会话数据
            </div>
          )}
        </div>

        {/* 工具调用统计 */}
        <div className="card">
          <h3 className="card-title">工具调用 Top 8</h3>
          {toolChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={toolChartData}>
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis />
                <Tooltip
                  contentStyle={{
                    background: 'rgba(0,0,0,0.9)',
                    border: '1px solid var(--border)',
                    borderRadius: '0.5rem',
                  }}
                />
                <Bar dataKey="count" fill="#667eea" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '3rem' }}>
              暂无工具调用数据
            </div>
          )}
        </div>
      </div>

      {/* Session Key Token 用量排行 */}
      {metrics.tokenUsage && metrics.tokenUsage.length > 0 && (
        <div className="card mt-4">
          <h3 className="card-title" style={{ marginBottom: '0.5rem' }}>Session Key Token 用量 Top 10 (过去 24 小时)</h3>
          <p className="text-muted" style={{ fontSize: '0.7rem', marginBottom: '1rem' }}>
            触顶次数 = 该会话在采集周期内 token 使用率 ≥ 100% 的次数
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ minWidth: '720px' }}>
              <thead>
                <tr>
                  <th>类型</th>
                  <th>会话</th>
                  <th>用户</th>
                  <th>总 Token</th>
                  <th>In / Out</th>
                  <th>请求</th>
                  <th>模型 / 利用率</th>
                  <th>触顶</th>
                </tr>
              </thead>
            <tbody>
              {[...metrics.tokenUsage]
                .sort((a, b) => {
                  const typeA = sessions.find((s) => s.sessionId === a.sessionId || s.sessionKey === a.sessionKey)?.typeLabel ?? inferSessionTypeLabel(a.sessionKey);
                  const typeB = sessions.find((s) => s.sessionId === b.sessionId || s.sessionKey === b.sessionKey)?.typeLabel ?? inferSessionTypeLabel(b.sessionKey);
                  const orderA = TYPE_SORT_ORDER[typeA] ?? 5;
                  const orderB = TYPE_SORT_ORDER[typeB] ?? 5;
                  if (orderA !== orderB) return orderA - orderB;
                  return (b.totalTokens ?? 0) - (a.totalTokens ?? 0);
                })
                .map((item, index) => {
                const matchedSession = sessions.find(
                  (s) => s.sessionId === item.sessionId || s.sessionKey === item.sessionKey
                );
                const typeLabel = matchedSession?.typeLabel ?? inferSessionTypeLabel(item.sessionKey);
                const user = (typeLabel === 'heartbeat' || typeLabel === 'cron') ? typeLabel : (matchedSession?.user || '-');
                const limit = item.tokenLimit;
                const fallbackId = (item.sessionId || '').includes('/') ? (item.sessionId || '').split('/').pop() : (item.sessionId || item.sessionKey);
                const detailId = (matchedSession?.sessionId ?? fallbackId);
                return (
                  <tr key={item.sessionKey}>
                    <td>
                      <span className="badge" style={{ fontSize: '0.65rem', background: typeLabel === 'heartbeat' ? 'rgba(72,187,120,0.3)' : typeLabel === 'cron' ? 'rgba(237,137,54,0.3)' : 'rgba(102,126,234,0.3)' }}>
                        {typeLabel}
                      </span>
                    </td>
                    <td>
                      {detailId ? (
                        <Link
                          to={`/sessions/${encodeURIComponent(detailId)}`}
                          style={{ color: 'var(--primary)', fontWeight: 500 }}
                          title={item.sessionKey}
                        >
                          {formatSessionShort(item.sessionId, item.sessionKey)}
                        </Link>
                      ) : (
                        <span title={item.sessionKey}>{formatSessionShort(item.sessionId, item.sessionKey)}</span>
                      )}
                    </td>
                    <td className="text-muted text-sm">{user}</td>
                    <td>
                      <span style={{ color: 'var(--primary)' }} title={`${(item.totalTokens || 0).toLocaleString()} tokens`}>
                        {item.totalTokens != null ? `${(item.totalTokens / 1000).toFixed(1)}k` : '-'}
                      </span>
                    </td>
                    <td className="text-muted text-sm">
                      {formatTokenShort(item.inputTokens || 0)} / {formatTokenShort(item.outputTokens || 0)}
                    </td>
                    <td className="text-muted text-sm">{item.requestCount || 0}</td>
                    <td>
                      {item.avgUtilization != null ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                          {limit != null && (
                            <span className="text-muted text-sm" title={`阈值 ${(limit / 1000).toFixed(0)}k`}>
                              {(limit / 1000).toFixed(0)}k
                            </span>
                          )}
                          <div className="flex" style={{ alignItems: 'center', gap: '0.5rem' }}>
                            <div className="progress-bar" style={{ width: '60px' }}>
                              <div
                                className="progress-fill"
                                style={{
                                  width: `${Math.min(item.avgUtilization, 100)}%`,
                                  background: item.avgUtilization > 80 ? 'var(--danger)' : 'var(--success)',
                                }}
                              />
                            </div>
                            <span className="text-muted text-sm">{Math.round(item.avgUtilization || 0)}%</span>
                          </div>
                        </div>
                      ) : (
                        <span className="text-muted">N/A</span>
                      )}
                    </td>
                    <td>
                      {item.limitReachedCount > 0 ? (
                        <span style={{ color: 'var(--danger)' }}>🚨 {item.limitReachedCount}</span>
                      ) : (
                        <span className="text-muted">-</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {/* 系统信息和最近会话 */}
      <div className="grid" style={{ gridTemplateColumns: '2fr 1fr' }}>
        <div className="card">
          <div className="flex flex-between" style={{ marginBottom: '1rem' }}>
            <h3 className="card-title">最近会话</h3>
            <Link to="/sessions" className="btn btn-secondary">查看全部</Link>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>类型</th>
                <th>Session ID</th>
                <th>用户</th>
                <th>状态</th>
                <th>最后活跃</th>
              </tr>
            </thead>
            <tbody>
              {sessions.slice(0, 5).map(session => (
                <tr key={session.sessionId}>
                  <td>
                    <span className="badge" style={{ fontSize: '0.65rem', background: (session.typeLabel || '') === 'heartbeat' ? 'rgba(72,187,120,0.3)' : (session.typeLabel || '') === 'cron' ? 'rgba(237,137,54,0.3)' : 'rgba(102,126,234,0.3)' }}>
                      {session.typeLabel || inferSessionTypeLabel(session.sessionKey)}
                    </span>
                  </td>
                  <td>
                    <Link to={`/sessions/${session.sessionId}`} style={{ color: 'var(--primary)' }}>
                      {session.sessionId.slice(0, 8)}...
                    </Link>
                  </td>
                  <td className="text-muted">{(session.typeLabel === 'heartbeat' || session.typeLabel === 'cron') ? session.typeLabel : (session.user || 'unknown')}</td>
                  <td>
                    <span className={`session-status ${session.status}`}>
                      {session.status}
                    </span>
                  </td>
                  <td className="text-muted text-sm">
                    {new Date(session.lastActive).toLocaleString('zh-CN')}
                  </td>
                </tr>
              ))}
              {sessions.length === 0 && (
                <tr>
                  <td colSpan="5" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
                    暂无会话数据
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="card">
          <h3 className="card-title">系统健康</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="flex flex-between" style={{ padding: '0.75rem', background: 'rgba(255,255,255,0.05)', borderRadius: '0.5rem' }}>
              <span className="text-muted text-sm">Gateway</span>
              <span className={`flex ${health?.gateway?.running ? 'text-success' : 'text-danger'}`}>
                <span style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: health?.gateway?.running ? 'var(--success)' : 'var(--danger)',
                  display: 'inline-block',
                  marginRight: '0.5rem',
                }} />
                {health?.gateway?.running ? '运行中' : '未运行'}
              </span>
            </div>
            <div className="flex flex-between" style={{ padding: '0.75rem', background: 'rgba(255,255,255,0.05)', borderRadius: '0.5rem' }}>
              <span className="text-muted text-sm">OpenClaw</span>
              <span className={`flex ${health?.openclawConnected ? 'text-success' : 'text-danger'}`}>
                <span style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: health?.openclawConnected ? 'var(--success)' : 'var(--danger)',
                  display: 'inline-block',
                  marginRight: '0.5rem',
                }} />
                {health?.openclawConnected ? '已连接' : '未连接'}
              </span>
            </div>
            <div className="flex flex-between" style={{ padding: '0.75rem', background: 'rgba(255,255,255,0.05)', borderRadius: '0.5rem' }}>
              <span className="text-muted text-sm">内存</span>
              <span style={{ fontWeight: '600' }}>
                {health?.gateway?.memory ? Math.round(health.gateway.memory / 1024 / 1024) : 'N/A'} MB
              </span>
            </div>
            <div className="flex flex-between" style={{ padding: '0.75rem', background: 'rgba(255,255,255,0.05)', borderRadius: '0.5rem' }}>
              <span className="text-muted text-sm">CPU</span>
              <span style={{ fontWeight: '600' }}>
                {health?.gateway?.cpu !== undefined ? `${health.gateway.cpu}%` : 'N/A'}
              </span>
            </div>
            {health?.gateway?.uptime && (
              <div className="flex flex-between" style={{ padding: '0.75rem', background: 'rgba(255,255,255,0.05)', borderRadius: '0.5rem' }}>
                <span className="text-muted text-sm">运行时间</span>
                <span style={{ fontWeight: '600' }}>
                  {Math.round(health.gateway.uptime / 3600)} 小时
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 最近日志 */}
      <div className="card mt-4">
        <div className="flex flex-between" style={{ marginBottom: '1rem' }}>
          <h3 className="card-title">实时日志</h3>
          <Link to="/logs" className="btn btn-secondary">查看完整日志</Link>
        </div>
        <div className="log-container" style={{ maxHeight: '300px' }}>
          {recentLogs.map((log, index) => (
            <div key={index} className="log-line">
              <span style={{ color: '#666', marginRight: '0.5rem' }}>
                {new Date(log.timestamp).toLocaleTimeString('zh-CN', { hour12: false })}
              </span>
              <span style={{
                color: log.level === 'error' ? '#f56565' : log.level === 'warn' ? '#ed8936' : '#48bb78',
                fontWeight: '600',
                width: '50px',
                display: 'inline-block',
              }}>
                [{log.level.toUpperCase()}]
              </span>
              <span style={{ color: '#e2e8f0' }}>{log.content}</span>
            </div>
          ))}
          {recentLogs.length === 0 && (
            <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem' }}>
              暂无日志数据
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
