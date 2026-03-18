import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { setupApi, healthApi } from './api';
import Dashboard from './pages/Dashboard';
import Sessions from './pages/Sessions';
import SessionDetail from './pages/SessionDetail';
import TokenMonitor from './pages/TokenMonitor';
import Skills from './pages/Skills';
import SystemPrompt from './pages/SystemPrompt';
import Logs from './pages/Logs';
import Settings from './pages/Settings';
import SetupWizard from './pages/SetupWizard';

function Navigation() {
  const location = useLocation();

  const navItems = [
    { path: '/', label: '仪表盘', icon: '📊' },
    { path: '/sessions', label: '会话', icon: '💬' },
    { path: '/skills', label: 'Skills', icon: '🔧' },
    { path: '/system-prompt', label: 'SystemPrompt', icon: '🧠' },
    { path: '/tokens', label: 'Token', icon: '💰' },
    { path: '/logs', label: '日志', icon: '📝' },
    { path: '/settings', label: '设置', icon: '⚙️' },
  ];

  return (
    <nav className="nav">
      {navItems.map(item => (
        <Link
          key={item.path}
          to={item.path}
          className={`nav-item ${location.pathname === item.path ? 'active' : ''}`}
        >
          <span className="nav-icon">{item.icon}</span>
          <span className="nav-label">{item.label}</span>
        </Link>
      ))}
    </nav>
  );
}

function Layout({ children }) {
  const [health, setHealth] = useState(null);

  useEffect(() => {
    const fetchHealth = async () => {
      try {
        const data = await healthApi.getHealth();
        setHealth(data);
      } catch (error) {
        console.error('Failed to fetch health:', error);
      }
    };

    fetchHealth();
    const interval = setInterval(fetchHealth, 10000);
    return () => clearInterval(interval);
  }, []);

  const gatewayDisconnected = health && !health.openclawConnected;
  const gatewayError = health?.gatewayError;

  return (
    <div className="app">
      {gatewayDisconnected && (
        <div
          className="gateway-error-banner"
          style={{
            background: 'linear-gradient(135deg, #c53030 0%, #9b2c2c 100%)',
            color: '#fff',
            padding: '0.75rem 1.5rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ flex: 1, minWidth: 200 }}>
            <strong>Gateway 连接失败</strong>
            {gatewayError && (
              <span style={{ marginLeft: '0.5rem', opacity: 0.95, fontSize: '0.9em' }}>
                {gatewayError}
              </span>
            )}
          </div>
          <Link
            to="/settings"
            className="btn"
            style={{
              background: 'rgba(255,255,255,0.2)',
              color: '#fff',
              border: '1px solid rgba(255,255,255,0.5)',
              padding: '0.5rem 1rem',
              borderRadius: '0.5rem',
              textDecoration: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            配置并恢复连接 →
          </Link>
        </div>
      )}
      <header className="header">
        <div className="header-left">
          <h1 className="logo">🦞 OpenClaw Monitor</h1>
          {health && (
            <span className={`status-badge ${health.status.toLowerCase()}`}>
              {health.status}
            </span>
          )}
        </div>
        <div className="header-right">
          {health && (
            <span className={`connection-status ${health.openclawConnected ? 'connected' : 'disconnected'}`}>
              {health.openclawConnected ? '●' : '○'} Gateway
            </span>
          )}
        </div>
      </header>
      <div className="main-content">
        <Navigation />
        <main className="content">
          {children}
        </main>
      </div>
    </div>
  );
}

function App() {
  const [isSetup, setIsSetup] = useState(null);

  useEffect(() => {
    const checkSetup = async () => {
      try {
        const data = await setupApi.getStatus();
        setIsSetup(data.isSetup);
      } catch (error) {
        console.error('Failed to check setup:', error);
        setIsSetup(false);
      }
    };
    checkSetup();
  }, []);

  if (isSetup === null) {
    return <div className="loading">加载中...</div>;
  }

  if (!isSetup) {
    return <SetupWizard onComplete={() => setIsSetup(true)} />;
  }

  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/sessions" element={<Sessions />} />
          <Route path="/sessions/:id" element={<SessionDetail />} />
          <Route path="/skills" element={<Skills />} />
          <Route path="/system-prompt" element={<SystemPrompt />} />
          <Route path="/tokens" element={<TokenMonitor />} />
          <Route path="/logs" element={<Logs />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

export default App;
