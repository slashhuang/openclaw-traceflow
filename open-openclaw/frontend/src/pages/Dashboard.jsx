import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { healthApi, sessionsApi, logsApi, metricsApi } from '../api';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';

function StatCard({ value, label, color = 'primary', icon }) {
  const colors = {
    primary: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    success: 'linear-gradient(135deg, #48bb78 0%, #38a169 100%)',
    warning: 'linear-gradient(135deg, #ed8936 0%, #dd6b20 100%)',
    danger: 'linear-gradient(135deg, #f56565 0%, #e53e3e 100%)',
  };

  return (
    <div className="stat-card" style={{ background: colors[color] || colors.primary }}>
      {icon && <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>{icon}</div>}
      <div className="stat-value" style={{ color: '#fff' }}>{value}</div>
      <div className="stat-label" style={{ color: 'rgba(255,255,255,0.9)' }}>{label}</div>
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

export default function Dashboard() {
  const [health, setHealth] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [recentLogs, setRecentLogs] = useState([]);
  const [metrics, setMetrics] = useState({ latency: null, tools: [], tokenSummary: null, tokenUsage: [] });
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      const [healthData, sessionsData, logsData, latencyData, toolsData, tokenSummaryData, tokenUsageData] = await Promise.all([
        healthApi.getHealth().catch(() => null),
        sessionsApi.list().catch(() => []),
        logsApi.getRecent(10).catch(() => []),
        metricsApi.getLatency().catch(() => ({ p50: 0, p95: 0, p99: 0, count: 0 })),
        metricsApi.getTools().catch(() => []),
        metricsApi.getTokenSummary().catch(() => ({ totalInput: 0, totalOutput: 0, totalTokens: 0, nearLimitCount: 0, limitReachedCount: 0, sessionCount: 0 })),
        metricsApi.getTokenUsage().catch(() => []),
      ]);
      setHealth(healthData);
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
        <StatCard value={health?.status || 'N/A'} label="系统状态" color="success" icon="💚" />
        <StatCard value={totalSessions} label="总会话" color="primary" icon="📊" />
        <StatCard value={activeSessions} label="活跃中" color="success" icon="🟢" />
        <StatCard value={idleSessions} label="空闲" color="warning" icon="🟡" />
      </div>

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
          <h3 className="card-title" style={{ marginBottom: '1rem' }}>💰 Token 用量汇总 (过去 24 小时)</h3>
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
            />
            <StatCard
              value={metrics.tokenSummary.limitReachedCount || '0'}
              label="触顶次数"
              color={metrics.tokenSummary.limitReachedCount > 0 ? 'danger' : 'success'}
              icon={metrics.tokenSummary.limitReachedCount > 0 ? '🚨' : undefined}
            />
          </div>
        </div>
      )}

      {/* 图表区域 */}
      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
        {/* 会话状态分布 */}
        <div className="card">
          <h3 className="card-title">会话状态分布</h3>
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
          <h3 className="card-title">Session Key Token 用量 Top 10 (过去 24 小时)</h3>
          <table className="table">
            <thead>
              <tr>
                <th>Session Key</th>
                <th>总 Token</th>
                <th>Input</th>
                <th>Output</th>
                <th>请求数</th>
                <th>平均利用率</th>
                <th>触顶次数</th>
              </tr>
            </thead>
            <tbody>
              {metrics.tokenUsage.map((item, index) => (
                <tr key={item.sessionKey}>
                  <td style={{ fontWeight: '600' }}>{index + 1}. {item.sessionKey}</td>
                  <td style={{ color: 'var(--primary)' }}>{item.totalTokens?.toLocaleString() || 0}</td>
                  <td className="text-muted">{item.inputTokens?.toLocaleString() || 0}</td>
                  <td className="text-muted">{item.outputTokens?.toLocaleString() || 0}</td>
                  <td className="text-muted">{item.requestCount || 0}</td>
                  <td>
                    {item.avgUtilization ? (
                      <div className="flex" style={{ alignItems: 'center', gap: '0.5rem' }}>
                        <div className="progress-bar" style={{ width: '80px' }}>
                          <div
                            className="progress-fill"
                            style={{
                              width: `${Math.min(item.avgUtilization, 100)}%`,
                              background: item.avgUtilization > 80 ? 'var(--danger)' : 'var(--success)',
                            }}
                          />
                        </div>
                        <span className="text-muted text-sm">{Math.round(item.avgUtilization)}%</span>
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
              ))}
            </tbody>
          </table>
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
                <th>Session ID</th>
                <th>状态</th>
                <th>最后活跃</th>
              </tr>
            </thead>
            <tbody>
              {sessions.slice(0, 5).map(session => (
                <tr key={session.sessionId}>
                  <td>
                    <Link to={`/sessions/${session.sessionId}`} style={{ color: 'var(--primary)' }}>
                      {session.sessionId.slice(0, 8)}...
                    </Link>
                  </td>
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
                  <td colSpan="3" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
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
