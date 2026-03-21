import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useIntl } from 'react-intl';
import {
  Card,
  Row,
  Col,
  Statistic,
  Spin,
  Typography,
  Table,
  Progress,
  Tooltip,
  Alert,
  theme,
  Space,
  Tag,
  Button,
} from 'antd';
import { HistoryOutlined } from '@ant-design/icons';
import { BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import { dashboardApi, extractApiErrorMessage } from '../api';
import { sessionStatusLabel } from '../i18n/sessionStatusLabel';
import {
  inferSessionTypeLabel,
  inferSessionChatKind,
  formatSessionParticipantDisplay,
} from '../utils/session-user';
import { sessionTokenUtilizationPercent } from '../utils/session-tokens';
import { APP_BUILD_TIME_ISO, APP_GIT_SHA } from '../buildInfo';
import TokenMetricHint from '../components/TokenMetricHint';
import SectionScopeHint from '../components/SectionScopeHint';

/** 仪表盘整页轮询（含系统健康）；仅在前台标签页触发 */
const DASHBOARD_POLL_INTERVAL_MS = 10000;

function formatTokenShort(n) {
  if (n == null || typeof n !== 'number') return '?';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}m`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function formatTimeAgo(ms, intl) {
  if (ms == null || typeof ms !== 'number') return '';
  const sec = Math.floor(ms / 1000);
  const min = Math.floor(sec / 60);
  if (min < 1) return intl.locale === 'zh-CN' ? '刚刚' : 'just now';
  if (min < 60) return intl.locale === 'zh-CN' ? `${min} 分钟前` : `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return intl.locale === 'zh-CN' ? `${h} 小时前` : `${h}h ago`;
  return intl.locale === 'zh-CN' ? `${Math.floor(h / 24)} 天前` : `${Math.floor(h / 24)}d ago`;
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

function formatBytes(n) {
  if (n == null || typeof n !== 'number' || n < 0) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function statusTagColor(status) {
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
}

function formatTokensShort(n) {
  if (n == null || typeof n !== 'number') return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}m`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function utilizationFor(s) {
  return sessionTokenUtilizationPercent(s);
}

function utilizationColor(pct) {
  if (pct == null) return undefined;
  if (pct >= 90) return 'exception';
  if (pct >= 70) return 'warning';
  return 'normal';
}

function formatBuildTimeDisplay(iso, intl) {
  if (!iso || typeof iso !== 'string') return '';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return intl.locale === 'zh-CN'
      ? d.toLocaleString('zh-CN', { dateStyle: 'short', timeStyle: 'medium' })
      : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

/** 与会话列表页列展示一致（无排序交互） */
function buildDashboardRecentSessionColumns(intl, archiveCountMap) {
  const am = archiveCountMap && typeof archiveCountMap === 'object' ? archiveCountMap : {};
  return [
    {
      title: intl.formatMessage({ id: 'sessions.column.session' }),
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
        <Tooltip title={intl.formatMessage({ id: 'sessions.column.statusTooltip' })}>
          <span style={{ cursor: 'help' }}>{intl.formatMessage({ id: 'sessions.column.status' })}</span>
        </Tooltip>
      ),
      key: 'status',
      width: 120,
      render: (_, r) => (
        <Tag color={statusTagColor(r.status)}>{sessionStatusLabel(intl, r.status)}</Tag>
      ),
    },
    {
      title: (
        <Tooltip title={intl.formatMessage({ id: 'sessions.column.participantTooltip' })}>
          <span style={{ cursor: 'help' }}>{intl.formatMessage({ id: 'sessions.column.user' })}</span>
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
      title: intl.formatMessage({ id: 'sessions.column.lastActive' }),
      key: 'lastActive',
      width: 190,
      render: (_, r) => (r.lastActive ? new Date(r.lastActive).toLocaleString(intl.locale) : '—'),
    },
    {
      title: intl.formatMessage({ id: 'sessions.column.duration' }),
      key: 'duration',
      width: 130,
      render: (_, r) => formatDuration(r.duration),
    },
    {
      title: intl.formatMessage({ id: 'sessions.column.messages' }),
      key: 'messageCount',
      width: 88,
      align: 'right',
      render: (_, r) => (r.messageCount != null ? r.messageCount : '—'),
    },
    {
      title: intl.formatMessage({ id: 'sessions.column.fileSize' }),
      key: 'transcriptFileSizeBytes',
      width: 100,
      align: 'right',
      render: (_, r) => formatBytes(r.transcriptFileSizeBytes),
    },
    {
      title: (
        <Tooltip title={intl.formatMessage({ id: 'sessions.column.archivedTooltip' })}>
          <span style={{ cursor: 'help' }}>{intl.formatMessage({ id: 'sessions.column.archived' })}</span>
        </Tooltip>
      ),
      key: 'archived',
      width: 90,
      render: (_, r) => {
        const count = am[r.sessionKey] ?? 0;
        const sid = r?.sessionId ?? r?.sessionKey ?? '';
        if (count === 0 || !sid) return '—';
        return (
          <Tooltip title={intl.formatMessage({ id: 'sessions.archivedCellTooltip' })}>
            <Link
              to={`/sessions/${encodeURIComponent(sid)}/archives`}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              <HistoryOutlined />
              <span>{intl.formatMessage({ id: 'sessions.archivedCountFmt' }, { count })}</span>
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
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end', width: '100%' }}>
          <Tooltip title={intl.formatMessage({ id: 'sessions.column.tokensUtilHint' })}>
            <span style={{ cursor: 'help' }}>
              {`${intl.formatMessage({ id: 'sessions.column.tokens' })} / ${intl.formatMessage({ id: 'sessions.column.util' })}`}
            </span>
          </Tooltip>
          <TokenMetricHint intl={intl} />
        </div>
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
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
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
        );
      },
    },
  ];
}

function formatElevated(level) {
  if (level == null || level === '' || level === 'off') return null;
  if (level === 'on') return 'elevated';
  return `elevated:${level}`;
}

function resolveSessionDetailPath(mainSession) {
  if (!mainSession?.sessionId) return null;
  const sid = String(mainSession.sessionId);
  if (sid.includes('/')) return sid;
  const agentId = mainSession.agentId || (mainSession.key && String(mainSession.key).split(':')[1]) || 'main';
  return `${agentId}/${sid}`;
}

function GatewayStatusCard({ overview, intl }) {
  const { token } = theme.useToken();
  if (overview == null) {
    return (
      <Card
        title={intl.formatMessage({ id: 'dashboard.gatewayStatus' })}
        extra={<SectionScopeHint intl={intl} messageId="dashboard.gatewayStatusDesc" />}
        size="small"
        bodyStyle={{ padding: '12px 16px' }}
      >
        <Spin />
      </Card>
    );
  }
  if (overview.error) {
    const msg = typeof overview.error === 'string' ? overview.error : 'Error';
    return (
      <Card
        title={intl.formatMessage({ id: 'dashboard.gatewayStatus' })}
        extra={<SectionScopeHint intl={intl} messageId="dashboard.gatewayStatusDesc" />}
        size="small"
        bodyStyle={{ padding: '12px 16px' }}
      >
        <Typography.Text type="danger">{msg}</Typography.Text>
      </Card>
    );
  }
  const status = overview.status || {};
  const sessionsBlock = status.sessions || {};
  const defaults = sessionsBlock.defaults || {};
  const recent = sessionsBlock.recent || [];
  const mainSession = recent[0];
  const queuedEvents = Array.isArray(status.queuedSystemEvents) ? status.queuedSystemEvents : [];
  const connectVer = overview.version || '';
  const runtimeVer = status.runtimeVersion;
  let versionLine = '🦞 ';
  if (connectVer && runtimeVer && String(connectVer) !== String(runtimeVer)) {
    versionLine += `${connectVer} (${runtimeVer})`;
  } else {
    versionLine += connectVer || runtimeVer || '?';
  }
  const model = mainSession?.model || defaults.model || '?';
  const totalTok = mainSession?.totalTokens ?? 0;
  const ctxTok = mainSession?.contextTokens ?? defaults.contextTokens ?? null;
  const pct =
    mainSession?.percentUsed != null
      ? mainSession.percentUsed
      : ctxTok && ctxTok > 0
        ? Math.min(999, Math.round((totalTok / ctxTok) * 100))
        : null;
  const contextLine =
    ctxTok != null
      ? `${formatTokenShort(totalTok)}/${formatTokenShort(ctxTok)}${pct != null ? ` (${pct}%)` : ''}`
      : 'N/A';
  const sessionKey = mainSession?.key || '—';
  const detailPath = resolveSessionDetailPath(mainSession);
  const updatedPhrase =
    mainSession?.age != null
      ? formatTimeAgo(mainSession.age, intl)
      : mainSession?.updatedAt
        ? formatTimeAgo(Date.now() - mainSession.updatedAt, intl)
        : '—';
  const runtimeKind = mainSession?.kind === 'group' ? 'group' : 'direct';
  const think = mainSession?.thinkingLevel ?? 'off';
  const elevated = formatElevated(mainSession?.elevatedLevel);
  const runtimeParts = [`Runtime: ${runtimeKind}`, `Think: ${think}`, mainSession?.fastMode ? 'Fast: on' : null, elevated].filter(Boolean);
  const queueDepth = queuedEvents.length;

  const src = overview.traceflowGatewayStatusSource;
  let gatewayStatusSourceMsgId = null;
  if (src) {
    if (src.metricsFrom === 'sessions.json') {
      gatewayStatusSourceMsgId = 'dashboard.gatewayStatusSourceMerged';
    } else if (src.stateDirConfigured) {
      gatewayStatusSourceMsgId = 'dashboard.gatewayStatusSourceHealthNoRow';
    } else {
      gatewayStatusSourceMsgId = 'dashboard.gatewayStatusSourceHealthNoStateDir';
    }
  }

  return (
    <Card
      title={intl.formatMessage({ id: 'dashboard.gatewayStatus' })}
      extra={<SectionScopeHint intl={intl} messageId="dashboard.gatewayStatusDesc" />}
      size="small"
      bodyStyle={{ padding: '12px 16px' }}
    >
      <Typography.Paragraph style={{ fontFamily: 'monospace', fontSize: 12, marginBottom: 8, lineHeight: 1.7, color: token.colorTextSecondary }}>
        {versionLine}
        <br />
        Model: {model}
        <br />
        <Tooltip title={intl.formatMessage({ id: 'dashboard.gatewayContextDesc' })}>
          <span style={{ cursor: 'help' }}>Context: {contextLine}</span>
        </Tooltip>
        {' · '}
        <Tooltip title={intl.formatMessage({ id: 'dashboard.gatewayCompactionsDesc' })}>
          <span style={{ cursor: 'help' }}>Compactions: {mainSession?.compactionCount ?? 0}</span>
        </Tooltip>
        <br />
        Session:{' '}
        {detailPath ? (
          <Link to={`/sessions/${encodeURIComponent(detailPath)}`}>{sessionKey}</Link>
        ) : (
          sessionKey
        )}{' '}
        · {updatedPhrase}
        <br />
        {runtimeParts.join(' · ')}
        <br />
        <Tooltip title={intl.formatMessage({ id: 'dashboard.gatewayQueueDepthDesc' })}>
          <span style={{ cursor: 'help' }}>Queue depth: {queueDepth}</span>
        </Tooltip>
      </Typography.Paragraph>
      {gatewayStatusSourceMsgId ? (
        <Tooltip title={intl.formatMessage({ id: 'dashboard.gatewayStatusSourceTooltip' })}>
          <Typography.Paragraph
            style={{
              marginTop: 0,
              marginBottom: 0,
              fontSize: 11,
              lineHeight: 1.55,
              color: token.colorTextTertiary,
              cursor: 'help',
            }}
          >
            {intl.formatMessage({ id: gatewayStatusSourceMsgId })}
          </Typography.Paragraph>
        </Tooltip>
      ) : null}
    </Card>
  );
}

export default function Dashboard() {
  const intl = useIntl();
  const { token } = theme.useToken();
  const [health, setHealth] = useState(null);
  const [statusOverview, setStatusOverview] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [recentLogs, setRecentLogs] = useState([]);
  const [archiveCountMap, setArchiveCountMap] = useState({});
  const [metrics, setMetrics] = useState({
    latency: null,
    tools: [],
    skills: [],
    tokenSummary: null,
  });
  const [loading, setLoading] = useState(true);
  /** 是否已成功拉取过至少一次 overview，用于失败时保留上次数据而非整页清空 */
  const hasSnapshotRef = useRef(false);
  /** 本次刷新失败时的提示：有快照时为「仍显示上次数据」；无快照时为首次加载失败 */
  const [overviewFetchHint, setOverviewFetchHint] = useState(null);
  /** 用 ref 防抖，勿放入 useCallback 依赖，否则每次请求结束都会换新 fetchData，useEffect 会反复挂载并瞬间连打 overview */
  const fetchInFlightRef = useRef(false);

  const fetchData = useCallback(async () => {
    if (fetchInFlightRef.current) return;
    fetchInFlightRef.current = true;
    try {
      let overviewHttpErr = null;
      const data = await dashboardApi.getOverview().catch((err) => {
        overviewHttpErr = err;
        return null;
      });

      const fallbackDetail = intl.formatMessage({ id: 'dashboard.overviewFetchFailed' });
      const errDetail = extractApiErrorMessage(overviewHttpErr, fallbackDetail);

      if (!data) {
        if (hasSnapshotRef.current) {
          setOverviewFetchHint({ type: 'stale', detail: errDetail });
        } else {
          setOverviewFetchHint({ type: 'firstLoad', detail: errDetail });
          setHealth(null);
          setStatusOverview({ error: errDetail });
          setSessions([]);
          setRecentLogs([]);
          setArchiveCountMap({});
          setMetrics({
            latency: { p50: 0, p95: 0, p99: 0, count: 0 },
            tools: [],
            skills: [],
            tokenSummary: {
              totalInput: 0,
              totalOutput: 0,
              totalTokens: 0,
              activeInput: 0,
              activeOutput: 0,
              activeTokens: 0,
              archivedInput: 0,
              archivedOutput: 0,
              archivedTokens: 0,
              nearLimitCount: 0,
              limitReachedCount: 0,
              sessionCount: 0,
            },
            archiveCount: 0,
          });
        }
        return;
      }

      hasSnapshotRef.current = true;
      setOverviewFetchHint(null);

      const healthData = data?.health ?? null;
      const statusData = data?.statusOverview ?? { error: fallbackDetail };
      const sessionsData = Array.isArray(data?.sessions) ? data.sessions : [];
      const logsData = Array.isArray(data?.recentLogs) ? data.recentLogs : [];
      const latencyData = data?.metrics?.latency ?? { p50: 0, p95: 0, p99: 0, count: 0 };
      const rawToolStats = data?.metrics?.tools;
      const toolsData =
        rawToolStats &&
        typeof rawToolStats === 'object' &&
        !Array.isArray(rawToolStats) &&
        Array.isArray(rawToolStats.tools)
          ? {
              tools: rawToolStats.tools,
              skills: Array.isArray(rawToolStats.skills) ? rawToolStats.skills : [],
            }
          : {
              tools: Array.isArray(rawToolStats) ? rawToolStats : [],
              skills: [],
            };
      const tokenSummaryData = data?.metrics?.tokenSummary ?? {
        totalInput: 0,
        totalOutput: 0,
        totalTokens: 0,
        activeInput: 0,
        activeOutput: 0,
        activeTokens: 0,
        archivedInput: 0,
        archivedOutput: 0,
        archivedTokens: 0,
        nearLimitCount: 0,
        limitReachedCount: 0,
        sessionCount: 0,
      };
      const acMap =
        data?.metrics?.archiveCountMap && typeof data.metrics.archiveCountMap === 'object'
          ? data.metrics.archiveCountMap
          : {};
      setHealth(healthData);
      setStatusOverview(statusData);
      setSessions(sessionsData);
      setRecentLogs(logsData);
      setArchiveCountMap(acMap);
      setMetrics({
        latency: latencyData || { p50: 0, p95: 0, p99: 0, count: 0 },
        tools: toolsData.tools,
        skills: toolsData.skills,
        tokenSummary: tokenSummaryData || {},
        archiveCount: Object.values(acMap).reduce((s, n) => s + (Number(n) || 0), 0),
      });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      fetchInFlightRef.current = false;
    }
  }, [intl]);

  useEffect(() => {
    fetchData();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchData();
      }
    };
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchData();
      }
    }, DASHBOARD_POLL_INTERVAL_MS);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [fetchData]);

  const recentSessions10 = useMemo(
    () =>
      [...sessions]
        .sort((a, b) => (b.lastActive ?? 0) - (a.lastActive ?? 0))
        .slice(0, 10),
    [sessions],
  );

  const recentSessionColumns = useMemo(
    () => buildDashboardRecentSessionColumns(intl, archiveCountMap),
    [intl, archiveCountMap],
  );

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <Spin size="large" />
      </div>
    );
  }

  const activeSessions = sessions.filter((s) => s.status === 'active').length;
  const idleSessions = sessions.filter((s) => s.status === 'idle').length;
  const totalSessions = sessions.length;

  const skillChartData = (metrics.skills || []).slice(0, 5).map((s) => ({
    name: s.skill?.length > 15 ? `${s.skill.slice(0, 15)}…` : s.skill,
    count: s.count,
  }));
  const toolChartData = (metrics.tools || []).slice(0, 5).map((t) => ({
    name: t.tool?.length > 15 ? `${t.tool.slice(0, 15)}…` : t.tool,
    count: t.count,
  }));

  const buildTimeText = formatBuildTimeDisplay(APP_BUILD_TIME_ISO, intl);
  const gitShort = typeof APP_GIT_SHA === 'string' && APP_GIT_SHA.length >= 7 ? APP_GIT_SHA.slice(0, 7) : '';

  return (
    <div style={{ paddingBottom: 24 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          flexWrap: 'wrap',
          gap: 8,
          marginBottom: 20,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Typography.Title level={4} style={{ margin: 0 }}>
            {intl.formatMessage({ id: 'dashboard.title' })}
          </Typography.Title>
          <SectionScopeHint intl={intl} messageId="dashboard.titleDesc" />
        </div>
        {(buildTimeText || gitShort) && (
          <Typography.Text type="secondary" style={{ fontSize: 12 }} title={APP_BUILD_TIME_ISO || undefined}>
            {buildTimeText ? (
              <>
                {intl.formatMessage({ id: 'dashboard.buildLabel' })}
                {buildTimeText}
              </>
            ) : null}
            {gitShort ? (
              <>
                {buildTimeText ? ' · ' : ''}
                {intl.formatMessage({ id: 'dashboard.buildGit' })}
                {gitShort}
              </>
            ) : null}
          </Typography.Text>
        )}
      </div>
      {overviewFetchHint && (
        <Alert
          style={{ marginBottom: 16 }}
          type={overviewFetchHint.type === 'stale' ? 'warning' : 'error'}
          showIcon
          message={
            overviewFetchHint.type === 'stale'
              ? intl.formatMessage({ id: 'dashboard.overviewStaleTitle' })
              : intl.formatMessage({ id: 'dashboard.overviewFirstLoadFailedTitle' })
          }
          description={
            overviewFetchHint.type === 'stale'
              ? intl.formatMessage({ id: 'dashboard.overviewStaleDetail' }, { detail: overviewFetchHint.detail })
              : overviewFetchHint.detail
          }
          action={
            <Button size="small" type="primary" ghost onClick={() => fetchData()}>
              {intl.formatMessage({ id: 'dashboard.overviewRetry' })}
            </Button>
          }
        />
      )}
      <Row gutter={[8, 8]}>
        <Col xs={12} sm={8} md={6} lg={4} xl={4}>
          <Card size="small" bodyStyle={{ padding: '10px 12px' }}>
            <Statistic
              title={
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  {intl.formatMessage({ id: 'dashboard.systemStatus' })}
                  <SectionScopeHint intl={intl} messageId="dashboard.systemStatusDesc" />
                </span>
              }
              value={health?.status || '—'}
              valueStyle={{ fontSize: 14 }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={6} lg={4} xl={4}>
          <Card size="small" bodyStyle={{ padding: '10px 12px' }}>
            <Statistic
              title={
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  {intl.formatMessage({ id: 'dashboard.totalSessions' })}
                  <SectionScopeHint intl={intl} messageId="dashboard.totalSessionsDesc" />
                </span>
              }
              value={totalSessions}
              valueStyle={{ fontSize: 14 }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={6} lg={4} xl={4}>
          <Card size="small" bodyStyle={{ padding: '10px 12px' }}>
            <Statistic
              title={
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  {intl.formatMessage({ id: 'dashboard.active' })}
                  <SectionScopeHint intl={intl} messageId="dashboard.activeDesc" />
                </span>
              }
              value={activeSessions}
              valueStyle={{ color: token.colorSuccess, fontSize: 14 }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={6} lg={4} xl={4}>
          <Card size="small" bodyStyle={{ padding: '10px 12px' }}>
            <Statistic
              title={
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  {intl.formatMessage({ id: 'dashboard.idle' })}
                  <SectionScopeHint intl={intl} messageId="dashboard.idleDesc" />
                </span>
              }
              value={idleSessions}
              valueStyle={{ color: token.colorWarning, fontSize: 14 }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={6} lg={4} xl={4}>
          <Card size="small" bodyStyle={{ padding: '10px 12px' }}>
            <Statistic
              title={
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  {intl.formatMessage({ id: 'dashboard.archived' })}
                  <SectionScopeHint intl={intl} messageId="dashboard.archivedDesc" />
                </span>
              }
              value={metrics.archiveCount ?? 0}
              valueStyle={{ color: token.colorTextSecondary, fontSize: 14 }}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[12, 12]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={16}>
          <GatewayStatusCard overview={statusOverview} intl={intl} />
        </Col>
        <Col xs={24} lg={8}>
          <Card
            title={intl.formatMessage({ id: 'dashboard.health' })}
            extra={
              <Space size="small">
                <SectionScopeHint intl={intl} messageId="dashboard.healthDesc" />
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {intl.formatMessage({ id: 'dashboard.healthRefreshEvery' }, { seconds: DASHBOARD_POLL_INTERVAL_MS / 1000 })}
                </Typography.Text>
              </Space>
            }
            size="small"
            bodyStyle={{ padding: '12px 16px' }}
          >
            <Typography.Paragraph style={{ marginBottom: 4 }}>
              <Tooltip title={intl.formatMessage({ id: 'dashboard.healthGatewayDesc' })}>
                <span style={{ cursor: 'help' }}>Gateway: {health?.openclawConnected ? '✓' : '✗'}</span>
              </Tooltip>
            </Typography.Paragraph>
            <Typography.Paragraph style={{ marginBottom: 4 }}>
              <Tooltip title={intl.formatMessage({ id: 'dashboard.healthMemoryDesc' })}>
                <span style={{ cursor: 'help' }}>Memory: {health?.gateway?.memory != null ? `${Math.round(health.gateway.memory)} MB` : '—'}</span>
              </Tooltip>
            </Typography.Paragraph>
            <Typography.Paragraph style={{ marginBottom: 0 }}>
              <Tooltip title={intl.formatMessage({ id: 'dashboard.healthCpuDesc' })}>
                <span style={{ cursor: 'help' }}>CPU: {health?.gateway?.cpu != null ? `${health.gateway.cpu}%` : '—'}</span>
              </Tooltip>
            </Typography.Paragraph>
          </Card>
        </Col>
      </Row>

      {metrics.latency?.count > 0 && (
        <Card
          title={intl.formatMessage({ id: 'dashboard.latency' })}
          extra={<SectionScopeHint intl={intl} messageId="dashboard.latencyDesc" />}
          size="small"
          style={{ marginTop: 16 }}
          bodyStyle={{ padding: '12px 16px' }}
        >
          <Row gutter={12}>
            <Col span={6}>
              <Statistic
                title={
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    {intl.formatMessage({ id: 'dashboard.latencyP50' })}
                    <SectionScopeHint intl={intl} messageId="dashboard.latencyP50Desc" />
                  </span>
                }
                suffix="ms"
                value={metrics.latency.p50}
              />
            </Col>
            <Col span={6}>
              <Statistic
                title={
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    {intl.formatMessage({ id: 'dashboard.latencyP95' })}
                    <SectionScopeHint intl={intl} messageId="dashboard.latencyP95Desc" />
                  </span>
                }
                suffix="ms"
                value={metrics.latency.p95}
              />
            </Col>
            <Col span={6}>
              <Statistic
                title={
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    {intl.formatMessage({ id: 'dashboard.latencyP99' })}
                    <SectionScopeHint intl={intl} messageId="dashboard.latencyP99Desc" />
                  </span>
                }
                suffix="ms"
                value={metrics.latency.p99}
              />
            </Col>
            <Col span={6}>
              <Statistic
                title={
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    {intl.formatMessage({ id: 'dashboard.latencyCount' })}
                    <SectionScopeHint intl={intl} messageId="dashboard.latencyCountDesc" />
                  </span>
                }
                value={metrics.latency.count}
              />
            </Col>
          </Row>
        </Card>
      )}

      {metrics.tokenSummary && (() => {
        const ts = metrics.tokenSummary;
        return (
          <>
            <Row gutter={[12, 12]} style={{ marginTop: 16 }}>
              <Col xs={24} md={12}>
                <Card
                  title={intl.formatMessage({ id: 'dashboard.tokenSummaryActive' })}
                  extra={<SectionScopeHint intl={intl} messageId="dashboard.tokenActiveDesc" />}
                  size="small"
                  bodyStyle={{ padding: '12px 16px' }}
                >
                  <Row gutter={[8, 0]}>
                    <Col span={8}>
                      <Statistic
                        title={
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            {intl.formatMessage({ id: 'dashboard.tokenInput' })}
                            <SectionScopeHint intl={intl} messageId="dashboard.tokenInputDesc" />
                          </span>
                        }
                        value={ts.activeInput ?? 0}
                        valueStyle={{ fontSize: 14 }}
                      />
                    </Col>
                    <Col span={8}>
                      <Statistic
                        title={
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            {intl.formatMessage({ id: 'dashboard.tokenOutput' })}
                            <SectionScopeHint intl={intl} messageId="dashboard.tokenOutputDesc" />
                          </span>
                        }
                        value={ts.activeOutput ?? 0}
                        valueStyle={{ fontSize: 14 }}
                      />
                    </Col>
                    <Col span={8}>
                      <Statistic
                        title={
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            {intl.formatMessage({ id: 'dashboard.tokenTotal' })}
                            <SectionScopeHint intl={intl} messageId="dashboard.tokenTotalDesc" />
                          </span>
                        }
                        value={ts.activeTokens ?? 0}
                        valueStyle={{ fontSize: 14 }}
                      />
                    </Col>
                  </Row>
                </Card>
              </Col>
              <Col xs={24} md={12}>
                <Card
                  title={intl.formatMessage({ id: 'dashboard.tokenSummaryArchived' })}
                  extra={<SectionScopeHint intl={intl} messageId="dashboard.tokenArchivedDesc" />}
                  size="small"
                  bodyStyle={{ padding: '12px 16px' }}
                >
                  <Row gutter={[8, 0]}>
                    <Col span={8}>
                      <Statistic
                        title={
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            {intl.formatMessage({ id: 'dashboard.tokenInput' })}
                            <SectionScopeHint intl={intl} messageId="dashboard.tokenInputDesc" />
                          </span>
                        }
                        value={ts.archivedInput ?? 0}
                        valueStyle={{ fontSize: 14 }}
                        formatter={(val) => (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            {val}
                            <TokenMetricHint intl={intl} value={ts.archivedInput ?? 0} />
                          </span>
                        )}
                      />
                    </Col>
                    <Col span={8}>
                      <Statistic
                        title={
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            {intl.formatMessage({ id: 'dashboard.tokenOutput' })}
                            <SectionScopeHint intl={intl} messageId="dashboard.tokenOutputDesc" />
                          </span>
                        }
                        value={ts.archivedOutput ?? 0}
                        valueStyle={{ fontSize: 14 }}
                        formatter={(val) => (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            {val}
                            <TokenMetricHint intl={intl} value={ts.archivedOutput ?? 0} />
                          </span>
                        )}
                      />
                    </Col>
                    <Col span={8}>
                      <Statistic
                        title={
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            {intl.formatMessage({ id: 'dashboard.tokenTotal' })}
                            <SectionScopeHint intl={intl} messageId="dashboard.tokenTotalDesc" />
                          </span>
                        }
                        value={ts.archivedTokens ?? 0}
                        valueStyle={{ fontSize: 14 }}
                        formatter={(val) => (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            {val}
                            <TokenMetricHint intl={intl} value={ts.archivedTokens ?? 0} />
                          </span>
                        )}
                      />
                    </Col>
                  </Row>
                </Card>
              </Col>
            </Row>
          </>
        );
      })()}

      <Row gutter={[12, 12]} style={{ marginTop: 16 }}>
        <Col xs={24}>
          <Card
            title={intl.formatMessage({ id: 'dashboard.recentSessions' })}
            size="small"
            extra={
              <Space size="small">
                <SectionScopeHint intl={intl} messageId="dashboard.recentSessionsDesc" />
                <Link to="/sessions">{intl.formatMessage({ id: 'dashboard.viewAll' })}</Link>
              </Space>
            }
            bodyStyle={{ padding: '12px 16px' }}
          >
            <Table
              size="small"
              tableLayout="fixed"
              scroll={{ x: 'max-content' }}
              pagination={false}
              dataSource={recentSessions10}
              rowKey="sessionId"
              columns={recentSessionColumns}
              locale={{ emptyText: intl.formatMessage({ id: 'sessions.empty' }) }}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[12, 12]} style={{ marginTop: 16 }}>
        <Col xs={24} md={12}>
          <Card
            title={
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, width: '100%' }}>
                <div style={{ minWidth: 0 }}>
                  <div>{intl.formatMessage({ id: 'dashboard.skillsTop' })}</div>
                  <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', lineHeight: 1.4, marginTop: 2 }}>
                    {intl.formatMessage({ id: 'dashboard.skillsToolsScopeHint' })}
                  </Typography.Text>
                </div>
                <SectionScopeHint intl={intl} messageId="dashboard.skillsTopDesc" />
              </div>
            }
            size="small"
            bodyStyle={{ padding: '12px 16px' }}
          >
            {skillChartData.length ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={skillChartData}>
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: token.colorTextSecondary }} />
                  <YAxis tick={{ fill: token.colorTextSecondary }} />
                  <RechartsTooltip contentStyle={{ background: token.colorBgElevated, border: `1px solid ${token.colorBorder}` }} />
                  <Bar dataKey="count" fill={token.colorSuccess} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <Typography.Text type="secondary">—</Typography.Text>
            )}
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card
            title={
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, width: '100%' }}>
                <div style={{ minWidth: 0 }}>
                  <div>{intl.formatMessage({ id: 'dashboard.toolsTop' })}</div>
                  <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', lineHeight: 1.4, marginTop: 2 }}>
                    {intl.formatMessage({ id: 'dashboard.skillsToolsScopeHint' })}
                  </Typography.Text>
                </div>
                <SectionScopeHint intl={intl} messageId="dashboard.toolsTopDesc" />
              </div>
            }
            size="small"
            bodyStyle={{ padding: '12px 16px' }}
          >
            {toolChartData.length ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={toolChartData}>
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: token.colorTextSecondary }} />
                  <YAxis tick={{ fill: token.colorTextSecondary }} />
                  <RechartsTooltip contentStyle={{ background: token.colorBgElevated, border: `1px solid ${token.colorBorder}` }} />
                  <Bar dataKey="count" fill={token.colorPrimary} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <Typography.Text type="secondary">—</Typography.Text>
            )}
          </Card>
        </Col>
      </Row>

      <Card
        title={intl.formatMessage({ id: 'dashboard.recentLogs' })}
        size="small"
        style={{ marginTop: 16 }}
        extra={
          <Space size="small">
            <SectionScopeHint intl={intl} messageId="dashboard.recentLogsDesc" />
            <Link to="/logs">{intl.formatMessage({ id: 'dashboard.fullLogs' })}</Link>
          </Space>
        }
        bodyStyle={{ padding: '12px 16px' }}
      >
        <div style={{ maxHeight: 280, overflow: 'auto', fontFamily: 'monospace', fontSize: 12 }}>
          {recentLogs.map((log, i) => (
            <div key={i} style={{ marginBottom: 2 }}>
              <Typography.Text type="secondary">{new Date(log.timestamp).toLocaleTimeString(intl.locale)}</Typography.Text>{' '}
              <Typography.Text type={log.level === 'error' ? 'danger' : undefined}>[{log.level}]</Typography.Text>{' '}
              {log.content}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
