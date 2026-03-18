import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Card,
  Progress,
  Segmented,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
  Button,
  message,
  Modal,
} from 'antd';
import { useIntl } from 'react-intl';
import { ArrowDownOutlined, ArrowUpOutlined, StopOutlined } from '@ant-design/icons';
import { sessionsApi } from '../api';

function inferSessionTypeLabel(sessionKey) {
  const key = sessionKey || '';
  const full = key.includes('/') ? key.split('/').pop() || key : key;
  if (full.endsWith(':main') || full === 'main') return 'heartbeat';
  if (full.includes(':cron:')) return 'cron';
  if (full.includes(':wave:')) return 'Wave';
  if (full.includes(':slack:')) return 'Slack';
  if (full.includes(':telegram:')) return 'Telegram';
  if (full.includes(':cron')) return 'cron';
  return 'user';
}

function formatDuration(ms) {
  if (!ms) return '—';
  const sec = Math.floor(ms / 1000);
  const m = Math.floor(sec / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${sec % 60}s`;
  return `${sec}s`;
}

function formatTokensShort(n) {
  if (n == null || typeof n !== 'number') return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}m`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function SortableTitle({ label, active, order, onClick }) {
  return (
    <span
      style={{ cursor: 'pointer', userSelect: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}
      onClick={onClick}
      role="button"
      tabIndex={0}
    >
      <span>{label}</span>
      {active ? (order === 'desc' ? <ArrowDownOutlined style={{ fontSize: 12 }} /> : <ArrowUpOutlined style={{ fontSize: 12 }} />) : null}
    </span>
  );
}

export default function Sessions() {
  const intl = useIntl();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [sortKey, setSortKey] = useState('lastActive');
  const [sortOrder, setSortOrder] = useState('desc'); // asc | desc

  const fetchSessions = async () => {
    try {
      const data = await sessionsApi.list();
      setSessions(Array.isArray(data) ? data : []);
    } catch (e) {
      message.error(e?.message || 'Failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  const onKill = (sessionId) => {
    Modal.confirm({
      title: intl.formatMessage({ id: 'confirm.killSession' }),
      okText: intl.formatMessage({ id: 'common.yes' }),
      cancelText: intl.formatMessage({ id: 'common.cancel' }),
      onOk: async () => {
        try {
          await sessionsApi.kill(sessionId);
          message.success('OK');
          fetchSessions();
        } catch (e) {
          message.error(e?.message || 'Failed');
        }
      },
    });
  };

  const filteredSorted = useMemo(() => {
    const list = sessions.filter((s) => (filter === 'all' ? true : s.status === filter));
    const mul = sortOrder === 'desc' ? -1 : 1;
    const getVal = (s) => {
      switch (sortKey) {
        case 'lastActive':
          return s.lastActive ?? 0;
        case 'duration':
          return s.duration ?? 0;
        case 'totalTokens':
          return s.totalTokens ?? 0;
        case 'utilization': {
          const u = s.tokenUsage;
          if (!u?.limit) return 0;
          return u.utilization ?? (u.limit ? (u.total / u.limit) * 100 : 0);
        }
        case 'status':
          return String(s.status || '').toLowerCase();
        case 'user': {
          const typeLabel = s.typeLabel || inferSessionTypeLabel(s.sessionKey);
          const sys = typeLabel === 'heartbeat' || typeLabel === 'cron';
          return sys ? typeLabel : String(s.user || '').toLowerCase();
        }
        default:
          return 0;
      }
    };

    return [...list].sort((a, b) => {
      const va = getVal(a);
      const vb = getVal(b);
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * mul;
      return String(va).localeCompare(String(vb)) * mul;
    });
  }, [sessions, filter, sortKey, sortOrder]);

  const statusTagColor = (status) => {
    switch (status) {
      case 'active':
        return 'green';
      case 'idle':
        return 'orange';
      case 'completed':
        return 'blue';
      case 'failed':
        return 'red';
      default:
        return 'default';
    }
  };

  const utilizationFor = (s) => {
    const u = s.tokenUsage;
    if (!u?.limit) return null;
    const pct = Math.round(u.utilization ?? (u.limit ? (u.total / u.limit) * 100 : 0));
    return Math.min(100, Math.max(0, pct));
  };

  const utilizationColor = (pct) => {
    if (pct == null) return undefined;
    if (pct >= 90) return 'exception';
    if (pct >= 70) return 'warning';
    return 'normal';
  };

  if (loading) {
    return <Spin style={{ display: 'block', margin: 48 }} />;
  }

  const filterOptions = [
    { value: 'all', label: intl.formatMessage({ id: 'common.all' }) },
    { value: 'active', label: intl.formatMessage({ id: 'sessions.filter.active' }) },
    { value: 'idle', label: intl.formatMessage({ id: 'sessions.filter.idle' }) },
    { value: 'completed', label: intl.formatMessage({ id: 'sessions.filter.completed' }) },
    { value: 'failed', label: intl.formatMessage({ id: 'sessions.filter.failed' }) },
  ];

  const columns = [
    {
      title: (
        <SortableTitle
          label={intl.formatMessage({ id: 'sessions.column.session' })}
          active={sortKey === 'user'}
          order={sortOrder}
          onClick={() => {
            if (sortKey !== 'user') {
              setSortKey('user');
              setSortOrder('asc');
            } else {
              setSortOrder((o) => (o === 'desc' ? 'asc' : 'desc'));
            }
          }}
        />
      ),
      key: 'session',
      render: (_, r) => {
        const typeLabel = r.typeLabel || inferSessionTypeLabel(r.sessionKey);
        const sys = typeLabel === 'heartbeat' || typeLabel === 'cron';
        const code = String(r.sessionKey || r.sessionId || '');
        const short = code.length > 28 ? `${code.slice(0, 14)}…${code.slice(-10)}` : code;
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Tag color={sys ? (typeLabel === 'heartbeat' ? 'green' : 'orange') : 'blue'} style={{ whiteSpace: 'nowrap' }}>
              {typeLabel}
            </Tag>
            <Typography.Text
              code
              style={{
                maxWidth: 280,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={code}
            >
              {short}
            </Typography.Text>
          </div>
        );
      },
    },
    {
      title: (
        <SortableTitle
          label={intl.formatMessage({ id: 'sessions.column.status' })}
          active={sortKey === 'status'}
          order={sortOrder}
          onClick={() => {
            if (sortKey !== 'status') {
              setSortKey('status');
              setSortOrder('asc');
            } else {
              setSortOrder((o) => (o === 'desc' ? 'asc' : 'desc'));
            }
          }}
        />
      ),
      key: 'status',
      render: (_, r) => <Tag color={statusTagColor(r.status)}>{r.status}</Tag>,
    },
    {
      title: (
        <SortableTitle
          label={intl.formatMessage({ id: 'sessions.column.user' })}
          active={sortKey === 'user'}
          order={sortOrder}
          onClick={() => {
            if (sortKey !== 'user') {
              setSortKey('user');
              setSortOrder('asc');
            } else {
              setSortOrder((o) => (o === 'desc' ? 'asc' : 'desc'));
            }
          }}
        />
      ),
      key: 'user',
      render: (_, r) => {
        const typeLabel = r.typeLabel || inferSessionTypeLabel(r.sessionKey);
        const sys = typeLabel === 'heartbeat' || typeLabel === 'cron';
        const v = sys ? typeLabel : r.user || '—';
        return <Typography.Text>{v}</Typography.Text>;
      },
    },
    {
      title: (
        <SortableTitle
          label={intl.formatMessage({ id: 'sessions.column.lastActive' })}
          active={sortKey === 'lastActive'}
          order={sortOrder}
          onClick={() => {
            if (sortKey !== 'lastActive') {
              setSortKey('lastActive');
              setSortOrder('desc');
            } else {
              setSortOrder((o) => (o === 'desc' ? 'asc' : 'desc'));
            }
          }}
        />
      ),
      key: 'lastActive',
      render: (_, r) => (r.lastActive ? new Date(r.lastActive).toLocaleString(intl.locale) : '—'),
      width: 190,
    },
    {
      title: (
        <SortableTitle
          label={intl.formatMessage({ id: 'sessions.column.duration' })}
          active={sortKey === 'duration'}
          order={sortOrder}
          onClick={() => {
            if (sortKey !== 'duration') {
              setSortKey('duration');
              setSortOrder('desc');
            } else {
              setSortOrder((o) => (o === 'desc' ? 'asc' : 'desc'));
            }
          }}
        />
      ),
      key: 'duration',
      render: (_, r) => formatDuration(r.duration),
      width: 130,
    },
    {
      title: (
        <SortableTitle
          label={intl.formatMessage({ id: 'sessions.column.tokens' })}
          active={sortKey === 'totalTokens'}
          order={sortOrder}
          onClick={() => {
            if (sortKey !== 'totalTokens') {
              setSortKey('totalTokens');
              setSortOrder('desc');
            } else {
              setSortOrder((o) => (o === 'desc' ? 'asc' : 'desc'));
            }
          }}
        />
      ),
      key: 'totalTokens',
      render: (_, r) => (r.totalTokens != null ? formatTokensShort(r.totalTokens) : '—'),
      width: 110,
      align: 'right',
    },
    {
      title: (
        <SortableTitle
          label={intl.formatMessage({ id: 'sessions.column.util' })}
          active={sortKey === 'utilization'}
          order={sortOrder}
          onClick={() => {
            if (sortKey !== 'utilization') {
              setSortKey('utilization');
              setSortOrder('desc');
            } else {
              setSortOrder((o) => (o === 'desc' ? 'asc' : 'desc'));
            }
          }}
        />
      ),
      key: 'util',
      render: (_, r) => {
        const pct = utilizationFor(r);
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Progress percent={pct ?? 0} size="small" status={utilizationColor(pct)} showInfo={false} style={{ width: 120 }} />
            <Typography.Text style={{ minWidth: 44, textAlign: 'right' }}>{pct == null ? '—' : `${pct}%`}</Typography.Text>
          </div>
        );
      },
      width: 260,
    },
    {
      title: intl.formatMessage({ id: 'sessions.column.actions' }),
      key: 'actions',
      render: (_, r) => (
        <Space>
          <Link to={`/sessions/${encodeURIComponent(r.sessionId)}`}>
            <Button size="small">{intl.formatMessage({ id: 'common.detail' })}</Button>
          </Link>
          {r.status === 'active' && (
            <Button size="small" danger icon={<StopOutlined />} onClick={() => onKill(r.sessionId)}>
              {intl.formatMessage({ id: 'common.kill' })}
            </Button>
          )}
        </Space>
      ),
      fixed: 'right',
      width: 220,
    },
  ];

  return (
    <Card
      bordered={false}
      style={{
        borderRadius: 16,
        background: 'var(--ant-color-bg-container)',
      }}
      bodyStyle={{ padding: 16 }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          {intl.formatMessage({ id: 'sessions.title' })}
        </Typography.Title>
        <Segmented
          options={filterOptions.map((o) => ({ label: o.label, value: o.value }))}
          value={filter}
          onChange={setFilter}
        />
      </div>
      <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 8 }}>
        {intl.formatMessage({ id: 'sessions.sortHint' })}
      </Typography.Text>
      <Table
        style={{ marginTop: 12 }}
        rowKey="sessionId"
        dataSource={filteredSorted}
        columns={columns}
        locale={{ emptyText: intl.formatMessage({ id: 'sessions.empty' }) }}
        pagination={{ pageSize: 20, showSizeChanger: false }}
        scroll={{ x: 1300, y: 640 }}
      />
    </Card>
  );
}
