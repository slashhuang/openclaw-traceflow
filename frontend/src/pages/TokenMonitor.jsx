import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Card,
  Row,
  Col,
  Statistic,
  Typography,
  Spin,
  Switch,
  Button,
  Table,
  Tag,
  theme,
  message,
  Pagination,
  Tooltip,
} from 'antd';
import {
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { useIntl } from 'react-intl';
import { metricsApi } from '../api';
import { inferSessionTypeLabel, formatSessionParticipantDisplay } from '../utils/session-user';
import { aggregateStaleAndEstimated, buildTopNDualSeries } from '../utils/token-dual-track';
import TokenMetricHint from '../components/TokenMetricHint';
import SectionScopeHint from '../components/SectionScopeHint';

const THRESHOLD_COLORS = {
  normal: '#52c41a',
  warning: '#faad14',
  serious: '#fa8c16',
  critical: '#ff4d4f',
  limit: '#cf1322',
};

function formatCompactRate(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return String(n);
  return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

function userLabelForTokenRow(usageRow, sessionList) {
  const ls = sessionList.find((s) => s.sessionKey === usageRow.sessionKey);
  if (ls) return formatSessionParticipantDisplay(ls);
  const id = usageRow.sessionId || '';
  const tail = id.includes('/') ? id.split('/').pop() : id;
  return tail && tail.length >= 6 ? `${tail.slice(0, 8)}…` : usageRow.sessionKey?.slice(0, 14) || '—';
}

export default function TokenMonitor() {
  const intl = useIntl();
  const { token } = theme.useToken();
  const [sessions, setSessions] = useState([]);
  const [sessionList, setSessionList] = useState([]);
  const [bySessionKey, setBySessionKey] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [activePage, setActivePage] = useState(1);
  const [archivedPage, setArchivedPage] = useState(1);
  const [activeTotal, setActiveTotal] = useState(0);
  const [archivedTotal, setArchivedTotal] = useState(0);
  const [tokenSummary, setTokenSummary] = useState(null);
  const [tokenByKeyFull, setTokenByKeyFull] = useState([]);
  const timeRangeMs = 86400000; // 24h

  const overviewStats = useMemo(
    () =>
      aggregateStaleAndEstimated({
        sessionList,
        tokenByKeyRows: tokenByKeyFull,
        tokenSummary,
      }),
    [sessionList, tokenSummary, tokenByKeyFull],
  );

  const ts = tokenSummary || {};

  const fetchData = async (showToast = false) => {
    if (showToast) {
      setRefreshing(true);
      message.loading({ content: '正在刷新 Token 监控...', key: 'token-monitor-refresh', duration: 0 });
    }
    try {
      const [
        usageRes,
        alertsRes,
        listRes,
        activeByKeyRes,
        archivedByKeyRes,
        tokenSummaryRes,
        tokenByKeyFullRes,
      ] = await Promise.allSettled([
        fetch('/api/sessions/token-usage?page=1&pageSize=200'),
        fetch('/api/sessions/token-alerts/history'),
        fetch('/api/sessions?page=1&pageSize=200'),
        metricsApi.getTokenUsageBySessionKeyPaged({ timeRangeMs, page: activePage, pageSize: 20 }),
        metricsApi.getTokenUsageBySessionKeyPaged({ timeRangeMs, page: archivedPage, pageSize: 20 }),
        metricsApi.getTokenSummary(timeRangeMs),
        metricsApi.getTokenUsageBySessionKey(timeRangeMs),
      ]);
      const usageData = usageRes.status === 'fulfilled' && usageRes.value?.ok ? await usageRes.value.json() : { items: [] };
      setSessions(Array.isArray(usageData?.items) ? usageData.items : []);
      setAlerts(alertsRes.status === 'fulfilled' && alertsRes.value?.ok ? await alertsRes.value.json() : []);
      const list = listRes.status === 'fulfilled' && listRes.value?.ok ? await listRes.value.json() : [];
      setSessionList(Array.isArray(list?.items) ? list.items : (Array.isArray(list) ? list : []));
      const activeByKey = activeByKeyRes.status === 'fulfilled' ? activeByKeyRes.value : null;
      const archivedByKey = archivedByKeyRes.status === 'fulfilled' ? archivedByKeyRes.value : null;
      const merged = [...(activeByKey?.items || []), ...(archivedByKey?.items || [])];
      setBySessionKey(merged);
      setActiveTotal(activeByKey?.total || 0);
      setArchivedTotal(archivedByKey?.total || 0);
      if (tokenSummaryRes.status === 'fulfilled' && tokenSummaryRes.value) {
        setTokenSummary(tokenSummaryRes.value);
      }
      if (tokenByKeyFullRes.status === 'fulfilled' && Array.isArray(tokenByKeyFullRes.value)) {
        setTokenByKeyFull(tokenByKeyFullRes.value);
      }
      if (showToast) {
        message.success({ content: 'Token 监控已刷新', key: 'token-monitor-refresh' });
      }
    } catch (e) {
      console.error(e);
      if (showToast) {
        message.error({ content: e?.message || '刷新失败', key: 'token-monitor-refresh' });
      }
    } finally {
      setLoading(false);
      if (showToast) {
        setRefreshing(false);
      }
    }
  };

  useEffect(() => {
    fetchData();
  }, [activePage, archivedPage]);

  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(fetchData, 30000);
    return () => clearInterval(t);
  }, [autoRefresh, activePage, archivedPage]);

  const thresholdDistribution = [
    { name: 'normal', value: sessions.filter((s) => s.threshold === 'normal').length, color: THRESHOLD_COLORS.normal },
    { name: 'warning', value: sessions.filter((s) => s.threshold === 'warning').length, color: THRESHOLD_COLORS.warning },
    { name: 'serious', value: sessions.filter((s) => s.threshold === 'serious').length, color: THRESHOLD_COLORS.serious },
    { name: 'critical', value: sessions.filter((s) => s.threshold === 'critical').length, color: THRESHOLD_COLORS.critical },
    { name: 'limit', value: sessions.filter((s) => s.threshold === 'limit').length, color: THRESHOLD_COLORS.limit },
  ];

  const topDualChartData = useMemo(() => {
    const series = buildTopNDualSeries(sessions, sessionList, { topN: 10 });
    return series.map((row) => {
      const u = { sessionKey: row.sessionKey, sessionId: row.sessionId };
      const label = userLabelForTokenRow(u, sessionList);
      const displayShort = label.length > 14 ? `${label.slice(0, 14)}…` : label;
      const tail = (row.sessionKey || '').replace(/.*\//, '').slice(-6);
      const name = tail ? `${displayShort} (${tail})` : displayShort;
      return {
        name,
        nameTip: row.sessionKey,
        recordedTokens: row.recordedTokens,
        estimatedTokens: row.estimatedTokens,
      };
    });
  }, [sessions, sessionList]);

  const highUtil = sessions.filter((s) => s.utilization > 50);

  if (loading) {
    return <Spin style={{ display: 'block', margin: 48 }} />;
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Typography.Title level={4} style={{ margin: 0 }}>{intl.formatMessage({ id: 'token.title' })}</Typography.Title>
            <SectionScopeHint intl={intl} messageId="token.pageScopeDesc" />
          </div>
          <Typography.Text type="secondary">{intl.formatMessage({ id: 'token.subtitle' })}</Typography.Text>
          <br />
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>{intl.formatMessage({ id: 'token.costHint' })}</Typography.Text>
        </div>
        <span>
          <Switch checked={autoRefresh} onChange={setAutoRefresh} /> {intl.formatMessage({ id: 'token.autoRefresh' })}{' '}
          <Button onClick={() => fetchData(true)} style={{ marginLeft: 8 }} loading={refreshing}>{intl.formatMessage({ id: 'common.refresh' })}</Button>
        </span>
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} lg={12}>
          <Card
            size="small"
            title={intl.formatMessage({ id: 'token.dualTrack.recordedTitle' })}
            extra={<SectionScopeHint intl={intl} messageId="token.dualTrack.recordedDesc" />}
          >
            <Row gutter={[8, 12]}>
              <Col span={24}>
                <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
                  {intl.formatMessage({ id: 'token.dualTrack.activeBlock' })}
                </Typography.Text>
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
              </Col>
              <Col span={24}>
                <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
                  {intl.formatMessage({ id: 'token.dualTrack.archivedBlock' })}
                </Typography.Text>
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
                    />
                  </Col>
                </Row>
              </Col>
            </Row>
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card
            size="small"
            title={intl.formatMessage({ id: 'token.dualTrack.estimatedTitle' })}
            extra={<SectionScopeHint intl={intl} messageId="token.dualTrack.estimatedDesc" />}
          >
            <Row gutter={[8, 12]}>
              <Col xs={12} sm={8}>
                <Statistic
                  title={
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      {intl.formatMessage({ id: 'token.overviewStaleCount' })}
                      <SectionScopeHint intl={intl} messageId="token.overviewStaleCountDesc" />
                    </span>
                  }
                  value={overviewStats.staleCount}
                />
              </Col>
              <Col xs={12} sm={8}>
                <Statistic
                  title={
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      {intl.formatMessage({ id: 'token.overviewStaleWithActive' })}
                      <SectionScopeHint intl={intl} messageId="token.overviewStaleWithActiveDesc" />
                    </span>
                  }
                  value={overviewStats.staleWithActive}
                />
              </Col>
              <Col xs={12} sm={8}>
                <Statistic
                  title={
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      {intl.formatMessage({ id: 'token.overviewEstimatedSum' })}
                      <SectionScopeHint intl={intl} messageId="token.overviewEstimatedSumDesc" />
                    </span>
                  }
                  value={formatCompactRate(overviewStats.estimatedSum)}
                />
              </Col>
              <Col span={24}>
                <Typography.Paragraph type="secondary" style={{ marginBottom: 0, fontSize: 12 }}>
                  {intl.formatMessage({ id: 'token.dualTrack.formulaHint' })}
                </Typography.Paragraph>
              </Col>
            </Row>
          </Card>
        </Col>
      </Row>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {intl.formatMessage({ id: 'token.kpiSectionTitle' })}
        </Typography.Text>
        <SectionScopeHint intl={intl} messageId="token.kpiRowDesc" />
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={8} sm={4}>
          <Card size="small">
            <Statistic
              title={
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  {intl.formatMessage({ id: 'token.sessionsCount' })}
                  <SectionScopeHint intl={intl} messageId="token.sessionsCountDesc" />
                </span>
              }
              value={sessions.length}
            />
          </Card>
        </Col>
        <Col xs={8} sm={4}><Card size="small"><Statistic title="OK" value={thresholdDistribution[0].value} valueStyle={{ color: THRESHOLD_COLORS.normal }} /></Card></Col>
        <Col xs={8} sm={4}><Card size="small"><Statistic title="Warn" value={thresholdDistribution[1].value} valueStyle={{ color: THRESHOLD_COLORS.warning }} /></Card></Col>
        <Col xs={12} sm={6}><Card size="small"><Statistic title="Serious/Crit" value={thresholdDistribution[2].value + thresholdDistribution[3].value} valueStyle={{ color: THRESHOLD_COLORS.critical }} /></Card></Col>
        <Col xs={12} sm={6}><Card size="small"><Statistic title="Limit" value={thresholdDistribution[4].value} /></Card></Col>
      </Row>

      {alerts.length > 0 && (
        <Card
          title={intl.formatMessage({ id: 'token.alertsTitle' })}
          extra={<SectionScopeHint intl={intl} messageId="token.alertsDesc" />}
          style={{ marginBottom: 16 }}
        >
          {alerts.slice(-5).reverse().map((a, i) => (
            <Typography.Paragraph key={i} style={{ marginBottom: 8 }}>
              <Typography.Text strong>{a.message}</Typography.Text>
              <br />
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {new Date(a.timestamp).toLocaleString(intl.locale)}
              </Typography.Text>
            </Typography.Paragraph>
          ))}
        </Card>
      )}

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} lg={12}>
          <Card
            title={intl.formatMessage({ id: 'token.thresholdPieTitle' })}
            extra={<SectionScopeHint intl={intl} messageId="token.thresholdPieDesc" />}
          >
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={thresholdDistribution} cx="50%" cy="50%" outerRadius={80} dataKey="value" label>
                  {thresholdDistribution.map((e, i) => (
                    <Cell key={i} fill={e.color} />
                  ))}
                </Pie>
                <RechartsTooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </Card>
        </Col>
        {topDualChartData.length > 0 && (
          <Col xs={24} lg={12}>
            <Card
              title={intl.formatMessage({ id: 'token.chartTopRateDualLine' })}
              extra={<SectionScopeHint intl={intl} messageId="token.chartTopRateDesc" />}
            >
              <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 8, fontSize: 12 }}>
                {intl.formatMessage({ id: 'token.chartTopRateDualLineDesc' })}
              </Typography.Text>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={topDualChartData} margin={{ top: 8, right: 12, left: 16, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={token.colorBorderSecondary} />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 10, fill: token.colorTextSecondary }}
                    height={72}
                    interval={0}
                    angle={-28}
                    textAnchor="end"
                    tickMargin={8}
                  />
                  <YAxis
                    tick={{ fill: token.colorTextSecondary, fontSize: 11 }}
                    tickFormatter={formatCompactRate}
                    width={58}
                  />
                  <RechartsTooltip
                    labelFormatter={(_, p) => p?.[0]?.payload?.nameTip || ''}
                    formatter={(value, name) => [
                      value == null || (typeof value === 'number' && Number.isNaN(value))
                        ? '—'
                        : formatCompactRate(typeof value === 'number' ? value : Number(value)),
                      name,
                    ]}
                    contentStyle={{ background: token.colorBgElevated }}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="recordedTokens"
                    name={intl.formatMessage({ id: 'token.chartSeriesRecorded' })}
                    stroke={token.colorPrimary}
                    dot={{ r: 2 }}
                    strokeWidth={2}
                  />
                  <Line
                    type="monotone"
                    dataKey="estimatedTokens"
                    name={intl.formatMessage({ id: 'token.chartSeriesEstimated' })}
                    stroke={token.colorSuccess}
                    dot={{ r: 2 }}
                    strokeWidth={2}
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
            </Card>
          </Col>
        )}
      </Row>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} lg={12}>
          <Card
            title={intl.formatMessage({ id: 'token.tableActive' })}
            extra={<SectionScopeHint intl={intl} messageId="token.tableActiveDesc" />}
          >
            <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 8, fontSize: 12 }}>{intl.formatMessage({ id: 'token.tableActiveDesc' })}</Typography.Text>
            <Table
              rowKey={(r) => r.sessionKey}
              size="small"
              scroll={{ x: true }}
              pagination={false}
              dataSource={[...bySessionKey]
                .filter((r) => (r.activeTokens || 0) > 0)
                .map((r) => {
                  const ls = sessionList.find((s) => s.sessionKey === r.sessionKey);
                  return {
                    ...r,
                    staleIndex: ls?.tokenUsageMeta?.totalTokensFresh === false,
                    estimatedTokensFromLog: ls?.estimatedTokensFromLog,
                  };
                })}
              columns={[
                {
                  title: intl.formatMessage({ id: 'token.columnStale' }),
                  width: 88,
                  render: (_, r) =>
                    r.staleIndex ? (
                      <Tag color="volcano">{intl.formatMessage({ id: 'sessions.staleIndexBadge' })}</Tag>
                    ) : (
                      '—'
                    ),
                },
                { title: 'Type', width: 90, render: (_, r) => <Tag>{sessionList.find((s) => s.sessionKey === r.sessionKey)?.typeLabel || inferSessionTypeLabel(r.sessionKey)}</Tag> },
                { title: 'Session', width: 240, ellipsis: true, render: (_, r) => <Typography.Text code style={{ fontSize: 12 }} title={r.sessionKey}>{r.sessionKey?.length > 28 ? `${r.sessionKey.slice(0, 14)}…${r.sessionKey.slice(-12)}` : r.sessionKey}</Typography.Text> },
                {
                  title: (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      {intl.formatMessage({ id: 'token.columnRecorded' })}
                      <TokenMetricHint intl={intl} />
                    </span>
                  ),
                  dataIndex: 'activeTokens',
                  width: 110,
                  render: (v) => (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      {v != null ? v.toLocaleString() : '—'}
                      <TokenMetricHint intl={intl} value={typeof v === 'number' ? v : undefined} />
                    </span>
                  ),
                  sorter: (a, b) => (a.activeTokens ?? 0) - (b.activeTokens ?? 0),
                },
                {
                  title: (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      {intl.formatMessage({ id: 'token.columnEstimatedLog' })}
                      <SectionScopeHint intl={intl} messageId="token.estimatedFromLogHint" />
                    </span>
                  ),
                  width: 108,
                  render: (_, r) =>
                    r.estimatedTokensFromLog != null ? (
                      <Tooltip title={intl.formatMessage({ id: 'token.estimatedFromLogHint' })}>
                        {r.estimatedTokensFromLog.toLocaleString()}
                      </Tooltip>
                    ) : (
                      '—'
                    ),
                },
                { title: 'Cost', width: 90, render: (_, r) => <Typography.Text code style={{ fontSize: 12 }} title={r.model || ''}>{r.estimatedCost != null ? `$${r.estimatedCost.toFixed(4)}` : '-'}</Typography.Text> },
                { title: '', width: 80, render: (_, r) => r.sessionId ? <Link to={`/sessions/${encodeURIComponent(r.sessionId)}`}>详情</Link> : null },
              ]}
            />
            <Pagination
              size="small"
              style={{ marginTop: 12, textAlign: 'right' }}
              current={activePage}
              pageSize={20}
              total={activeTotal}
              onChange={(p) => setActivePage(p)}
            />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card
            title={intl.formatMessage({ id: 'token.tableArchived' })}
            extra={<SectionScopeHint intl={intl} messageId="token.tableArchivedDesc" />}
          >
            <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 8, fontSize: 12 }}>{intl.formatMessage({ id: 'token.tableArchivedDesc' })}</Typography.Text>
            <Table
              rowKey={(r) => r.sessionKey}
              size="small"
              scroll={{ x: true }}
              pagination={false}
              dataSource={[...bySessionKey]
                .filter((r) => (r.archivedTokens || 0) > 0)
                .map((r) => {
                  const ls = sessionList.find((s) => s.sessionKey === r.sessionKey);
                  return {
                    ...r,
                    staleIndex: ls?.tokenUsageMeta?.totalTokensFresh === false,
                    estimatedTokensFromLog: ls?.estimatedTokensFromLog,
                  };
                })}
              columns={[
                {
                  title: intl.formatMessage({ id: 'token.columnStale' }),
                  width: 88,
                  render: (_, r) =>
                    r.staleIndex ? (
                      <Tag color="volcano">{intl.formatMessage({ id: 'sessions.staleIndexBadge' })}</Tag>
                    ) : (
                      '—'
                    ),
                },
                { title: 'Type', width: 90, render: (_, r) => <Tag>{sessionList.find((s) => s.sessionKey === r.sessionKey)?.typeLabel || inferSessionTypeLabel(r.sessionKey)}</Tag> },
                { title: 'Session', width: 240, ellipsis: true, render: (_, r) => <Typography.Text code style={{ fontSize: 12 }} title={r.sessionKey}>{r.sessionKey?.length > 28 ? `${r.sessionKey.slice(0, 14)}…${r.sessionKey.slice(-12)}` : r.sessionKey}</Typography.Text> },
                {
                  title: (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      {intl.formatMessage({ id: 'token.columnRecorded' })}
                      <TokenMetricHint intl={intl} />
                    </span>
                  ),
                  dataIndex: 'archivedTokens',
                  width: 110,
                  render: (v) => (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      {v != null ? v.toLocaleString() : '—'}
                      <TokenMetricHint intl={intl} value={typeof v === 'number' ? v : undefined} />
                    </span>
                  ),
                  sorter: (a, b) => (a.archivedTokens ?? 0) - (b.archivedTokens ?? 0),
                },
                {
                  title: (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      {intl.formatMessage({ id: 'token.columnEstimatedLog' })}
                      <SectionScopeHint intl={intl} messageId="token.estimatedFromLogHint" />
                    </span>
                  ),
                  width: 108,
                  render: (_, r) =>
                    r.estimatedTokensFromLog != null ? (
                      <Tooltip title={intl.formatMessage({ id: 'token.estimatedFromLogHint' })}>
                        {r.estimatedTokensFromLog.toLocaleString()}
                      </Tooltip>
                    ) : (
                      '—'
                    ),
                },
                { title: 'Cost', width: 80, render: (_, r) => <Typography.Text code style={{ fontSize: 12 }} title={r.model || ''}>{r.estimatedCost != null ? `$${r.estimatedCost.toFixed(4)}` : '-'}</Typography.Text> },
                { title: '次', dataIndex: 'archivedCount', width: 60, render: (v) => v ?? 0 },
                { title: '', width: 80, render: (_, r) => r.sessionId ? <Link to={`/sessions/${encodeURIComponent(r.sessionId)}`}>详情</Link> : null },
              ]}
            />
            <Pagination
              size="small"
              style={{ marginTop: 12, textAlign: 'right' }}
              current={archivedPage}
              pageSize={20}
              total={archivedTotal}
              onChange={(p) => setArchivedPage(p)}
            />
          </Card>
        </Col>
      </Row>

      {highUtil.length > 0 && (
        <Card
          title={intl.formatMessage({ id: 'token.highUtilTitle' })}
          extra={<SectionScopeHint intl={intl} messageId="token.highUtilDesc" />}
        >
          <Table
            rowKey={(r) => r.sessionId || r.sessionKey}
            size="small"
            scroll={{ x: true }}
            dataSource={highUtil}
            columns={[
              {
                title: 'Type',
                render: (_, r) => {
                  const tl = sessionList.find((s) => s.sessionKey === r.sessionKey)?.typeLabel || inferSessionTypeLabel(r.sessionKey);
                  return <Tag>{tl}</Tag>;
                },
              },
              {
                title: 'User',
                render: (_, r) => (
                  <Link to={`/sessions/${encodeURIComponent(r.sessionId)}`}>{userLabelForTokenRow(r, sessionList)}</Link>
                ),
              },
              {
                title: '%',
                dataIndex: 'utilization',
                render: (v, r) => (
                  <span style={{ color: THRESHOLD_COLORS[r.threshold] || undefined }}>{v}%</span>
                ),
              },
              {
                title: (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    Used
                    <TokenMetricHint intl={intl} />
                  </span>
                ),
                dataIndex: 'totalTokens',
                render: (v) => (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    {v != null ? v.toLocaleString() : '—'}
                    <TokenMetricHint intl={intl} value={typeof v === 'number' ? v : undefined} />
                  </span>
                ),
              },
              { title: 'Cost', render: (_, r) => {
                  const cost = r.estimatedCost ?? r.usageCost?.total;
                  return cost != null ? `$${cost.toFixed(4)}` : '-';
                }
              },
              { title: 'Limit', dataIndex: 'limit', render: (v) => v?.toLocaleString() || '∞' },
              { title: 'Rate', dataIndex: 'consumptionRate', render: (v) => `${v}/min` },
            ]}
          />
        </Card>
      )}
    </div>
  );
}
