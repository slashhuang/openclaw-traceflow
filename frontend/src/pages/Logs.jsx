import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { Card, Select, Button, Space, Typography, Spin, theme, message, Input, Row, Col, Divider } from 'antd';
import { useIntl } from 'react-intl';
import { logsApi } from '../api';
import SectionScopeHint from '../components/SectionScopeHint';

const { Search } = Input;

// 日志面板组件
function LogPanel({ title, logs, loading, filterLevel, searchKeyword, onFilterChange, onSearch, onRefresh, autoRefresh, lastRefreshTime, socketConnected, color }) {
  const intl = useIntl();
  const { token } = theme.useToken();
  const logsEndRef = useRef(null);
  const userScrolledRef = useRef(false);

  const filtered = logs.filter((l) => {
    const levelMatch = filterLevel === 'all' ? true : l.level === filterLevel;
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

  useEffect(() => {
    if (logsEndRef.current && !userScrolledRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'auto' });
    }
  }, [logs]);

  return (
    <Card
      title={title}
      styles={{ body: { padding: 12 } }}
      size="small"
    >
      <div
        style={{
          maxHeight: '65vh',
          overflow: 'auto',
          fontFamily: 'monospace',
          fontSize: 11,
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
        {loading ? (
          <Spin />
        ) : filtered.length === 0 ? (
          <Typography.Text type="secondary">暂无日志</Typography.Text>
        ) : (
          filtered.map((log, i) => (
            <div key={i} style={{ marginBottom: 4, wordBreak: 'break-all', borderBottom: '1px solid ' + token.colorSplit, paddingBottom: 2 }}>
              <Typography.Text type="secondary" style={{ fontSize: 10 }}>
                {new Date(log.timestamp).toLocaleTimeString(intl.locale, { hour12: false })}
              </Typography.Text>{' '}
              <span style={{ color: levelColor(log.level), fontWeight: 600, fontSize: 10 }}>
                [{String(log.level).toUpperCase()}]
              </span>{' '}
              <span style={{ color: token.colorText }}>{fmt(log.content)}</span>
            </div>
          ))
        )}
        <div ref={logsEndRef} />
      </div>
      <Space style={{ marginTop: 8 }} wrap>
        <Typography.Text type="secondary" style={{ fontSize: 11 }}>
          {filtered.length} / {logs.length} 条
        </Typography.Text>
      </Space>
    </Card>
  );
}

export default function Logs() {
  const intl = useIntl();
  const { token } = theme.useToken();
  
  // Gateway 日志状态
  const [gatewayLogs, setGatewayLogs] = useState([]);
  const [gatewayLoading, setGatewayLoading] = useState(true);
  
  // TraceFlow 日志状态
  const [traceflowLogs, setTraceflowLogs] = useState([]);
  const [traceflowLoading, setTraceflowLoading] = useState(true);
  
  // 共享状态
  const [filterLevel, setFilterLevel] = useState('all');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [socketConnected, setSocketConnected] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefreshTime, setLastRefreshTime] = useState(null);
  
  const socketRef = useRef(null);
  const refreshTimerRef = useRef(null);

  // 加载 Gateway 日志
  const loadGatewayLogs = async (showLoading = false) => {
    try {
      if (showLoading) setGatewayLoading(true);
      const data = await logsApi.getGatewayLogs(200);
      if (!Array.isArray(data)) {
        return;
      }
      // 首次加载信任服务端；后台定时刷新若短暂失败，避免用空数组冲掉 Socket 已累积的行
      setGatewayLogs((prev) => (data.length > 0 || showLoading ? data : prev));
      setLastRefreshTime(new Date());
    } catch (e) {
      console.error('Failed to load gateway logs:', e);
    } finally {
      if (showLoading) setGatewayLoading(false);
    }
  };

  // 加载 TraceFlow 日志
  const loadTraceflowLogs = async (showLoading = false) => {
    try {
      if (showLoading) setTraceflowLoading(true);
      const data = await logsApi.getTraceflowLogs(200);
      setTraceflowLogs(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Failed to load traceflow logs:', e);
    } finally {
      if (showLoading) setTraceflowLoading(false);
    }
  };

  // 加载所有日志
  const loadAllLogs = async (showLoading = false) => {
    await Promise.all([
      loadGatewayLogs(showLoading),
      loadTraceflowLogs(showLoading),
    ]);
  };

  useEffect(() => {
    loadAllLogs(true);

    // WebSocket 连接（用于 Gateway 日志实时推送）
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
      // 根据 source 字段区分日志来源
      if (log.source === 'traceflow') {
        setTraceflowLogs((prev) => [...prev, log].slice(-500));
      } else {
        setGatewayLogs((prev) => [...prev, log].slice(-500));
      }
    });

    // 10 秒自动刷新
    refreshTimerRef.current = setInterval(() => {
      if (autoRefresh) {
        loadAllLogs(false);
      }
    }, 10000);

    return () => {
      socketRef.current?.disconnect();
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
      }
    };
  }, [autoRefresh]);

  const handleSearch = (value) => {
    setSearchKeyword(value);
  };

  const handleRefreshToggle = () => {
    setAutoRefresh(!autoRefresh);
    message.success(autoRefresh ? '自动刷新已暂停' : '自动刷新已恢复');
  };

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
            danger
            onClick={() => {
              setGatewayLogs([]);
              setTraceflowLogs([]);
              message.success('日志已清空');
            }}
          >
            {intl.formatMessage({ id: 'logs.clear' })}
          </Button>
        </Space>
      </div>

      <Row gutter={16}>
        {/* 左侧：Gateway 日志 */}
        <Col span={12}>
          <LogPanel
            title={<span style={{ color: token.colorPrimary }}>🔵 Gateway 日志</span>}
            logs={gatewayLogs}
            loading={gatewayLoading}
            filterLevel={filterLevel}
            searchKeyword={searchKeyword}
            onFilterChange={setFilterLevel}
            onSearch={handleSearch}
            onRefresh={() => loadGatewayLogs(true)}
            autoRefresh={autoRefresh}
            lastRefreshTime={lastRefreshTime}
            socketConnected={socketConnected}
            color={token.colorPrimary}
          />
        </Col>

        {/* 右侧：TraceFlow 日志 */}
        <Col span={12}>
          <LogPanel
            title={<span style={{ color: token.colorSuccess }}>🟢 TraceFlow 日志</span>}
            logs={traceflowLogs}
            loading={traceflowLoading}
            filterLevel={filterLevel}
            searchKeyword={searchKeyword}
            onFilterChange={setFilterLevel}
            onSearch={handleSearch}
            onRefresh={() => loadTraceflowLogs(true)}
            autoRefresh={autoRefresh}
            lastRefreshTime={lastRefreshTime}
            socketConnected={socketConnected}
            color={token.colorSuccess}
          />
        </Col>
      </Row>
    </div>
  );
}
