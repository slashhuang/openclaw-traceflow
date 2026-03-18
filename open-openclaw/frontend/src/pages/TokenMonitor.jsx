import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

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

function userLabelForTokenRow(usageRow, sessionList) {
  const ls = sessionList.find((s) => s.sessionKey === usageRow.sessionKey);
  const typeLabel = ls?.typeLabel || inferSessionTypeLabel(usageRow.sessionKey);
  const sys = typeLabel === 'heartbeat' || typeLabel === 'cron';
  if (ls) return sys ? typeLabel : ls.user || 'unknown';
  const id = usageRow.sessionId || '';
  const tail = id.includes('/') ? id.split('/').pop() : id;
  return tail && tail.length >= 6 ? `${tail.slice(0, 8)}…` : usageRow.sessionKey?.slice(0, 14) || '—';
}

const THRESHOLD_COLORS = {
  normal: '#10B981',
  warning: '#F59E0B',
  serious: '#F97316',
  critical: '#EF4444',
  limit: '#DC2626',
};

const THRESHOLD_LABELS = {
  normal: '正常',
  warning: '警告',
  serious: '严重',
  critical: '临界',
  limit: '已用尽',
};

export default function TokenMonitor() {
  const [sessions, setSessions] = useState([]);
  const [sessionList, setSessionList] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);

  useEffect(() => {
    fetchData();
    
    if (autoRefresh) {
      const interval = setInterval(fetchData, 30000); // 30 秒刷新
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  const fetchData = async () => {
    try {
      const [sessionsRes, alertsRes, listRes] = await Promise.all([
        fetch('/api/sessions/token-usage'),
        fetch('/api/sessions/token-alerts/history'),
        fetch('/api/sessions'),
      ]);

      const sessionsData = await sessionsRes.json();
      const alertsData = await alertsRes.json();
      const listData = await listRes.json();

      setSessions(sessionsData);
      setAlerts(alertsData);
      setSessionList(Array.isArray(listData) ? listData : []);
    } catch (error) {
      console.error('Failed to fetch token data:', error);
    } finally {
      setLoading(false);
    }
  };

  // 准备图表数据
  const thresholdDistribution = [
    { name: '正常', value: sessions.filter(s => s.threshold === 'normal').length, color: THRESHOLD_COLORS.normal },
    { name: '警告', value: sessions.filter(s => s.threshold === 'warning').length, color: THRESHOLD_COLORS.warning },
    { name: '严重', value: sessions.filter(s => s.threshold === 'serious').length, color: THRESHOLD_COLORS.serious },
    { name: '临界', value: sessions.filter(s => s.threshold === 'critical').length, color: THRESHOLD_COLORS.critical },
    { name: '已用尽', value: sessions.filter(s => s.threshold === 'limit').length, color: THRESHOLD_COLORS.limit },
  ];

  const topConsumptionSessions = [...sessions]
    .sort((a, b) => b.consumptionRate - a.consumptionRate)
    .slice(0, 10)
    .map((s) => {
      const label = userLabelForTokenRow(s, sessionList);
      return {
        name: label.length > 16 ? `${label.slice(0, 16)}…` : label,
        nameTip: s.sessionKey,
        rate: s.consumptionRate,
      };
    });

  const highUtilizationSessions = sessions.filter(s => s.utilization > 50);

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>;
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Token 监控</h1>
          <p className="text-gray-600 mt-1">实时监控会话 token 使用情况，阈值预警</p>
        </div>
        <div className="flex items-center space-x-4">
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="mr-2"
            />
            <span className="text-sm text-gray-600">自动刷新 (30s)</span>
          </label>
          <button
            onClick={fetchData}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            刷新
          </button>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-sm text-gray-600">总会话数</div>
          <div className="text-2xl font-bold text-gray-900">{sessions.length}</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-sm text-gray-600">正常</div>
          <div className="text-2xl font-bold text-green-600">{thresholdDistribution[0].value}</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-sm text-gray-600">警告</div>
          <div className="text-2xl font-bold text-yellow-600">{thresholdDistribution[1].value}</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-sm text-gray-600">严重/临界</div>
          <div className="text-2xl font-bold text-red-600">{thresholdDistribution[2].value + thresholdDistribution[3].value}</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-sm text-gray-600">已用尽</div>
          <div className="text-2xl font-bold text-gray-600">{thresholdDistribution[4].value}</div>
        </div>
      </div>

      {/* 告警列表 */}
      {alerts.length > 0 && (
        <div className="bg-white rounded-lg shadow mb-6">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold">最新告警</h2>
          </div>
          <div className="divide-y divide-gray-200">
            {alerts.slice(-5).reverse().map((alert, index) => (
              <div key={index} className="px-6 py-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-start">
                    <span className="text-xl mr-3">
                      {alert.threshold === 'warning' && '⚠️'}
                      {alert.threshold === 'serious' && '🔶'}
                      {alert.threshold === 'critical' && '🔴'}
                      {alert.threshold === 'limit' && '🚨'}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{alert.message}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        {new Date(alert.timestamp).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 图表 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* 阈值分布 */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-4">Token 使用阈值分布</h2>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={thresholdDistribution}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, value }) => `${name}: ${value}`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {thresholdDistribution.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* 消耗速率 Top 10 */}
        {topConsumptionSessions.length > 0 && (
          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-lg font-semibold mb-4">消耗速率 Top 10 (tokens/分钟)</h2>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={topConsumptionSessions}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" interval={0} angle={-25} textAnchor="end" height={70} tick={{ fontSize: 10 }} />
                <YAxis />
                <Tooltip formatter={(v) => [`${v} /min`, '消耗']} labelFormatter={(_, p) => p?.[0]?.payload?.nameTip || ''} />
                <Legend />
                <Bar dataKey="rate" fill="#8884d8" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* 高使用率会话列表 */}
      {highUtilizationSessions.length > 0 && (
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold">高使用率会话（&gt;50%）</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">类型</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">用户</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">使用率</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">已用 Token</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">限制</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">消耗速率</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">预计用尽</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {highUtilizationSessions.map((session, index) => {
                  const typeLabel = sessionList.find((s) => s.sessionKey === session.sessionKey)?.typeLabel
                    || inferSessionTypeLabel(session.sessionKey);
                  const userLabel = userLabelForTokenRow(session, sessionList);
                  return (
                  <tr key={session.sessionId || index} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-700">{typeLabel}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Link
                        to={`/sessions/${encodeURIComponent(session.sessionId)}`}
                        className="text-sm font-medium text-blue-600 hover:underline"
                        title={session.sessionKey}
                      >
                        {userLabel}
                      </Link>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="w-full bg-gray-200 rounded-full h-2.5 mr-2">
                          <div
                            className="h-2.5 rounded-full"
                            style={{
                              width: `${Math.min(session.utilization, 100)}%`,
                              backgroundColor: THRESHOLD_COLORS[session.threshold],
                            }}
                          ></div>
                        </div>
                        <span className={`text-sm font-medium ${
                          session.utilization >= 95 ? 'text-red-600' :
                          session.utilization >= 80 ? 'text-orange-600' :
                          session.utilization >= 50 ? 'text-yellow-600' :
                          'text-green-600'
                        }`}>
                          {session.utilization}%
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {session.totalTokens.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {session.limit?.toLocaleString() || '∞'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {session.consumptionRate}/min
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {session.estimatedTimeToLimit ? (
                        <span className={session.estimatedTimeToLimit < 60 ? 'text-red-600' : 'text-yellow-600'}>
                          {Math.floor(session.estimatedTimeToLimit / 60)}h {session.estimatedTimeToLimit % 60}m
                        </span>
                      ) : '-'}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
