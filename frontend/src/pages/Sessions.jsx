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
  Tooltip,
  message,
} from 'antd';
import { useIntl } from 'react-intl';
import { ArrowDownOutlined, ArrowUpOutlined, HistoryOutlined } from '@ant-design/icons';
import { sessionsApi, metricsApi } from '../api';
import {
  inferSessionTypeLabel,
  inferSessionChatKind,
  formatSessionParticipantDisplay,
} from '../utils/session-user';
import { sessionTokenUtilizationPercent } from '../utils/session-tokens';

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

function formatBytes(n) {
  if (n == null || typeof n !== 'number' || n < 0) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
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
  const [archiveCountMap, setArchiveCountMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [sortKey, setSortKey] = useState('lastActive');
  const [sortOrder, setSortOrder] = useState('desc'); // asc | desc
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);

  const fetchSessions = async (nextPage = page, nextFilter = filter) => {
    setLoading(true);
    try {
      const [sessionsResult, archiveResult] = await Promise.allSettled([
        sessionsApi.list({ page: nextPage, pageSize, filter: nextFilter }),
        metricsApi.getArchiveCountBySessionKey(),
      ]);
      const data = sessionsResult.status === 'fulfilled' ? sessionsResult.value : { items: [], total: 0 };
      const archiveMap = archiveResult.status === 'fulfilled' && archiveResult.value && typeof archiveResult.value === 'object'
        ? archiveResult.value
        : {};
      const items = Array.isArray(data?.items) ? data.items : (Array.isArray(data) ? data : []);
      setSessions(items);
      setTotal(Number(data?.total || items.length || 0));
      setArchiveCountMap(archiveMap);
    } catch (e) {
      message.error(e?.message || 'Failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions(page, filter);
  }, [page, filter]);

  const filteredSorted = useMemo(() => {
    const list = sessions;
    const mul = sortOrder === 'desc' ? -1 : 1;
    const getVal = (s) => {
      switch (sortKey) {
        case 'lastActive':
          return s.lastActive ?? 0;
        case 'duration':
          return s.duration ?? 0;
        case 'totalTokens':
          return s.totalTokens ?? 0;
        case 'messageCount':
          return s.messageCount ?? 0;
        case 'transcriptFileSizeBytes':
          return s.transcriptFileSizeBytes ?? 0;
        case 'utilization': {
          const pct = sessionTokenUtilizationPercent(s);
          return pct ?? -1;
        }
        case 'status':
          return String(s.status || '').toLowerCase();
        case 'user': {
          return String(formatSessionParticipantDisplay(s).toLowerCase());
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

  const utilizationFor = (s) => sessionTokenUtilizationPercent(s);

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
      width: 180,
      onHeaderCell: () => ({ style: { maxWidth: 180 } }),
      onCell: () => ({ style: { maxWidth: 180, overflow: 'hidden' } }),
      render: (_, r) => {
        const typeLabel = r.typeLabel || inferSessionTypeLabel(r.sessionKey, r.sessionId);
        const sys = typeLabel === 'heartbeat' || typeLabel === 'cron' || typeLabel === 'boot';
        const chatKind = sys ? null : inferSessionChatKind(r.sessionKey, r.sessionId);
        const code = String(r.sessionKey || r.sessionId || '');
        const chatKindLabel =
          chatKind === 'group'
            ? intl.formatMessage({ id: 'sessions.chatKind.group' })
            : chatKind === 'channel'
              ? intl.formatMessage({ id: 'sessions.chatKind.channel' })
              : chatKind === 'direct'
                ? intl.formatMessage({ id: 'sessions.chatKind.direct' })
                : null;
        const chatKindColor =
          chatKind === 'group' || chatKind === 'channel' ? 'purple' : chatKind === 'direct' ? 'geekblue' : undefined;
        return (
          <Link
            to={`/sessions/${encodeURIComponent(r.sessionId)}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              minWidth: 0,
              width: '100%',
              textDecoration: 'none',
              color: 'inherit',
            }}
          >
            <Space size={4} wrap style={{ flexShrink: 0, lineHeight: 1.2 }}>
              <Tag
                color={sys ? (typeLabel === 'heartbeat' ? 'green' : 'orange') : 'blue'}
                style={{ whiteSpace: 'nowrap', margin: 0 }}
              >
                {typeLabel}
              </Tag>
              {chatKindLabel && (
                <Tooltip title={intl.formatMessage({ id: 'sessions.chatKind.tooltip' })}>
                  <Tag color={chatKindColor} style={{ margin: 0, fontSize: 12 }}>
                    {chatKindLabel}
                  </Tag>
                </Tooltip>
              )}
            </Space>
            <Tooltip title={code}>
              <Typography.Text
                code
                ellipsis
                style={{
                  flex: '1 1 0',
                  minWidth: 0,
                  maxWidth: '100%',
                  fontSize: 12,
                  margin: 0,
                }}
              >
                {code}
              </Typography.Text>
            </Tooltip>
          </Link>
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
      width: 120,
      render: (_, r) => <Tag color={statusTagColor(r.status)}>{r.status}</Tag>,
    },
    {
      title: (
        <Tooltip title={intl.formatMessage({ id: 'sessions.column.participantTooltip' })}>
          <span style={{ cursor: 'help' }}>
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
          </span>
        </Tooltip>
      ),
      key: 'user',
      width: 170,
      render: (_, r) => {
        const v = formatSessionParticipantDisplay(r);
        return (
          <Link
            to={`/sessions/${encodeURIComponent(r.sessionId)}`}
            className="session-user-link"
            title={r.sessionKey || r.sessionId}
          >
            <Typography.Text
              style={{
                display: 'inline-block',
                maxWidth: 140,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                verticalAlign: 'middle',
              }}
            >
              {v}
            </Typography.Text>
          </Link>
        );
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
          label={intl.formatMessage({ id: 'sessions.column.messages' })}
          active={sortKey === 'messageCount'}
          order={sortOrder}
          onClick={() => {
            if (sortKey !== 'messageCount') {
              setSortKey('messageCount');
              setSortOrder('desc');
            } else {
              setSortOrder((o) => (o === 'desc' ? 'asc' : 'desc'));
            }
          }}
        />
      ),
      key: 'messageCount',
      width: 88,
      align: 'right',
      render: (_, r) => (r.messageCount != null ? r.messageCount : '—'),
    },
    {
      title: (
        <SortableTitle
          label={intl.formatMessage({ id: 'sessions.column.fileSize' })}
          active={sortKey === 'transcriptFileSizeBytes'}
          order={sortOrder}
          onClick={() => {
            if (sortKey !== 'transcriptFileSizeBytes') {
              setSortKey('transcriptFileSizeBytes');
              setSortOrder('desc');
            } else {
              setSortOrder((o) => (o === 'desc' ? 'asc' : 'desc'));
            }
          }}
        />
      ),
      key: 'transcriptFileSizeBytes',
      width: 100,
      align: 'right',
      render: (_, r) => formatBytes(r.transcriptFileSizeBytes),
    },
    {
      title: intl.formatMessage({ id: 'sessions.column.archived' }) || '归档',
      key: 'archived',
      width: 90,
      render: (_, r) => {
        const count = archiveCountMap[r.sessionKey] ?? 0;
        if (count === 0) return '—';
        return (
          <Tooltip title="查看 token 消耗">
            <Link to="/tokens" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <HistoryOutlined />
              <span>{count} 次</span>
            </Link>
          </Tooltip>
        );
      },
    },
    {
      title: intl.formatMessage({ id: 'sessions.column.actions' }) || '操作',
      key: 'actions',
      width: 140,
      render: (_, r) => {
        const sid = r?.sessionId ?? r?.sessionKey ?? '';
        if (!sid) return '—';
        return (
          <Space size="small">
            <Link to={`/sessions/${encodeURIComponent(sid)}`}>
              {intl.formatMessage({ id: 'common.detail' })}
            </Link>
            <Link to={`/sessions/${encodeURIComponent(sid)}#toolCalls`}>
              {intl.formatMessage({ id: 'session.tools' })}
            </Link>
          </Space>
        );
      },
    },
    {
      title: (
        <Tooltip title={intl.formatMessage({ id: 'sessions.column.tokensUtilHint' })}>
          <span style={{ cursor: 'help' }}>
            <SortableTitle
              label={`${intl.formatMessage({ id: 'sessions.column.tokens' })} / ${intl.formatMessage({ id: 'sessions.column.util' })}`}
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
          </span>
        </Tooltip>
      ),
      key: 'tokenUtil',
      width: 160,
      align: 'right',
      onHeaderCell: () => ({ style: { whiteSpace: 'nowrap' } }),
      onCell: () => ({ style: { minWidth: 160, verticalAlign: 'middle' } }),
      render: (_, r) => {
        const pct = utilizationFor(r);
        const unreliable = r.tokenUsage?.contextUtilizationReliable === false;
        return (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              alignItems: 'flex-end',
              minWidth: 0,
              width: '100%',
            }}
          >
            <Tooltip
              title={
                unreliable
                  ? intl.formatMessage({ id: 'sessions.tokensTotalUnreliableHint' })
                  : undefined
              }
            >
              <Typography.Text
                style={{ textAlign: 'right', whiteSpace: 'nowrap' }}
                type={unreliable ? 'secondary' : undefined}
              >
                {r.totalTokens != null ? formatTokensShort(r.totalTokens) : '—'}
                {unreliable ? ' *' : ''}
              </Typography.Text>
            </Tooltip>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <Tooltip
                title={
                  unreliable
                    ? intl.formatMessage({ id: 'sessions.utilUnreliableHint' })
                    : undefined
                }
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <Progress
                    percent={pct ?? 0}
                    size="small"
                    status={utilizationColor(pct)}
                    showInfo={false}
                    style={{ width: 76, flexShrink: 0, opacity: unreliable ? 0.45 : 1 }}
                  />
                  <Typography.Text
                    style={{ minWidth: 34, textAlign: 'right', whiteSpace: 'nowrap' }}
                    type={unreliable ? 'secondary' : undefined}
                  >
                    {pct == null ? '—' : `${pct}%`}
                  </Typography.Text>
                </span>
              </Tooltip>
            </div>
          </div>
        );
      },
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
          onChange={(v) => {
            setPage(1);
            setFilter(v);
          }}
        />
      </div>
      <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 8 }}>
        {intl.formatMessage({ id: 'sessions.sortHint' })}
      </Typography.Text>
      <Table
        style={{ marginTop: 12 }}
        tableLayout="fixed"
        scroll={{ x: 'max-content' }}
        rowKey="sessionId"
        dataSource={filteredSorted}
        columns={columns}
        locale={{ emptyText: intl.formatMessage({ id: 'sessions.empty' }) }}
        size="small"
        pagination={{
          pageSize,
          showSizeChanger: false,
          current: page,
          total,
          onChange: (p) => setPage(p),
        }}
      />
    </Card>
  );
}
