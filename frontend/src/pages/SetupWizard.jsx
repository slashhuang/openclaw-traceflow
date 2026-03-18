import React, { useState } from 'react';
import { setupApi } from '../api';

export default function SetupWizard({ onComplete }) {
  const [step, setStep] = useState(1);
  const [gatewayUrl, setGatewayUrl] = useState('http://localhost:18789');
  const [gatewayToken, setGatewayToken] = useState('');
  const [gatewayPassword, setGatewayPassword] = useState('');
  const [accessMode, setAccessMode] = useState('local-only');
  const [accessToken, setAccessToken] = useState('');
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [error, setError] = useState(null);

  const handleTestConnection = async () => {
    setTesting(true);
    setError(null);
    try {
      const result = await setupApi.testConnection({
        openclawGatewayUrl: gatewayUrl,
        openclawGatewayToken: gatewayToken || undefined,
        openclawGatewayPassword: gatewayPassword || undefined,
      });
      setTestResult(result);
    } catch (err) {
      setError(`测试失败：${err.message}`);
    } finally {
      setTesting(false);
    }
  };

  const handleGenerateToken = async () => {
    try {
      const result = await setupApi.generateToken();
      setAccessToken(result.token);
    } catch (err) {
      setError(`生成 Token 失败：${err.message}`);
    }
  };

  const handleSaveAndComplete = async () => {
    setSaving(true);
    setError(null);
    try {
      await setupApi.configure({
        openclawGatewayUrl: gatewayUrl,
        openclawGatewayToken: gatewayToken || undefined,
        openclawGatewayPassword: gatewayPassword || undefined,
        accessMode,
        accessToken: accessMode === 'token' ? accessToken : undefined,
      });
      onComplete();
    } catch (err) {
      setError(`保存配置失败：${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const canProceedFromStep1 = testResult?.connected;
  const canProceedFromStep2 = accessMode !== 'token' || accessToken;

  return (
    <div className="setup-wizard">
      <div className="setup-card">
        <h1 className="setup-title">🦞 OpenClaw Monitor</h1>
        <p className="setup-subtitle">首次启动设置向导</p>

        {error && (
          <div className="message message-error">
            {error}
          </div>
        )}

        {/* Step 1: Connect Gateway */}
        {step === 1 && (
          <div>
            <h3 className="card-title" style={{ marginBottom: '1rem' }}>步骤 1：连接 OpenClaw Gateway</h3>
            <p className="text-muted" style={{ marginBottom: '1.5rem' }}>
              输入 OpenClaw Gateway 的地址，我们将测试连接是否正常。
            </p>

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

            {testResult && (
              <div className={`message ${testResult.connected ? 'message-success' : 'message-error'}`}>
                {testResult.connected
                  ? `✓ ${testResult.message || '连接成功！配置已自动保存。'}`
                  : `✗ 连接失败：${testResult.error || testResult.message}`}
              </div>
            )}

            <div className="flex" style={{ marginTop: '1.5rem' }}>
              <button
                className="btn btn-secondary"
                onClick={handleTestConnection}
                disabled={testing}
              >
                {testing ? '测试中...' : '测试连接'}
              </button>
              <button
                className="btn btn-primary"
                onClick={() => setStep(2)}
                disabled={!canProceedFromStep1}
                style={{ marginLeft: 'auto' }}
              >
                下一步
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Access Protection */}
        {step === 2 && (
          <div>
            <h3 className="card-title" style={{ marginBottom: '1rem' }}>步骤 2：访问保护</h3>
            <p className="text-muted" style={{ marginBottom: '1.5rem' }}>
              选择访问保护模式。个人使用推荐「仅本地」，公开部署推荐「Token」。
            </p>

            <div className="mode-cards">
              {[
                { value: 'local-only', icon: '🔒', label: '仅本地', desc: '只允许本机访问，最安全' },
                { value: 'token', icon: '🔑', label: 'Token', desc: '使用 Bearer Token 认证' },
                { value: 'none', icon: '🔓', label: '公开', desc: '无保护，任何人可访问' },
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

            {accessMode === 'token' && (
              <div className="form-group mt-4">
                <label className="form-label">Access Token</label>
                <div className="flex">
                  <input
                    type="text"
                    className="form-input"
                    value={accessToken}
                    onChange={(e) => setAccessToken(e.target.value)}
                    placeholder="输入或生成 Token"
                    style={{ flex: 1 }}
                  />
                  <button
                    className="btn btn-secondary"
                    onClick={handleGenerateToken}
                    style={{ marginLeft: '0.5rem' }}
                  >
                    生成
                  </button>
                </div>
              </div>
            )}

            <div className="flex" style={{ marginTop: '1.5rem' }}>
              <button
                className="btn btn-secondary"
                onClick={() => setStep(1)}
              >
                上一步
              </button>
              <button
                className="btn btn-primary"
                onClick={() => setStep(3)}
                disabled={!canProceedFromStep2}
                style={{ marginLeft: 'auto' }}
              >
                下一步
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Confirm */}
        {step === 3 && (
          <div>
            <h3 className="card-title" style={{ marginBottom: '1rem' }}>步骤 3：确认配置</h3>
            <p className="text-muted" style={{ marginBottom: '1.5rem' }}>
              请确认以下配置信息，然后点击「完成设置」开始使用。
            </p>

            <div className="card" style={{ background: 'rgba(0, 0, 0, 0.2)', marginBottom: '1.5rem' }}>
              <div className="flex flex-between" style={{ padding: '0.75rem 0', borderBottom: '1px solid var(--border)' }}>
                <span className="text-muted">Gateway URL</span>
                <span>{gatewayUrl}</span>
              </div>
              {gatewayToken && (
                <div className="flex flex-between" style={{ padding: '0.75rem 0', borderBottom: '1px solid var(--border)' }}>
                  <span className="text-muted">Gateway Token</span>
                  <span className="text-muted text-sm">已配置</span>
                </div>
              )}
              <div className="flex flex-between" style={{ padding: '0.75rem 0', borderBottom: '1px solid var(--border)' }}>
                <span className="text-muted">访问模式</span>
                <span className="badge">{accessMode}</span>
              </div>
              {accessMode === 'token' && (
                <div className="flex flex-between" style={{ padding: '0.75rem 0' }}>
                  <span className="text-muted">Access Token</span>
                  <span className="text-muted text-sm">{accessToken.slice(0, 8)}...</span>
                </div>
              )}
            </div>

            <div className="flex" style={{ marginTop: '1.5rem' }}>
              <button
                className="btn btn-secondary"
                onClick={() => setStep(2)}
              >
                上一步
              </button>
              <button
                className="btn btn-primary"
                onClick={handleSaveAndComplete}
                disabled={saving}
                style={{ marginLeft: 'auto' }}
              >
                {saving ? '保存中...' : '完成设置'}
              </button>
            </div>
          </div>
        )}

        {/* Progress Indicator */}
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '2rem', gap: '0.5rem' }}>
          {[1, 2, 3].map(i => (
            <div
              key={i}
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: i === step ? 'var(--primary)' : 'var(--border)',
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
