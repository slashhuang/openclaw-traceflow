import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { Card, Select, Button, Space, Typography, Spin, theme, message, Input } from 'antd';
import { useIntl } from 'react-intl';
import { logsApi } from '../api';
import SectionScopeHint from '../components/SectionScopeHint';

const { Search } = Input;

export default function Logs() {
  const intl = useIntl();
  const { token } = theme.useToken();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterLevel, setFilterLevel] = useState('all');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [socketConnected, setSocketConnected] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefreshTime, setLastRefreshTime] = useState(null);
  const logsEndRef = useRef(null);
  const socketRef = useRef(null);
  const userScrolledRef = useRef(false);
  const refreshTimerRef = useRef(null);

  // 加载日志
  const loadLogs = async (showLoading = false) => {
    try {
      if (showLoading) setLoading(true);
      const data = await logsApi.getRecent(200);
      setLogs(Array.isArray(data) ? data : []);
      setLastRefreshTime(new Date());
    } catch (e) {
      console.error(e);
      if (showLoading) {
        message.error(e?.message || '日志加载失败');
      }
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs(true);

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

    // 10 秒自动刷新
    refreshTimerRef.current = setInterval(() => {
      if (autoRefresh) {
        loadLogs(false);
      }
    }, 10000);

    return () => {
      socketRef.current?.disconnect();
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
      }
    };
  }, [autoRefresh]);

  useEffect(() => {
    if (logsEndRef.current && !userScrolledRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'auto' });
    }
  }, [logs]);

  const filtered = logs.filter((l) => {
    // 级别过滤
    const levelMatch = filterLevel === 'all' ? true : l.level === filterLevel;
    // 搜索过滤
    const searchMatch = !searchKeyword
      ? true
      : l.content.toLowerCase().includes(searchKeyword.toLowerCase()) ||
        l.timestamp.toLowerCase().includes(searchKeyword.toLowerCase());
    return levelMatch && searchMatch;
  });

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

  const handleSearch = (value) => {
    setSearchKeyword(value);
  };

  const handleRefreshToggle = () => {
    setAutoRefresh(!autoRefresh);
    message.success(autoRefresh ? '自动刷新已暂停' : '自动刷新已恢复');
  };

  if (loading) {
    return <Spin style={{ display: 'block', margin: 48 }} />;
  }

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Typography.Title level={4} style={{ margin: 0 }}>
            {intl.formatMessage({ id: 'logs.title' })}
          </Typography.Title>
          <SectionScopeHint intl={intl} messageId="logs.pageScopeDesc" />
        </div>
        <Space wrap>
          <Typography.Text type={socketConnected ? 'success' : 'secondary'}>
            {socketConnected
              ? intl.formatMessage({ id: 'logs.connected' })
              : intl.formatMessage({ id: 'logs.disconnected' })}
          </Typography.Text>
          {lastRefreshTime && (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              上次刷新：{lastRefreshTime.toLocaleTimeString(intl.locale, { hour12: false })}
            </Typography.Text>
          )}
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
          <Search
            placeholder="搜索日志..."
            style={{ width: 200 }}
            onSearch={handleSearch}
            allowClear
          />
          <Button onClick={handleRefreshToggle} type={autoRefresh ? 'primary' : 'default'}>
            {autoRefresh ? '⏸️ 暂停刷新' : '▶️ 恢复刷新'}
          </Button>
          <Button
            onClick={() => {
              userScrolledRef.current = false;
              logsEndRef.current?.scrollIntoView({ behavior: 'auto' });
            }}
          >
            {intl.formatMessage({ id: 'logs.scrollBottom' })}
          </Button>
          <Button
            danger
            onClick={() => {
              setLogs([]);
              message.success('日志已清空');
            }}
          >
            {intl.formatMessage({ id: 'logs.clear' })}
          </Button>
        </Space>
      </div>
      <Card
        styles={{ body: { padding: 12 } }}
        extra={<SectionScopeHint intl={intl} messageId="logs.cardScopeDesc" />}
      >
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
              <Typography.Text type="secondary">
                {new Date(log.timestamp).toLocaleTimeString(intl.locale, { hour12: false })}
              </Typography.Text>{' '}
              <span style={{ color: levelColor(log.level), fontWeight: 600 }}>
                [{String(log.level).toUpperCase()}]
              </span>{' '}
              <span style={{ color: token.colorText }}>{fmt(log.content)}</span>
            </div>
          ))}
          <div ref={logsEndRef} />
        </div>
        <Space style={{ marginTop: 8 }} wrap>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            显示：{filtered.length} / {logs.length} 条
          </Typography.Text>
          {searchKeyword && (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              搜索关键词：{searchKeyword}
            </Typography.Text>
          )}
        </Space>
      </Card>
    </div>
  );
}
