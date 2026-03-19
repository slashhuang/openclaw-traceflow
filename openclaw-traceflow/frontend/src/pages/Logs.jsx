import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { Card, Select, Button, Space, Typography, Spin, theme } from 'antd';
import { useIntl } from 'react-intl';
import { logsApi } from '../api';

export default function Logs() {
  const intl = useIntl();
  const { token } = theme.useToken();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterLevel, setFilterLevel] = useState('all');
  const [socketConnected, setSocketConnected] = useState(false);
  const logsEndRef = useRef(null);
  const socketRef = useRef(null);
  const userScrolledRef = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const data = await logsApi.getRecent(200);
        setLogs(Array.isArray(data) ? data : []);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();

    socketRef.current = io(window.location.origin, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
    });
    socketRef.current.on('connect', () => {
      setSocketConnected(true);
      socketRef.current.emit('logs:subscribe');
    });
    socketRef.current.on('disconnect', () => setSocketConnected(false));
    socketRef.current.on('logs:new', (log) => {
      setLogs((prev) => [...prev, log].slice(-500));
    });
    return () => socketRef.current?.disconnect();
  }, []);

  useEffect(() => {
    if (logsEndRef.current && !userScrolledRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'auto' });
    }
  }, [logs]);

  const filtered = logs.filter((l) => (filterLevel === 'all' ? true : l.level === filterLevel));

  const levelColor = (level) => {
    switch (level) {
      case 'error':
        return token.colorError;
      case 'warn':
        return token.colorWarning;
      case 'debug':
        return token.colorInfo;
      default:
        return token.colorSuccess;
    }
  };

  const fmt = (c) => (typeof c === 'string' ? c : JSON.stringify(c, null, 2));

  if (loading) {
    return <Spin style={{ display: 'block', margin: 48 }} />;
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>{intl.formatMessage({ id: 'logs.title' })}</Typography.Title>
        <Space wrap>
          <Typography.Text type={socketConnected ? 'success' : 'secondary'}>
            {socketConnected ? intl.formatMessage({ id: 'logs.connected' }) : intl.formatMessage({ id: 'logs.disconnected' })}
          </Typography.Text>
          <Select
            style={{ width: 120 }}
            value={filterLevel}
            onChange={setFilterLevel}
            options={[
              { value: 'all', label: intl.formatMessage({ id: 'common.all' }) },
              { value: 'info', label: 'info' },
              { value: 'warn', label: 'warn' },
              { value: 'error', label: 'error' },
              { value: 'debug', label: 'debug' },
            ]}
          />
          <Button
            onClick={() => {
              userScrolledRef.current = false;
              logsEndRef.current?.scrollIntoView({ behavior: 'auto' });
            }}
          >
            {intl.formatMessage({ id: 'logs.scrollBottom' })}
          </Button>
          <Button danger onClick={() => setLogs([])}>{intl.formatMessage({ id: 'logs.clear' })}</Button>
        </Space>
      </div>
      <Card styles={{ body: { padding: 12 } }}>
        <div
          style={{
            maxHeight: '70vh',
            overflow: 'auto',
            fontFamily: 'monospace',
            fontSize: 12,
            background: token.colorFillQuaternary,
            padding: 8,
            borderRadius: token.borderRadius,
          }}
          onScroll={(e) => {
            const el = e.target;
            const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
            userScrolledRef.current = !bottom;
          }}
        >
          {filtered.map((log, i) => (
            <div key={i} style={{ marginBottom: 4, wordBreak: 'break-all' }}>
              <Typography.Text type="secondary">{new Date(log.timestamp).toLocaleTimeString(intl.locale, { hour12: false })}</Typography.Text>{' '}
              <span style={{ color: levelColor(log.level), fontWeight: 600 }}>[{String(log.level).toUpperCase()}]</span>{' '}
              <span style={{ color: token.colorText }}>{fmt(log.content)}</span>
            </div>
          ))}
          <div ref={logsEndRef} />
        </div>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {filtered.length} / {logs.length}
        </Typography.Text>
      </Card>
    </div>
  );
}
