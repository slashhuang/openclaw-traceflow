import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Card,
  Col,
  Progress,
  Row,
  Segmented,
  Space,
  Statistic,
  Table,
  Alert,
  Tag,
  Typography,
  Tooltip,
  message,
  Button,
  theme,
  Input,
  Select,
} from 'antd';
import { useIntl } from 'react-intl';
import { ArrowDownOutlined, ArrowUpOutlined } from '@ant-design/icons';
import { sessionsApi } from '../api';
import {
  inferSessionTypeLabel,
  inferSessionChatKind,
  formatSessionParticipantDisplay,
  formatSessionListMessageCount,
} from '../utils/session-user';
import { sessionTokenUtilizationPercent } from '../utils/session-tokens';
import { sessionStatusLabel } from '../i18n/sessionStatusLabel';
import TokenMetricHint from '../components/TokenMetricHint';
import SectionScopeHint from '../components/SectionScopeHint';

/** 与后端 inferSessionTypeLabel 及归档「归档」一致，供列筛选 value 对齐 */
const SESSION_TYPE_LABEL_FILTERS = [
  '主会话',
  'cron',
  'boot',
  'Wave 用户',
  'Slack',
  'Telegram',
  'Discord',
  '飞书',
  '用户',
  '归档',
];

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
      style={{
        cursor: 'pointer',
        userSelect: 'none',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
      }}
      onClick={onClick}
      role="button"
      tabIndex={0}
    >
      <span>{label}</span>
      {active ? (
        order === 'desc' ? (
          <ArrowDownOutlined style={{ fontSize: 12 }} />
        ) : (
          <ArrowUpOutlined style={{ fontSize: 12 }} />
        )
      ) : null}
    </span>
  );
}

export default function Sessions() {
  const intl = useIntl();
  const { token } = theme.useToken();
  const [searchParams, setSearchParams] = useSearchParams();
  const agentIdFromUrl = searchParams.get('agentId');
  const hasAgentFilter = Boolean(agentIdFromUrl?.trim());
  /** PRD §3.2：与仪表盘同源的按 agent 概览 */
  const [agentOverview, setAgentOverview] = useState([]);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [sortKey, setSortKey] = useState('lastActive');
  const [sortOrder, setSortOrder] = useState('desc'); // asc | desc
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);
  /** 表头筛选（服务端，与 GET /api/sessions 查询参数对齐，PRD §3.2.4） */
  const [colStatuses, setColStatuses] = useState([]);
  const [colTypeLabels, setColTypeLabels] = useState([]);
  const [colChatKinds, setColChatKinds] = useState([]);
  const [searchInput, setSearchInput] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');

  useEffect(() => {
    const t = setTimeout(() => {
      const q = searchInput.trim();
      setDebouncedQ(q);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    setSearchInput('');
    setDebouncedQ('');
  }, [agentIdFromUrl]);

  const fetchSessions = async (nextPage = page, nextFilter = filter) => {
    setLoading(true);
    try {
      const params = {
        page: nextPage,
        pageSize,
        filter: nextFilter,
        sortBy: sortKey,
        sortOrder,
      };
      if (agentIdFromUrl?.trim()) {
        params.agentId = agentIdFromUrl.trim();
      }
      if (colStatuses.length) {
        params.statuses = colStatuses.join(',');
      }
      if (colTypeLabels.length) {
        params.typeLabels = colTypeLabels.join(',');
      }
      if (colChatKinds.length) {
        params.chatKinds = colChatKinds.join(',');
      }
      if (debouncedQ) {
        params.q = debouncedQ;
      }
      const sessionsResult = await sessionsApi.list(params);
      const data = sessionsResult || { items: [], total: 0 };
      const items = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
      setSessions(items);
      setTotal(Number(data?.total || items.length || 0));
    } catch (e) {
      message.error(e?.message || 'Failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    setOverviewLoading(true);
    sessionsApi
      .getAgentOverview()
      .then((rows) => {
        if (!cancelled) setAgentOverview(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (!cancelled) setAgentOverview([]);
      })
      .finally(() => {
        if (!cancelled) setOverviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    fetchSessions(page, filter);
  }, [
    page,
    filter,
    agentIdFromUrl,
    sortKey,
    sortOrder,
    debouncedQ,
    colStatuses.join('\n'),
    colTypeLabels.join('\n'),
    colChatKinds.join('\n'),
  ]);

  const currentAgentSummary = useMemo(
    () => agentOverview.find((a) => a.agentId === agentIdFromUrl?.trim()),
    [agentOverview, agentIdFromUrl],
  );

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
      case 'archived':
        return 'purple';
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

  const filterOptions = [
    { value: 'all', label: intl.formatMessage({ id: 'common.all' }) },
    { value: 'active', label: intl.formatMessage({ id: 'sessions.filter.active' }) },
    { value: 'idle', label: intl.formatMessage({ id: 'sessions.filter.idle' }) },
    { value: 'archived', label: intl.formatMessage({ id: 'sessions.filter.archived' }) },
    { value: 'stale_index', label: intl.formatMessage({ id: 'sessions.filter.staleIndex' }) },
  ];

  const showAgentColumn = !hasAgentFilter;

  const columns = [
    ...(showAgentColumn
      ? [
          {
            title: (
              <SortableTitle
                label={intl.formatMessage({ id: 'sessions.column.agent' })}
                active={sortKey === 'agentId'}
                order={sortOrder}
                onClick={() => {
                  setPage(1);
                  if (sortKey !== 'agentId') {
                    setSortKey('agentId');
                    setSortOrder('asc');
                  } else {
                    setSortOrder((o) => (o === 'desc' ? 'asc' : 'desc'));
                  }
                }}
              />
            ),
            key: 'agentId',
            width: 100,
            render: (_, r) => (
              <Typography.Text code ellipsis style={{ margin: 0, maxWidth: 96, display: 'block' }}>
                {r.agentId || 'unknown'}
              </Typography.Text>
            ),
          },
        ]
      : []),
    {
      title: (
        <SortableTitle
          label={intl.formatMessage({ id: 'sessions.column.session' })}
          active={sortKey === 'sessionKey'}
          order={sortOrder}
          onClick={() => {
            setPage(1);
            if (sortKey !== 'sessionKey') {
              setSortKey('sessionKey');
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
          chatKind === 'group' || chatKind === 'channel'
            ? 'purple'
            : chatKind === 'direct'
              ? 'geekblue'
              : undefined;
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
              {r.tokenUsageMeta?.totalTokensFresh === false && (
                <Tooltip title={intl.formatMessage({ id: 'sessions.estimatedTokensDisclaimer' })}>
                  <Tag color="volcano" style={{ margin: 0, fontSize: 11 }}>
                    {intl.formatMessage({ id: 'sessions.staleIndexBadge' })}
                  </Tag>
                </Tooltip>
              )}
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
      title: intl.formatMessage({ id: 'sessions.column.type' }),
      key: 'typeLabel',
      width: 92,
      filters: SESSION_TYPE_LABEL_FILTERS.map((v) => ({ text: v, value: v })),
      filteredValue: colTypeLabels.length ? colTypeLabels : null,
      filterMultiple: true,
      onFilter: () => true,
      render: (_, r) => (
        <Tag style={{ margin: 0 }}>
          {r.typeLabel || inferSessionTypeLabel(r.sessionKey, r.sessionId)}
        </Tag>
      ),
    },
    {
      title: intl.formatMessage({ id: 'sessions.column.chatKind' }),
      key: 'chatKind',
      width: 88,
      filters: [
        { text: intl.formatMessage({ id: 'sessions.chatKind.group' }), value: 'group' },
        { text: intl.formatMessage({ id: 'sessions.chatKind.channel' }), value: 'channel' },
        { text: intl.formatMessage({ id: 'sessions.chatKind.direct' }), value: 'direct' },
        { text: intl.formatMessage({ id: 'sessions.chatKind.filterNone' }), value: '_none' },
      ],
      filteredValue: colChatKinds.length ? colChatKinds : null,
      filterMultiple: true,
      onFilter: () => true,
      render: (_, r) => {
        const kind = r.chatKind || inferSessionChatKind(r.sessionKey, r.sessionId);
        if (!kind) return '—';
        const label =
          kind === 'group'
            ? intl.formatMessage({ id: 'sessions.chatKind.group' })
            : kind === 'channel'
              ? intl.formatMessage({ id: 'sessions.chatKind.channel' })
              : intl.formatMessage({ id: 'sessions.chatKind.direct' });
        const color =
          kind === 'group' || kind === 'channel' ? 'purple' : 'geekblue';
        return (
          <Tag color={color} style={{ margin: 0 }}>
            {label}
          </Tag>
        );
      },
    },
    {
      title: (
        <Tooltip title={intl.formatMessage({ id: 'sessions.column.statusTooltip' })}>
          <span style={{ cursor: 'help' }}>
            <SortableTitle
              label={intl.formatMessage({ id: 'sessions.column.status' })}
              active={sortKey === 'status'}
              order={sortOrder}
              onClick={() => {
                setPage(1);
                if (sortKey !== 'status') {
                  setSortKey('status');
                  setSortOrder('asc');
                } else {
                  setSortOrder((o) => (o === 'desc' ? 'asc' : 'desc'));
                }
              }}
            />
          </span>
        </Tooltip>
      ),
      key: 'status',
      width: 120,
      filters: [
        { text: intl.formatMessage({ id: 'sessions.status.active' }), value: 'active' },
        { text: intl.formatMessage({ id: 'sessions.status.idle' }), value: 'idle' },
        { text: intl.formatMessage({ id: 'sessions.status.completed' }), value: 'completed' },
        { text: intl.formatMessage({ id: 'sessions.status.failed' }), value: 'failed' },
        { text: intl.formatMessage({ id: 'sessions.status.archived' }), value: 'archived' },
      ],
      filteredValue: colStatuses.length ? colStatuses : null,
      filterMultiple: true,
      onFilter: () => true,
      render: (_, r) => (
        <Tag color={statusTagColor(r.status)}>{sessionStatusLabel(intl, r.status)}</Tag>
      ),
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
                setPage(1);
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
      width: 200,
      render: (_, r) => {
        const v = formatSessionParticipantDisplay(r);
        const participants = r.participants ?? r.participantIds ?? [];
        const participantCount = Array.isArray(participants) ? participants.length : 0;
        const lastSpeaker = participantCount > 0 ? participants[participants.length - 1] : null;
        const showLastSpeaker = lastSpeaker && participantCount > 1;

        return (
          <Link
            to={`/sessions/${encodeURIComponent(r.sessionId)}`}
            className="session-user-link"
            title={r.sessionKey || r.sessionId}
            style={{ display: 'block' }}
          >
            <Typography.Text
              style={{
                display: 'block',
                maxWidth: 170,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {v}
            </Typography.Text>
            {participantCount > 1 && (
              <Typography.Text
                type="secondary"
                style={{
                  display: 'block',
                  fontSize: 11,
                  maxWidth: 170,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  marginTop: 2,
                }}
                title={
                  showLastSpeaker
                    ? `${intl.formatMessage({ id: 'sessions.participantCount' }, { count: participantCount })} · ${intl.formatMessage({ id: 'sessions.lastSpeaker' })}: ${lastSpeaker}`
                    : undefined
                }
              >
                {intl.formatMessage(
                  { id: 'sessions.participantCount' },
                  { count: participantCount },
                )}
                {showLastSpeaker &&
                  ` · ${intl.formatMessage({ id: 'sessions.lastSpeaker' })}: ${lastSpeaker}`}
              </Typography.Text>
            )}
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
            setPage(1);
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
            setPage(1);
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
      width: 90,
      align: 'right',
    },
    {
      title: (
        <SortableTitle
          label={intl.formatMessage({ id: 'sessions.column.messages' })}
          active={sortKey === 'messageCount'}
          order={sortOrder}
          onClick={() => {
            setPage(1);
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
      width: 70,
      align: 'right',
      render: (_, r) => {
        const text = formatSessionListMessageCount(r);
        if (r.messageCountCapped) {
          const n = r.messageCountScanMaxLines ?? 1000;
          return (
            <Tooltip
              title={intl.formatMessage(
                { id: 'sessions.column.messagesExceededScanTooltip' },
                { n },
              )}
            >
              <span style={{ cursor: 'help' }}>{text}</span>
            </Tooltip>
          );
        }
        return text;
      },
    },
    {
      title: (
        <SortableTitle
          label={intl.formatMessage({ id: 'sessions.column.fileSize' })}
          active={sortKey === 'transcriptFileSizeBytes'}
          order={sortOrder}
          onClick={() => {
            setPage(1);
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
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            justifyContent: 'flex-end',
            width: '100%',
          }}
        >
          <Tooltip title={intl.formatMessage({ id: 'sessions.column.recordedTokensTooltip' })}>
            <span style={{ cursor: 'help' }}>
              <SortableTitle
                label={intl.formatMessage({ id: 'sessions.column.recordedTokens' })}
                active={sortKey === 'totalTokens' || sortKey === 'utilization'}
                order={sortOrder}
                onClick={() => {
                  setPage(1);
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
          <TokenMetricHint intl={intl} />
        </div>
      ),
      key: 'tokenRecorded',
      width: 150,
      align: 'right',
      onHeaderCell: () => ({ style: { whiteSpace: 'nowrap' } }),
      onCell: () => ({ style: { minWidth: 150, verticalAlign: 'middle' } }),
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
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                justifyContent: 'flex-end',
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
              <TokenMetricHint intl={intl} value={r.totalTokens} />
            </span>
            <Tooltip
              title={
                unreliable ? intl.formatMessage({ id: 'sessions.utilUnreliableHint' }) : undefined
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
        );
      },
    },
    {
      title: (
        <Tooltip title={intl.formatMessage({ id: 'sessions.column.estimatedLogTooltip' })}>
          <span style={{ cursor: 'help' }}>
            <SortableTitle
              label={intl.formatMessage({ id: 'sessions.column.estimatedLog' })}
              active={sortKey === 'estimatedTokensFromLog'}
              order={sortOrder}
              onClick={() => {
                setPage(1);
                if (sortKey !== 'estimatedTokensFromLog') {
                  setSortKey('estimatedTokensFromLog');
                  setSortOrder('desc');
                } else {
                  setSortOrder((o) => (o === 'desc' ? 'asc' : 'desc'));
                }
              }}
            />
          </span>
        </Tooltip>
      ),
      key: 'tokenEstimated',
      width: 110,
      align: 'right',
      render: (_, r) =>
        r.estimatedTokensFromLog != null ? (
          <Tooltip title={intl.formatMessage({ id: 'sessions.estimatedTokensDisclaimer' })}>
            <Typography.Text type="secondary" style={{ whiteSpace: 'nowrap' }}>
              {formatTokensShort(r.estimatedTokensFromLog)}
            </Typography.Text>
          </Tooltip>
        ) : (
          '—'
        ),
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
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Typography.Title level={4} style={{ margin: 0 }}>
            {intl.formatMessage({ id: 'sessions.title' })}
          </Typography.Title>
          <SectionScopeHint intl={intl} messageId="sessions.pageScopeDesc" />
          <Select
            showSearch
            allowClear
            loading={overviewLoading}
            placeholder={intl.formatMessage({ id: 'sessions.agentSelectPlaceholder' })}
            style={{ minWidth: 200 }}
            value={agentIdFromUrl?.trim() || undefined}
            options={agentOverview.map((a) => ({ label: a.agentId, value: a.agentId }))}
            filterOption={(input, option) =>
              (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
            }
            onChange={(v) => {
              setPage(1);
              if (!v) setSearchParams({});
              else setSearchParams({ agentId: v });
            }}
          />
          <Input.Search
            allowClear
            placeholder={intl.formatMessage({ id: 'sessions.searchPlaceholder' })}
            style={{ width: 220 }}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
        <Segmented
          options={filterOptions.map((o) => ({ label: o.label, value: o.value }))}
          value={filter}
          onChange={(v) => {
            setPage(1);
            setFilter(v);
          }}
        />
      </div>
      {hasAgentFilter ? (
        <Card size="small" style={{ marginTop: 12 }} bodyStyle={{ padding: '12px 16px' }}>
          <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
            {intl.formatMessage({ id: 'sessions.agentSummaryHint' })}
          </Typography.Text>
          <Row gutter={[8, 8]}>
            <Col xs={12} sm={6}>
              <Statistic
                title={intl.formatMessage({ id: 'dashboard.totalSessions' })}
                value={currentAgentSummary?.sessionCount ?? 0}
                valueStyle={{ fontSize: 15 }}
              />
            </Col>
            <Col xs={12} sm={6}>
              <Statistic
                title={intl.formatMessage({ id: 'dashboard.active' })}
                value={currentAgentSummary?.activeCount ?? 0}
                valueStyle={{ fontSize: 15, color: token.colorSuccess }}
              />
            </Col>
            <Col xs={12} sm={6}>
              <Statistic
                title={intl.formatMessage({ id: 'dashboard.idle' })}
                value={currentAgentSummary?.idleCount ?? 0}
                valueStyle={{ fontSize: 15, color: token.colorWarning }}
              />
            </Col>
            <Col xs={12} sm={6}>
              <Statistic
                title={intl.formatMessage({ id: 'dashboard.archived' })}
                value={currentAgentSummary?.archivedCount ?? 0}
                valueStyle={{ fontSize: 15, color: token.colorTextSecondary }}
              />
            </Col>
          </Row>
        </Card>
      ) : null}
      <Alert
        type="info"
        showIcon
        style={{ marginTop: 12 }}
        message={
          agentIdFromUrl?.trim()
            ? intl.formatMessage({ id: 'sessions.filterByAgent' }, { agentId: agentIdFromUrl.trim() })
            : intl.formatMessage({ id: 'sessions.allAgentsHint' })
        }
        action={
          agentIdFromUrl?.trim() ? (
            <Button
              size="small"
              type="link"
              onClick={() => {
                setSearchParams({});
                setPage(1);
              }}
            >
              {intl.formatMessage({ id: 'sessions.clearAgentFilter' })}
            </Button>
          ) : null
        }
      />
      <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 8 }}>
        {intl.formatMessage({ id: 'sessions.sortHint' })}
      </Typography.Text>
      <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>
        {intl.formatMessage({ id: 'sessions.statusVsArchivedHint' })}
      </Typography.Text>
      <Table
        style={{ marginTop: 12 }}
        tableLayout="fixed"
        scroll={{ x: 'max-content' }}
        loading={loading}
        rowKey={(r) => `${r.agentId || 'na'}:${r.sessionId}`}
        dataSource={sessions}
        columns={columns}
        locale={{ emptyText: intl.formatMessage({ id: 'sessions.empty' }) }}
        size="small"
        onChange={(pag, filters, _sorter, extra) => {
          const nextPage =
            extra?.action === 'filter' ? 1 : (pag?.current ?? 1);
          setPage(nextPage);
          if (!filters) return;
          if ('status' in filters) {
            const st = filters.status;
            setColStatuses(
              st == null || !Array.isArray(st) ? [] : st.filter(Boolean),
            );
          }
          if ('typeLabel' in filters) {
            const tt = filters.typeLabel;
            setColTypeLabels(
              tt == null || !Array.isArray(tt) ? [] : tt.filter(Boolean),
            );
          }
          if ('chatKind' in filters) {
            const ck = filters.chatKind;
            setColChatKinds(
              ck == null || !Array.isArray(ck) ? [] : ck.filter(Boolean),
            );
          }
        }}
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
