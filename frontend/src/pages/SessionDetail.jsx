import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { sessionsApi } from '../api';

export default function SessionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('messages');
  const [error, setError] = useState(null);

  const fetchSession = async () => {
    try {
      const data = await sessionsApi.getDetail(id);
      console.log('Session detail response:', data);
      setSession(data);
      setError(null);
    } catch (error) {
      console.error('Failed to fetch session detail:', error);
      setError(error.message || 'Failed to load session details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSession();
  }, [id]);

  const handleKillSession = async () => {
    if (!confirm('确定要终止这个会话吗？')) return;

    try {
      await sessionsApi.kill(id);
      navigate('/sessions');
    } catch (error) {
      console.error('Failed to kill session:', error);
      alert('终止会话失败');
    }
  };

  /** 推断 user 消息的实际来源：heartbeat/cron 系统任务 vs 真实用户 */
  const inferMessageLabel = (msg) => {
    if (msg.role !== 'user') return msg.role;
    const content = (msg.content || '').toLowerCase();
    // heartbeat 任务：Read HEARTBEAT.md、HEARTBEAT_OK、heartbeat poll/wake 等
    if (content.includes('heartbeat.md') || content.includes('heartbeat_ok') || content.includes('heartbeat poll') || content.includes('heartbeat wake')) {
      return 'heartbeat';
    }
    // 带 Current time 的长系统提示（典型 heartbeat/cron 格式）
    if (content.includes('current time:') && content.length > 150) {
      return 'heartbeat';
    }
    if (content.includes('cron:') || content.includes('scheduled task')) {
      return 'cron';
    }
    return 'user';
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

  const formatTokenUsage = (usage, model, contextTokens) => {
    if (!usage) return null;
    const limit = usage.limit ?? contextTokens;
    const hasInputOutput = (usage.input ?? 0) > 0 || (usage.output ?? 0) > 0;
    return (
      <div className="card" style={{ marginTop: '1rem' }}>
        <h4 className="card-title">
          Token 使用情况
          {model && (
            <span className="text-muted text-sm" style={{ marginLeft: '0.5rem', fontWeight: 'normal' }}>
              · 模型: {model.split('/').pop()}
              {limit != null && ` · 阈值: ${(limit / 1000).toFixed(0)}k`}
            </span>
          )}
        </h4>
        <p className="text-muted" style={{ fontSize: '0.7rem', marginBottom: '0.75rem' }}>
          Input = 发给模型的 token（提示+上下文） · Output = 模型生成的 token · Total = 累计用量
        </p>
        <div className="grid" style={{ gridTemplateColumns: hasInputOutput ? 'repeat(3, 1fr)' : '1fr', marginBottom: '1rem' }}>
          {hasInputOutput && (
            <>
              <div>
                <div className="stat-value" style={{ fontSize: '1.5rem' }}>{usage.input || 0}</div>
                <div className="stat-label">Input Tokens</div>
              </div>
              <div>
                <div className="stat-value" style={{ fontSize: '1.5rem' }}>{usage.output || 0}</div>
                <div className="stat-label">Output Tokens</div>
              </div>
            </>
          )}
          <div>
            <div className="stat-value" style={{ fontSize: '1.5rem' }}>{usage.total || 0}</div>
            <div className="stat-label">Total Tokens</div>
            {!hasInputOutput && (usage.total ?? 0) > 0 && (
              <div className="text-muted" style={{ fontSize: '0.65rem', marginTop: '0.25rem' }}>
                当前数据源仅提供总量，未单独记录 input/output
              </div>
            )}
          </div>
        </div>
        {limit && (
          <div>
            <div className="flex flex-between" style={{ marginBottom: '0.5rem' }}>
              <span className="text-muted text-sm">使用限额</span>
              <span className="text-muted text-sm">{usage.total} / {limit}</span>
            </div>
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{
                  width: `${Math.min((usage.total / limit) * 100, 100)}%`,
                  background: (usage.total / limit) > 0.8 ? 'var(--danger)' : 'var(--primary)',
                }}
              />
            </div>
            <div className="text-muted text-sm mt-2">
              已使用 {usage.utilization || Math.round((usage.total / limit) * 100)}%
              {(usage.total / limit) > 0.8 && (
                <span style={{ color: 'var(--danger)', marginLeft: '0.5rem' }}>⚠️ 接近限额</span>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return <div className="loading">加载会话详情...</div>;
  }

  if (error) {
    return (
      <div className="card">
        <h2 className="card-title" style={{ color: 'var(--danger)' }}>加载失败</h2>
        <p style={{ color: 'var(--text-secondary)', margin: '1rem 0' }}>{error}</p>
        <button className="btn btn-primary mt-4" onClick={fetchSession}>重试</button>
        <button className="btn btn-secondary mt-4 ml-2" onClick={() => navigate('/sessions')}>返回列表</button>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="card">
        <h2 className="card-title">会话未找到</h2>
        <p className="text-muted mt-4">该会话可能不存在或已被删除。</p>
        <button className="btn btn-primary mt-4" onClick={() => navigate('/sessions')}>
          返回会话列表
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-between" style={{ marginBottom: '1.5rem' }}>
        <div>
          <h2 className="card-title">会话详情</h2>
          <div className="flex" style={{ alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
            {session.typeLabel && (
              <span className="badge" style={{ fontSize: '0.75rem', background: session.typeLabel === 'heartbeat' ? 'rgba(72,187,120,0.3)' : session.typeLabel === 'cron' ? 'rgba(237,137,54,0.3)' : 'rgba(102,126,234,0.3)' }}>
                {session.typeLabel}
              </span>
            )}
            <span className="text-muted text-sm">ID: {session.sessionId}</span>
          </div>
        </div>
        <div className="flex">
          <Link to="/sessions" className="btn btn-secondary">返回列表</Link>
          {session.status === 'active' && (
            <button className="btn btn-danger" onClick={handleKillSession}>终止会话</button>
          )}
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(5, 1fr)', marginBottom: '1.5rem' }}>
        <div className="stat-card">
          <div className="stat-value">
            <span className={`session-status ${session.status}`}>{session.status}</span>
          </div>
          <div className="stat-label">状态</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ fontSize: '1rem' }}>
            {(session.typeLabel === 'heartbeat' || session.typeLabel === 'cron') ? session.typeLabel : (session.user || 'unknown')}
          </div>
          <div className="stat-label">用户</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ fontSize: '1.5rem' }}>
            {session.messages?.length || 0}
          </div>
          <div className="stat-label">消息数</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ fontSize: '1.5rem' }}>
            {session.toolCalls?.length || 0}
          </div>
          <div className="stat-label">工具调用</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ fontSize: '1.5rem' }}>
            {formatDuration(session.duration)}
          </div>
          <div className="stat-label">持续时间</div>
        </div>
      </div>

      {session.tokenUsage && formatTokenUsage(session.tokenUsage, session.model, session.contextTokens)}

      <div className="card mt-4">
        <div className="flex" style={{ marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
          {['messages', 'toolCalls', 'events'].map(tab => (
            <button
              key={tab}
              className={`btn ${activeTab === tab ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setActiveTab(tab)}
              style={{ marginRight: '0.5rem' }}
            >
              {tab === 'messages' ? '消息' : tab === 'toolCalls' ? '工具调用' : '事件'}
              {tab === 'messages' && session.messages && ` (${session.messages.length})`}
              {tab === 'toolCalls' && session.toolCalls && ` (${session.toolCalls.length})`}
              {tab === 'events' && session.events && ` (${session.events.length})`}
            </button>
          ))}
        </div>

        <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
          {activeTab === 'messages' && (
            <div>
              {session.messages && session.messages.length > 0 ? (
                session.messages.map((msg, idx) => {
                  const displayRole = inferMessageLabel(msg);
                  const isSystemTask = displayRole === 'heartbeat' || displayRole === 'cron';
                  const bgColor = isSystemTask ? 'rgba(237, 137, 54, 0.15)' : msg.role === 'user' ? 'rgba(102, 126, 234, 0.2)' : 'rgba(72, 187, 120, 0.2)';
                  const borderColor = isSystemTask ? 'var(--warning)' : msg.role === 'user' ? 'var(--primary)' : 'var(--success)';
                  return (
                  <div
                    key={idx}
                    style={{
                      padding: '1rem',
                      borderRadius: '0.5rem',
                      marginBottom: '1rem',
                      background: bgColor,
                      border: `1px solid ${borderColor}`,
                    }}
                  >
                    <div className="flex flex-between" style={{ marginBottom: '0.5rem' }}>
                      <span className="badge" style={isSystemTask ? { background: 'rgba(237, 137, 54, 0.4)' } : {}}>
                        {displayRole}
                        {msg.sender && (
                          <span className="text-muted" style={{ marginLeft: '0.5rem', fontWeight: 'normal' }}>
                            · {msg.sender}
                          </span>
                        )}
                      </span>
                      <span className="text-muted text-sm">
                        {msg.timestamp ? new Date(msg.timestamp).toLocaleString('zh-CN') : 'N/A'}
                      </span>
                    </div>
                    <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{msg.content || '(no content)'}</div>
                  </div>
                );
                })
              ) : (
                <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem' }}>
                  暂无消息
                </div>
              )}
            </div>
          )}

          {activeTab === 'toolCalls' && (
            <div>
              {session.toolCalls && session.toolCalls.length > 0 ? (
                session.toolCalls.map((tool, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: '1rem',
                      borderRadius: '0.5rem',
                      marginBottom: '1rem',
                      background: tool.success ? 'rgba(72, 187, 120, 0.1)' : 'rgba(245, 101, 101, 0.1)',
                      border: `1px solid ${tool.success ? 'var(--success)' : 'var(--danger)'}`,
                    }}
                  >
                    <div className="flex flex-between" style={{ marginBottom: '0.5rem' }}>
                      <span className="badge">{tool.name || tool.tool || 'Unknown'}</span>
                      <span className={`session-status ${tool.success ? 'active' : 'failed'}`}>
                        {tool.success ? '成功' : '失败'}
                      </span>
                    </div>
                    <div className="text-muted text-sm">耗时：{tool.duration || tool.durationMs || 'N/A'}ms</div>
                    {tool.error && (
                      <div style={{ color: 'var(--danger)', marginTop: '0.5rem' }}>{tool.error}</div>
                    )}
                    {tool.input && (
                      <details style={{ marginTop: '0.5rem' }}>
                        <summary className="text-muted text-sm" style={{ cursor: 'pointer' }}>输入参数</summary>
                        <pre style={{ margin: '0.5rem 0', fontSize: '0.75rem', background: 'rgba(0,0,0,0.3)', padding: '0.5rem', borderRadius: '0.25rem', overflow: 'auto' }}>
                          {JSON.stringify(tool.input, null, 2)}
                        </pre>
                      </details>
                    )}
                    {tool.output && (
                      <details style={{ marginTop: '0.5rem' }}>
                        <summary className="text-muted text-sm" style={{ cursor: 'pointer' }}>输出结果</summary>
                        <pre style={{ margin: '0.5rem 0', fontSize: '0.75rem', background: 'rgba(0,0,0,0.3)', padding: '0.5rem', borderRadius: '0.25rem', overflow: 'auto' }}>
                          {JSON.stringify(tool.output, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                ))
              ) : (
                <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem' }}>
                  暂无工具调用
                </div>
              )}
            </div>
          )}

          {activeTab === 'events' && (
            <div>
              {session.events && session.events.length > 0 ? (
                session.events.map((event, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: '1rem',
                      borderRadius: '0.5rem',
                      marginBottom: '1rem',
                      background: 'rgba(0, 0, 0, 0.2)',
                    }}
                  >
                    <div className="flex flex-between" style={{ marginBottom: '0.5rem' }}>
                      <span className="badge">{event.type || 'unknown'}</span>
                      <span className="text-muted text-sm">
                        {event.timestamp ? new Date(event.timestamp).toLocaleString('zh-CN') : 'N/A'}
                      </span>
                    </div>
                    <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: '0.875rem' }}>
                      {JSON.stringify(event.payload || event, null, 2)}
                    </pre>
                  </div>
                ))
              ) : (
                <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem' }}>
                  暂无事件
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
