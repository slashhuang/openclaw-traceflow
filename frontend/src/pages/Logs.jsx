import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Select, Button, Space, Typography, Spin, theme, message, Input, Row, Col } from 'antd';
import { useIntl } from 'react-intl';
import { logsApi } from '../api';

const { Search } = Input;

// 日志面板组件
function LogPanel({ title, logs, loading, filterLevel, searchKeyword, onFilterChange, onSearch, onRefresh, autoRefresh, lastRefreshTime, color }) {
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
  const navigate = useNavigate();
  const { token } = theme.useToken();

  // TraceFlow 日志状态
  const [traceflowLogs, setTraceflowLogs] = useState([]);
  const [traceflowLoading, setTraceflowLoading] = useState(true);

  // 共享状态
  const [filterLevel, setFilterLevel] = useState('all');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefreshTime, setLastRefreshTime] = useState(null);

  const refreshTimerRef = useRef(null);

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

  useEffect(() => {
    loadTraceflowLogs(true);

    refreshTimerRef.current = setInterval(() => {
      if (autoRefresh) {
        loadTraceflowLogs(false);
      }
    }, 10000);

    return () => {
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
        </div>
        <Space wrap>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            自动刷新：{autoRefresh ? '开启' : '关闭'}
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
              setTraceflowLogs([]);
              message.success('日志已清空');
            }}
          >
            {intl.formatMessage({ id: 'logs.clear' })}
          </Button>
        </Space>
      </div>

      <Row gutter={16}>
        {/* TraceFlow 日志 */}
        <Col span={24}>
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
            color={token.colorSuccess}
          />
        </Col>
      </Row>
    </div>
  );
}
