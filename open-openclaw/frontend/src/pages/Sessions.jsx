import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { sessionsApi } from '../api';

export default function Sessions() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  const fetchSessions = async () => {
    try {
      const data = await sessionsApi.list();
      setSessions(data);
    } catch (error) {
      console.error('Failed to fetch sessions:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  const filteredSessions = sessions.filter(session => {
    if (filter === 'all') return true;
    return session.status === filter;
  });

  const handleKillSession = async (e, sessionId) => {
    e.preventDefault();
    if (!confirm('确定要终止这个会话吗？')) return;

    try {
      await sessionsApi.kill(sessionId);
      await fetchSessions();
    } catch (error) {
      console.error('Failed to kill session:', error);
      alert('终止会话失败');
    }
  };

  const formatDuration = (ms) => {
    if (!ms) return 'N/A';
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  };

  const formatTokenUtilization = (usage) => {
    if (!usage || !usage.limit) return <span className="text-muted">N/A</span>;
    const utilization = usage.utilization || Math.round((usage.total / usage.limit) * 100);
    const color = utilization > 90 ? 'var(--danger)' : utilization > 70 ? 'var(--warning)' : 'var(--success)';
    const warning = utilization > 80 ? ' ⚠️' : '';
    return (
      <div className="flex" style={{ alignItems: 'center', gap: '0.5rem' }}>
        <div className="progress-bar" style={{ width: '80px' }}>
          <div
            className="progress-fill"
            style={{ width: `${Math.min(utilization, 100)}%`, background: color }}
          />
        </div>
        <span className="text-muted text-sm" style={{ color }}>{utilization}%{warning}</span>
      </div>
    );
  };

  if (loading) {
    return <div className="loading">加载会话列表中...</div>;
  }

  return (
    <div>
      <div className="flex flex-between" style={{ marginBottom: '1.5rem' }}>
        <h2 className="card-title">会话列表</h2>
        <div className="flex">
          {['all', 'active', 'idle', 'completed', 'failed'].map(status => (
            <button
              key={status}
              className={`btn ${filter === status ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setFilter(status)}
            >
              {status === 'all' ? '全部' : status}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Session Key</th>
              <th>状态</th>
              <th>用户</th>
              <th>最后活跃</th>
              <th>持续时间</th>
              <th>Token 利用率</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {filteredSessions.map(session => (
              <tr key={session.sessionId}>
                <td>
                  <Link to={`/sessions/${session.sessionId}`} style={{ color: 'var(--primary)' }}>
                    {session.sessionKey || session.sessionId.slice(0, 8)}-{session.sessionId.slice(8, 12)}...
                  </Link>
                </td>
                <td>
                  <span className={`session-status ${session.status}`}>
                    {session.status}
                  </span>
                </td>
                <td className="text-muted">{session.user || 'unknown'}</td>
                <td className="text-muted text-sm">
                  {new Date(session.lastActive).toLocaleString('zh-CN')}
                </td>
                <td className="text-muted">{formatDuration(session.duration)}</td>
                <td>
                  {session.tokenUsage ? formatTokenUtilization(session.tokenUsage) : (
                    <span className="text-muted">-</span>
                  )}
                </td>
                <td>
                  <div className="flex">
                    <Link
                      to={`/sessions/${session.sessionId}`}
                      className="btn btn-secondary"
                      style={{ padding: '0.25rem 0.75rem' }}
                    >
                      详情
                    </Link>
                    {session.status === 'active' && (
                      <button
                        className="btn btn-danger"
                        style={{ padding: '0.25rem 0.75rem' }}
                        onClick={(e) => handleKillSession(e, session.sessionId)}
                      >
                        终止
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {filteredSessions.length === 0 && (
              <tr>
                <td colSpan="7" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
                  暂无会话
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
