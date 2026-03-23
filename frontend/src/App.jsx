import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Spin, message } from 'antd';
import { useIntl } from 'react-intl';
import { setupApi } from './api';
import BasicLayout from './layouts/BasicLayout';
import SetupWizard from './pages/SetupWizard';
import Dashboard from './pages/Dashboard';
import Sessions from './pages/Sessions';
import SessionDetail from './pages/SessionDetail';
import SessionArchiveList from './pages/SessionArchiveList';
import TokenMonitor from './pages/TokenMonitor';
import Skills from './pages/Skills';
import SystemPrompt from './pages/SystemPrompt';
import Logs from './pages/Logs';
import Settings from './pages/Settings';
import Pricing from './pages/Pricing';

function AppInner() {
  const intl = useIntl();
  const [isSetup, setIsSetup] = useState(null);

  useEffect(() => {
    const check = async () => {
      try {
        const data = await setupApi.getStatus();
        setIsSetup(data.isSetup);
      } catch {
        message.error(intl.formatMessage({ id: 'app.initStatusError' }));
        setIsSetup(false);
      }
    };
    check();
  }, []);

  if (isSetup === null) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <Spin size="large" tip={intl.formatMessage({ id: 'app.loading' })} />
      </div>
    );
  }

  if (!isSetup) {
    return <SetupWizard onComplete={() => setIsSetup(true)} />;
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<BasicLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/sessions" element={<Sessions />} />
          <Route path="/sessions/:id/archives" element={<SessionArchiveList />} />
          <Route path="/sessions/:id" element={<SessionDetail />} />
          <Route path="/skills" element={<Skills />} />
          <Route path="/system-prompt" element={<SystemPrompt />} />
          <Route path="/tokens" element={<TokenMonitor />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/logs" element={<Logs />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default function App() {
  return <AppInner />;
}
