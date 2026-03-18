import React, { useState, useEffect } from 'react';
import { setupApi, actionsApi } from '../api';

export default function Settings() {
  const [config, setConfig] = useState(null);
  const [gatewayUrl, setGatewayUrl] = useState('');
  const [gatewayToken, setGatewayToken] = useState('');
  const [gatewayPassword, setGatewayPassword] = useState('');
  const [stateDir, setStateDir] = useState('');
  const [workspaceDir, setWorkspaceDir] = useState('');
  const [accessMode, setAccessMode] = useState('local-only');
  const [accessToken, setAccessToken] = useState('');
  const [message, setMessage] = useState(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const data = await setupApi.getStatus();
        setConfig(data.config);
        setGatewayUrl(data.config.openclawGatewayUrl || '');
        setAccessMode(data.config.accessMode || 'local-only');
        setStateDir(data.config.openclawStateDir || data.config.openclawPaths?.stateDir || '');
        setWorkspaceDir(data.config.openclawWorkspaceDir || data.config.openclawPaths?.workspaceDir || '');
      } catch (error) {
        console.error('Failed to fetch config:', error);
      }
    };
    fetchConfig();
  }, []);

  const handleTestConnection = async () => {
    setTesting(true);
    setMessage(null);
    try {
      const result = await setupApi.testConnection({
        openclawGatewayUrl: gatewayUrl,
        openclawGatewayToken: gatewayToken || undefined,
        openclawGatewayPassword: gatewayPassword || undefined,
      });
      if (result.connected) {
        setMessage({ type: 'success', text: result.message || '连接成功！配置已自动保存。' });
      } else {
        setMessage({ type: 'error', text: `连接失败：${result.error || result.message}` });
      }
    } catch (error) {
      setMessage({ type: 'error', text: `测试失败：${error.message}` });
    } finally {
      setTesting(false);
    }
  };

  const handleSaveConfig = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await setupApi.configure({
        openclawGatewayUrl: gatewayUrl,
        openclawGatewayToken: gatewayToken || undefined,
        openclawGatewayPassword: gatewayPassword || undefined,
        openclawStateDir: stateDir.trim() || undefined,
        openclawWorkspaceDir: workspaceDir.trim() || undefined,
        accessMode,
        accessToken: accessMode === 'token' ? accessToken : undefined,
      });
      setMessage({ type: 'success', text: '配置已保存！' });
    } catch (error) {
      setMessage({ type: 'error', text: `保存失败：${error.message}` });
    } finally {
      setSaving(false);
    }
  };

  const handleRestartGateway = async () => {
    if (!confirm('确定要重启 Gateway 吗？这可能会导致当前会话中断。')) return;
    try {
      await actionsApi.restart();
      setMessage({ type: 'success', text: 'Gateway 重启命令已发送！' });
    } catch (error) {
      setMessage({ type: 'error', text: `重启失败：${error.message}` });
    }
  };

  const handleCleanupLogs = async () => {
    if (!confirm('确定要清理旧日志吗？将删除 7 天前的日志。')) return;
    try {
      await actionsApi.cleanupLogs();
      setMessage({ type: 'success', text: '日志清理完成！' });
    } catch (error) {
      setMessage({ type: 'error', text: `清理失败：${error.message}` });
    }
  };

  if (!config) {
    return <div className="loading">加载配置...</div>;
  }

  return (
    <div>
      <h2 className="card-title" style={{ marginBottom: '1.5rem' }}>系统设置</h2>

      {message && (
        <div className={`message ${message.type === 'success' ? 'message-success' : 'message-error'}`}>
          {message.text}
        </div>
      )}

      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="card">
          <h3 className="card-title">Gateway 配置</h3>

          <div className="form-group">
            <label className="form-label">Gateway URL</label>
            <input
              type="text"
              className="form-input"
              value={gatewayUrl}
              onChange={(e) => setGatewayUrl(e.target.value)}
              placeholder="http://localhost:18789"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Gateway Token（鉴权用，可选）</label>
            <input
              type="password"
              className="form-input"
              value={gatewayToken}
              onChange={(e) => setGatewayToken(e.target.value)}
              placeholder="OPENCLAW_GATEWAY_TOKEN"
            />
            <span className="text-muted text-sm">连接失败时请检查是否需填写 token</span>
          </div>

          <div className="form-group">
            <label className="form-label">Gateway Password（可选）</label>
            <input
              type="password"
              className="form-input"
              value={gatewayPassword}
              onChange={(e) => setGatewayPassword(e.target.value)}
              placeholder="系统或共享密码"
            />
          </div>

          <button
            className="btn btn-secondary"
            onClick={handleTestConnection}
            disabled={testing}
            style={{ marginRight: '0.5rem' }}
          >
            {testing ? '测试中...' : '测试连接'}
          </button>

          <div style={{ marginTop: '1rem' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setShowAdvanced(!showAdvanced)}
              style={{ fontSize: '0.875rem' }}
            >
              {showAdvanced ? '收起' : '展开'} 路径配置
            </button>
            {showAdvanced && (
              <div style={{ marginTop: '1rem', padding: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '0.5rem' }}>
                <div className="form-group">
                  <label className="form-label">State Dir（手动指定，可选）</label>
                  <input
                    type="text"
                    className="form-input"
                    value={stateDir}
                    onChange={(e) => setStateDir(e.target.value)}
                    placeholder="~/.openclaw 或绝对路径"
                  />
                  <span className="text-muted text-sm">留空则从 Gateway/CLI 自动解析</span>
                </div>
                <div className="form-group">
                  <label className="form-label">Workspace Dir（手动指定，可选）</label>
                  <input
                    type="text"
                    className="form-input"
                    value={workspaceDir}
                    onChange={(e) => setWorkspaceDir(e.target.value)}
                    placeholder="工作目录路径"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <h3 className="card-title">访问保护</h3>

          <div className="form-group">
            <label className="form-label">访问模式</label>
            <div className="mode-cards" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
              {[
                { value: 'local-only', icon: '🔒', label: '仅本地', desc: '仅限本机访问' },
                { value: 'token', icon: '🔑', label: 'Token', desc: 'Bearer Token' },
                { value: 'none', icon: '🔓', label: '公开', desc: '无保护' },
              ].map(mode => (
                <div
                  key={mode.value}
                  className={`mode-card ${accessMode === mode.value ? 'selected' : ''}`}
                  onClick={() => setAccessMode(mode.value)}
                >
                  <div className="mode-card-icon">{mode.icon}</div>
                  <div className="mode-card-title">{mode.label}</div>
                  <div className="mode-card-desc">{mode.desc}</div>
                </div>
              ))}
            </div>
          </div>

          {accessMode === 'token' && (
            <div className="form-group">
              <label className="form-label">Access Token</label>
              <input
                type="text"
                className="form-input"
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                placeholder="输入 Token"
              />
            </div>
          )}

          <button className="btn btn-primary" onClick={handleSaveConfig} disabled={saving}>
            {saving ? '保存中...' : '保存配置'}
          </button>
        </div>
      </div>

      <div className="card mt-4">
        <h3 className="card-title">快速操作</h3>
        <div className="flex">
          <button className="btn btn-warning" onClick={handleRestartGateway}>
            🔄 重启 Gateway
          </button>
          <button className="btn btn-warning" onClick={handleCleanupLogs}>
            🧹 清理日志
          </button>
        </div>
      </div>

      <div className="card mt-4">
        <h3 className="card-title">系统信息</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div className="flex flex-between">
            <span className="text-muted">监听地址</span>
            <span>{config.host}:{config.port}</span>
          </div>
          <div className="flex flex-between">
            <span className="text-muted">访问模式</span>
            <span className="badge">{config.accessMode}</span>
          </div>
          <div className="flex flex-between">
            <span className="text-muted">数据目录</span>
            <span className="text-muted text-sm">{config.dataDir}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
