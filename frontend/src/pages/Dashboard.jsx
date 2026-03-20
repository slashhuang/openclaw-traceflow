import React, { useState, useEffect, useCallback } from 'react';
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
} from 'antd';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import { dashboardApi } from '../api';
import { inferSessionTypeLabel } from '../utils/session-user';

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

function tokenUsageRowDisplay(item, sessions) {
  const session =
    (item.sessionId && sessions.find((s) => s.sessionId === item.sessionId)) ||
    sessions.find((s) => s.sessionKey === item.sessionKey);
  const detailId = item.sessionId || session?.sessionId;
  const typeLabel = session?.typeLabel || inferSessionTypeLabel(item.sessionKey, item.sessionId);
  const sys = typeLabel === 'heartbeat' || typeLabel === 'cron' || typeLabel === 'boot';
  const userLabel = session
    ? sys
      ? typeLabel
      : session.user || 'unknown'
    : detailId
      ? String(detailId).slice(0, 8) + '…'
      : (item.sessionKey || '').length > 28
        ? `${(item.sessionKey || '').slice(0, 28)}…`
        : item.sessionKey || '—';
  return { typeLabel, userLabel, detailId, sessionKeyFull: item.sessionKey };
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
        title={
          <Tooltip title={intl.formatMessage({ id: 'dashboard.gatewayStatusDesc' })}>
            <span style={{ cursor: 'help' }}>{intl.formatMessage({ id: 'dashboard.gatewayStatus' })}</span>
          </Tooltip>
        }
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
        title={
          <Tooltip title={intl.formatMessage({ id: 'dashboard.gatewayStatusDesc' })}>
            <span style={{ cursor: 'help' }}>{intl.formatMessage({ id: 'dashboard.gatewayStatus' })}</span>
          </Tooltip>
        }
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

  return (
    <Card
      title={
        <Tooltip title={intl.formatMessage({ id: 'dashboard.gatewayStatusDesc' })}>
          <span style={{ cursor: 'help' }}>{intl.formatMessage({ id: 'dashboard.gatewayStatus' })}</span>
        </Tooltip>
      }
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
  const [metrics, setMetrics] = useState({
    latency: null,
    tools: [],
    tokenSummary: null,
    tokenUsage: [],
    tokenByKey: [],
  });
  const [loading, setLoading] = useState(true);
  const [inFlight, setInFlight] = useState(false);

  const fetchData = useCallback(async () => {
    if (inFlight) return;
    setInFlight(true);
    try {
      const data = await dashboardApi.getOverview().catch(() => null);
      const healthData = data?.health ?? null;
      const statusData = data?.statusOverview ?? { error: 'fail' };
      const sessionsData = Array.isArray(data?.sessions) ? data.sessions : [];
      const logsData = Array.isArray(data?.recentLogs) ? data.recentLogs : [];
      const latencyData = data?.metrics?.latency ?? { p50: 0, p95: 0, p99: 0, count: 0 };
      const toolsData = Array.isArray(data?.metrics?.tools) ? data.metrics.tools : [];
      const tokenSummaryData = data?.metrics?.tokenSummary ?? {
        totalInput: 0, totalOutput: 0, totalTokens: 0,
        activeInput: 0, activeOutput: 0, activeTokens: 0,
        archivedInput: 0, archivedOutput: 0, archivedTokens: 0,
        nearLimitCount: 0, limitReachedCount: 0, sessionCount: 0,
      };
      const tokenUsageData = Array.isArray(data?.metrics?.tokenUsage) ? data.metrics.tokenUsage : [];
      const tokenByKeyData = Array.isArray(data?.metrics?.tokenByKey) ? data.metrics.tokenByKey : [];
      const archiveCountMap = data?.metrics?.archiveCountMap ?? {};
      setHealth(healthData);
      setStatusOverview(statusData);
      setSessions(sessionsData);
      setRecentLogs(logsData);
      setMetrics({
        latency: latencyData || { p50: 0, p95: 0, p99: 0, count: 0 },
        tools: Array.isArray(toolsData) ? toolsData : [],
        tokenSummary: tokenSummaryData || {},
        tokenUsage: Array.isArray(tokenUsageData) ? tokenUsageData : [],
        tokenByKey: Array.isArray(tokenByKeyData) ? tokenByKeyData : [],
        archiveCount: archiveCountMap && typeof archiveCountMap === 'object'
          ? Object.values(archiveCountMap).reduce((s, n) => s + (Number(n) || 0), 0)
          : 0,
      });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setInFlight(false);
    }
  }, [inFlight]);

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
    }, 10000);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [fetchData]);
 

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <Spin size="large" />
      </div>
    );
  }

  const activeSessions = sessions.filter((s) => s.status === 'active').length;
  const idleSessions = sessions.filter((s) => s.status === 'idle').length;
  const completedSessions = sessions.filter((s) => s.status === 'completed').length;
  const totalSessions = sessions.length;
  const archivedCount = metrics.archiveCount ?? 0;
  const sessionDistribution = [
    { name: intl.formatMessage({ id: 'dashboard.active' }), value: activeSessions, color: token.colorSuccess },
    { name: intl.formatMessage({ id: 'dashboard.idle' }), value: idleSessions, color: token.colorWarning },
    { name: intl.formatMessage({ id: 'dashboard.completed' }), value: completedSessions, color: token.colorPrimary },
    { name: intl.formatMessage({ id: 'dashboard.archived' }), value: archivedCount, color: token.colorTextSecondary },
  ].filter((i) => i.value > 0);

  const toolChartData = (metrics.tools || []).slice(0, 8).map((t) => ({
    name: t.tool?.length > 15 ? `${t.tool.slice(0, 15)}…` : t.tool,
    count: t.count,
  }));

  const colTitle = (id, descId) => (
    <Tooltip title={intl.formatMessage({ id: descId })}>
      <span style={{ cursor: 'help' }}>{intl.formatMessage({ id })}</span>
    </Tooltip>
  );
  const tokenCols = [
    { title: '#', width: 48, render: (_, __, i) => i + 1 },
    { title: colTitle('dashboard.colType', 'dashboard.colTypeDesc'), dataIndex: 'sessionKey', width: 100, render: (_, row) => tokenUsageRowDisplay(row, sessions).typeLabel },
    {
      title: colTitle('dashboard.colUser', 'dashboard.colUserDesc'),
      render: (_, row) => {
        const { userLabel, detailId, sessionKeyFull } = tokenUsageRowDisplay(row, sessions);
        return detailId ? (
          <Link to={`/sessions/${encodeURIComponent(detailId)}`} title={sessionKeyFull}>
            {userLabel}
          </Link>
        ) : (
          userLabel
        );
      },
    },
    { title: colTitle('dashboard.colTotal', 'dashboard.colTotalDesc'), dataIndex: 'totalTokens', render: (v) => v?.toLocaleString() },
    { title: colTitle('dashboard.colIn', 'dashboard.colInDesc'), dataIndex: 'inputTokens', render: (v) => v?.toLocaleString() },
    { title: colTitle('dashboard.colOut', 'dashboard.colOutDesc'), dataIndex: 'outputTokens', render: (v) => v?.toLocaleString() },
    {
      title: colTitle('dashboard.colPct', 'dashboard.colPctDesc'),
      render: (_, row) =>
        row.avgUtilization != null ? (
          <Progress percent={Math.round(row.avgUtilization)} size="small" status={row.avgUtilization > 80 ? 'exception' : 'normal'} />
        ) : (
          '—'
        ),
    },
  ];

  return (
    <div style={{ paddingBottom: 24 }}>
      <Typography.Title level={4} style={{ marginBottom: 20 }}>{intl.formatMessage({ id: 'dashboard.title' })}</Typography.Title>
      <Row gutter={[8, 8]}>
        <Col xs={12} sm={8} md={6} lg={4} xl={4}>
          <Card size="small" bodyStyle={{ padding: '10px 12px' }}>
            <Statistic title={<Tooltip title={intl.formatMessage({ id: 'dashboard.systemStatusDesc' })}><span style={{ cursor: 'help' }}>{intl.formatMessage({ id: 'dashboard.systemStatus' })}</span></Tooltip>} value={health?.status || '—'} valueStyle={{ fontSize: 14 }} />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={6} lg={4} xl={4}>
          <Card size="small" bodyStyle={{ padding: '10px 12px' }}>
            <Statistic title={<Tooltip title={intl.formatMessage({ id: 'dashboard.totalSessionsDesc' })}><span style={{ cursor: 'help' }}>{intl.formatMessage({ id: 'dashboard.totalSessions' })}</span></Tooltip>} value={totalSessions} valueStyle={{ fontSize: 14 }} />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={6} lg={4} xl={4}>
          <Tooltip title={intl.formatMessage({ id: 'dashboard.activeDesc' })} overlayInnerStyle={{ padding: '12px 16px' }}>
            <Card size="small" bodyStyle={{ padding: '10px 12px' }}>
              <Statistic title={intl.formatMessage({ id: 'dashboard.active' })} value={activeSessions} valueStyle={{ color: token.colorSuccess, fontSize: 14 }} />
            </Card>
          </Tooltip>
        </Col>
        <Col xs={12} sm={8} md={6} lg={4} xl={4}>
          <Tooltip title={intl.formatMessage({ id: 'dashboard.idleDesc' })} overlayInnerStyle={{ padding: '12px 16px' }}>
            <Card size="small" bodyStyle={{ padding: '10px 12px' }}>
              <Statistic title={intl.formatMessage({ id: 'dashboard.idle' })} value={idleSessions} valueStyle={{ color: token.colorWarning, fontSize: 14 }} />
            </Card>
          </Tooltip>
        </Col>
        <Col xs={12} sm={8} md={6} lg={4} xl={4}>
          <Tooltip title={intl.formatMessage({ id: 'dashboard.archivedDesc' })} overlayInnerStyle={{ padding: '12px 16px' }}>
            <Card size="small" bodyStyle={{ padding: '10px 12px' }}>
              <Statistic
                title={intl.formatMessage({ id: 'dashboard.archived' })}
                value={metrics.archiveCount ?? 0}
                valueStyle={{ color: token.colorTextSecondary, fontSize: 14 }}
              />
            </Card>
          </Tooltip>
        </Col>
      </Row>

      <Row gutter={[12, 12]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={16}>
          <GatewayStatusCard overview={statusOverview} intl={intl} />
        </Col>
        <Col xs={24} lg={8}>
          <Card
            title={
              <Tooltip title={intl.formatMessage({ id: 'dashboard.healthDesc' })}>
                <span style={{ cursor: 'help' }}>{intl.formatMessage({ id: 'dashboard.health' })}</span>
              </Tooltip>
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
          title={
            <Tooltip title={intl.formatMessage({ id: 'dashboard.latencyDesc' })}>
              <span style={{ cursor: 'help' }}>{intl.formatMessage({ id: 'dashboard.latency' })}</span>
            </Tooltip>
          }
          size="small"
          style={{ marginTop: 16 }}
          bodyStyle={{ padding: '12px 16px' }}
        >
          <Row gutter={12}>
            <Col span={6}><Statistic title={<Tooltip title={intl.formatMessage({ id: 'dashboard.latencyP50Desc' })}><span style={{ cursor: 'help' }}>{intl.formatMessage({ id: 'dashboard.latencyP50' })}</span></Tooltip>} suffix="ms" value={metrics.latency.p50} /></Col>
            <Col span={6}><Statistic title={<Tooltip title={intl.formatMessage({ id: 'dashboard.latencyP95Desc' })}><span style={{ cursor: 'help' }}>{intl.formatMessage({ id: 'dashboard.latencyP95' })}</span></Tooltip>} suffix="ms" value={metrics.latency.p95} /></Col>
            <Col span={6}><Statistic title={<Tooltip title={intl.formatMessage({ id: 'dashboard.latencyP99Desc' })}><span style={{ cursor: 'help' }}>{intl.formatMessage({ id: 'dashboard.latencyP99' })}</span></Tooltip>} suffix="ms" value={metrics.latency.p99} /></Col>
            <Col span={6}><Statistic title={<Tooltip title={intl.formatMessage({ id: 'dashboard.latencyCountDesc' })}><span style={{ cursor: 'help' }}>{intl.formatMessage({ id: 'dashboard.latencyCount' })}</span></Tooltip>} value={metrics.latency.count} /></Col>
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
                  title={
                    <Tooltip title={intl.formatMessage({ id: 'dashboard.tokenActiveDesc' })}>
                      <span style={{ cursor: 'help' }}>{intl.formatMessage({ id: 'dashboard.tokenSummaryActive' })}</span>
                    </Tooltip>
                  }
                  size="small"
                  bodyStyle={{ padding: '12px 16px' }}
                >
                  <Row gutter={[8, 0]}>
                    <Col span={8}><Statistic title={<Tooltip title={intl.formatMessage({ id: 'dashboard.tokenInputDesc' })}><span style={{ cursor: 'help' }}>{intl.formatMessage({ id: 'dashboard.tokenInput' })}</span></Tooltip>} value={ts.activeInput ?? 0} valueStyle={{ fontSize: 14 }} /></Col>
                    <Col span={8}><Statistic title={<Tooltip title={intl.formatMessage({ id: 'dashboard.tokenOutputDesc' })}><span style={{ cursor: 'help' }}>{intl.formatMessage({ id: 'dashboard.tokenOutput' })}</span></Tooltip>} value={ts.activeOutput ?? 0} valueStyle={{ fontSize: 14 }} /></Col>
                    <Col span={8}><Statistic title={<Tooltip title={intl.formatMessage({ id: 'dashboard.tokenTotalDesc' })}><span style={{ cursor: 'help' }}>{intl.formatMessage({ id: 'dashboard.tokenTotal' })}</span></Tooltip>} value={ts.activeTokens ?? 0} valueStyle={{ fontSize: 14 }} /></Col>
                  </Row>
                </Card>
              </Col>
              <Col xs={24} md={12}>
                <Card
                  title={
                    <Tooltip title={intl.formatMessage({ id: 'dashboard.tokenArchivedDesc' })}>
                      <span style={{ cursor: 'help' }}>{intl.formatMessage({ id: 'dashboard.tokenSummaryArchived' })}</span>
                    </Tooltip>
                  }
                  size="small"
                  bodyStyle={{ padding: '12px 16px' }}
                >
                  <Row gutter={[8, 0]}>
                    <Col span={8}><Statistic title={<Tooltip title={intl.formatMessage({ id: 'dashboard.tokenInputDesc' })}><span style={{ cursor: 'help' }}>{intl.formatMessage({ id: 'dashboard.tokenInput' })}</span></Tooltip>} value={ts.archivedInput ?? 0} valueStyle={{ fontSize: 14 }} /></Col>
                    <Col span={8}><Statistic title={<Tooltip title={intl.formatMessage({ id: 'dashboard.tokenOutputDesc' })}><span style={{ cursor: 'help' }}>{intl.formatMessage({ id: 'dashboard.tokenOutput' })}</span></Tooltip>} value={ts.archivedOutput ?? 0} valueStyle={{ fontSize: 14 }} /></Col>
                    <Col span={8}><Statistic title={<Tooltip title={intl.formatMessage({ id: 'dashboard.tokenTotalDesc' })}><span style={{ cursor: 'help' }}>{intl.formatMessage({ id: 'dashboard.tokenTotal' })}</span></Tooltip>} value={ts.archivedTokens ?? 0} valueStyle={{ fontSize: 14 }} /></Col>
                  </Row>
                </Card>
              </Col>
            </Row>
          </>
        );
      })()}

      <Row gutter={[12, 12]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={12}>
          <Card
            title={
              <Tooltip title={intl.formatMessage({ id: 'dashboard.sessionPieDesc' })}>
                <span style={{ cursor: 'help' }}>{intl.formatMessage({ id: 'dashboard.sessionPie' })}</span>
              </Tooltip>
            }
            size="small"
            bodyStyle={{ padding: '12px 16px' }}
          >
            {sessionDistribution.length ? (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={sessionDistribution} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" label>
                    {sessionDistribution.map((e, i) => (
                      <Cell key={i} fill={e.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <Typography.Text type="secondary">—</Typography.Text>
            )}
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card
            title={
              <Tooltip title={intl.formatMessage({ id: 'dashboard.toolsTopDesc' })}>
                <span style={{ cursor: 'help' }}>{intl.formatMessage({ id: 'dashboard.toolsTop' })}</span>
              </Tooltip>
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

      {(metrics.tokenUsage?.length > 0 || (metrics.tokenByKey?.length > 0 && metrics.tokenByKey.some(r => (r.archivedTokens || 0) > 0))) && (
        <Row gutter={[12, 12]} style={{ marginTop: 16 }}>
          {metrics.tokenUsage?.length > 0 && (
            <Col xs={24} lg={12}>
              <Card
                title={
                  <Tooltip title={intl.formatMessage({ id: 'dashboard.tokenTopActiveDesc' })}>
                    <span style={{ cursor: 'help' }}>{intl.formatMessage({ id: 'dashboard.tokenTopActive' })}</span>
                  </Tooltip>
                }
                size="small"
                bodyStyle={{ padding: '12px 16px' }}
              >
                <Table rowKey="sessionKey" size="small" pagination={false} dataSource={metrics.tokenUsage.slice(0, 10)} columns={tokenCols} scroll={{ x: true }} />
              </Card>
            </Col>
          )}
          {metrics.tokenByKey?.length > 0 && (() => {
            const archivedTop = metrics.tokenByKey.filter(r => (r.archivedTokens || 0) > 0).slice(0, 10);
            return archivedTop.length > 0 ? (
              <Col xs={24} lg={12}>
                <Card
                  title={
                    <Tooltip title={intl.formatMessage({ id: 'dashboard.tokenTopArchivedDesc' })}>
                      <span style={{ cursor: 'help' }}>{intl.formatMessage({ id: 'dashboard.tokenTopArchived' })}</span>
                    </Tooltip>
                  }
                  size="small"
                  bodyStyle={{ padding: '12px 16px' }}
                >
                  <Table
                    rowKey="sessionKey"
                    size="small"
                    pagination={false}
                    dataSource={archivedTop}
                    columns={[
                      { title: '#', width: 48, render: (_, __, i) => i + 1 },
                      { title: colTitle('dashboard.colSession', 'dashboard.colSessionDesc'), dataIndex: 'sessionKey', ellipsis: true, render: (v) => <Typography.Text code style={{ fontSize: 12 }}>{v?.length > 30 ? `${v.slice(0, 15)}…${v.slice(-12)}` : v}</Typography.Text> },
                      { title: colTitle('dashboard.colToken', 'dashboard.colTokenDesc'), dataIndex: 'archivedTokens', render: (v) => v?.toLocaleString() },
                      { title: colTitle('dashboard.colArchivedCount', 'dashboard.colArchivedCountDesc'), dataIndex: 'archivedCount', width: 60, render: (v) => v ?? 0 },
                      { title: '', width: 80, render: (_, r) => r.sessionId ? <Link to={`/sessions/${encodeURIComponent(r.sessionId)}`}>{intl.formatMessage({ id: 'common.detail' })}</Link> : null },
                    ]}
                    scroll={{ x: true }}
                  />
                </Card>
              </Col>
            ) : null;
          })()}
        </Row>
      )}

      <Row gutter={[12, 12]} style={{ marginTop: 16 }}>
        <Col xs={24}>
          <Card
            title={
              <Tooltip title={intl.formatMessage({ id: 'dashboard.recentSessionsDesc' })}>
                <span style={{ cursor: 'help' }}>{intl.formatMessage({ id: 'dashboard.recentSessions' })}</span>
              </Tooltip>
            }
            size="small"
            extra={<Link to="/sessions">{intl.formatMessage({ id: 'dashboard.viewAll' })}</Link>}
            bodyStyle={{ padding: '12px 16px' }}
          >
            <Table
              size="small"
              pagination={false}
              dataSource={sessions.slice(0, 5)}
              rowKey="sessionId"
              columns={[
                { title: colTitle('dashboard.colType', 'dashboard.colTypeDesc'), render: (_, r) => r.typeLabel || inferSessionTypeLabel(r.sessionKey, r.sessionId) },
                {
                  title: 'ID',
                  render: (_, r) => <Link to={`/sessions/${r.sessionId}`}>{String(r.sessionId).slice(0, 10)}…</Link>,
                },
                {
                  title: colTitle('dashboard.colUser', 'dashboard.colUserDesc'),
                  render: (_, r) =>
                    (r.typeLabel === 'heartbeat' || r.typeLabel === 'cron' || r.typeLabel === 'boot') ? r.typeLabel : r.user || '—',
                },
                { title: colTitle('dashboard.colStatus', 'dashboard.colStatusDesc'), dataIndex: 'status' },
                {
                  title: colTitle('dashboard.colLast', 'dashboard.colLastDesc'),
                  render: (_, r) => new Date(r.lastActive).toLocaleString(intl.locale),
                },
              ]}
            />
          </Card>
        </Col>
      </Row>

      <Card
        title={
          <Tooltip title={intl.formatMessage({ id: 'dashboard.recentLogsDesc' })}>
            <span style={{ cursor: 'help' }}>{intl.formatMessage({ id: 'dashboard.recentLogs' })}</span>
          </Tooltip>
        }
        size="small"
        style={{ marginTop: 16 }}
        extra={<Link to="/logs">{intl.formatMessage({ id: 'dashboard.fullLogs' })}</Link>}
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
