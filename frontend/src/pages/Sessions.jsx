import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { sessionsApi } from '../api';

function SortableTh({ label, sortKey, currentSort, sortOrder, onSort }) {
  const isActive = currentSort === sortKey;
  const nextOrder = isActive && sortOrder === 'desc' ? 'asc' : 'desc';
  return (
    <th
      style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
      onClick={() => onSort(sortKey, nextOrder)}
      title={`点击按 ${label} 排序${isActive ? ` (当前: ${sortOrder === 'desc' ? '降序' : '升序'})` : ''}`}
    >
      {label}
      {isActive && <span style={{ marginLeft: '0.25rem', opacity: 0.8 }}>{sortOrder === 'desc' ? ' ↓' : ' ↑'}</span>}
    </th>
  );
}

export default function Sessions() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [sortBy, setSortBy] = useState('lastActive');
  const [sortOrder, setSortOrder] = useState('desc');

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

  const filteredSessions = sessions
    .filter(session => {
      if (filter === 'all') return true;
      return session.status === filter;
    })
    .sort((a, b) => {
      const getVal = (s, key) => {
        switch (key) {
          case 'lastActive': return s.lastActive ?? 0;
          case 'duration': return s.duration ?? 0;
          case 'totalTokens': return s.totalTokens ?? 0;
          case 'utilization': return s.tokenUsage?.utilization ?? (s.tokenUsage?.limit && s.tokenUsage?.total ? Math.round((s.tokenUsage.total / s.tokenUsage.limit) * 100) : 0);
          case 'status': return (s.status || '').toLowerCase();
          case 'typeLabel': return (s.typeLabel || '').toLowerCase();
          case 'user': return (s.user || '').toLowerCase();
          default: return 0;
        }
      };
      const va = getVal(a, sortBy);
      const vb = getVal(b, sortBy);
      const cmp = typeof va === 'number' && typeof vb === 'number'
        ? va - vb
        : String(va).localeCompare(String(vb));
      return sortOrder === 'desc' ? -cmp : cmp;
    });

  const handleSort = (key, order) => {
    setSortBy(key);
    setSortOrder(order);
  };

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
      <div className="flex flex-between" style={{ marginBottom: '1rem' }}>
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
      <p className="text-muted" style={{ fontSize: '0.7rem', marginBottom: '1rem' }}>
        点击表头切换排序（↓ 降序 ↑ 升序）
      </p>

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <SortableTh label="类型" sortKey="typeLabel" currentSort={sortBy} sortOrder={sortOrder} onSort={handleSort} />
              <SortableTh label="时长" sortKey="duration" currentSort={sortBy} sortOrder={sortOrder} onSort={handleSort} />
              <SortableTh label="总 Token" sortKey="totalTokens" currentSort={sortBy} sortOrder={sortOrder} onSort={handleSort} />
              <SortableTh label="模型 / 阈值" sortKey="utilization" currentSort={sortBy} sortOrder={sortOrder} onSort={handleSort} />
              <SortableTh label="状态" sortKey="status" currentSort={sortBy} sortOrder={sortOrder} onSort={handleSort} />
              <SortableTh label="用户" sortKey="user" currentSort={sortBy} sortOrder={sortOrder} onSort={handleSort} />
              <SortableTh label="最后活跃" sortKey="lastActive" currentSort={sortBy} sortOrder={sortOrder} onSort={handleSort} />
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {filteredSessions.map(session => (
              <tr key={session.sessionId}>
                <td>
                  <span className="badge" style={{ fontSize: '0.7rem', background: session.typeLabel === 'heartbeat' ? 'rgba(72,187,120,0.3)' : session.typeLabel === 'cron' ? 'rgba(237,137,54,0.3)' : 'rgba(102,126,234,0.3)' }}>
                    {session.typeLabel || '用户'}
                  </span>
                </td>
                <td>
                  <Link
                    to={`/sessions/${session.sessionId}`}
                    style={{ color: 'var(--primary)', fontWeight: 500 }}
                    title={`${session.sessionKey || session.sessionId}`}
                  >
                    {formatDuration(session.duration)}
                  </Link>
                </td>
                <td>
                  {session.totalTokens != null ? (
                    <span title={`${session.totalTokens.toLocaleString()} tokens`}>
                      {(session.totalTokens / 1000).toFixed(1)}k
                    </span>
                  ) : (
                    <span className="text-muted">-</span>
                  )}
                </td>
                <td>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    {session.model && (
                      <span className="text-sm" title={session.model}>
                        {session.model.split('/').pop()?.slice(0, 24) || session.model}
                      </span>
                    )}
                    {session.tokenUsage
                      ? formatTokenUtilization(session.tokenUsage)
                      : !session.model && <span className="text-muted">-</span>}
                  </div>
                </td>
                <td>
                  <span className={`session-status ${session.status}`}>
                    {session.status}
                  </span>
                </td>
                <td className="text-muted">{(session.typeLabel === 'heartbeat' || session.typeLabel === 'cron') ? session.typeLabel : (session.user || 'unknown')}</td>
                <td className="text-muted text-sm">
                  {new Date(session.lastActive).toLocaleString('zh-CN')}
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
                <td colSpan="8" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
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
