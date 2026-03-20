import React, { useState, useEffect } from 'react';
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
} from 'antd';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { useIntl } from 'react-intl';
import { metricsApi } from '../api';
import { inferSessionTypeLabel } from '../utils/session-user';

const THRESHOLD_COLORS = {
  normal: '#52c41a',
  warning: '#faad14',
  serious: '#fa8c16',
  critical: '#ff4d4f',
  limit: '#cf1322',
};

function userLabelForTokenRow(usageRow, sessionList) {
  const ls = sessionList.find((s) => s.sessionKey === usageRow.sessionKey);
  const typeLabel = ls?.typeLabel || inferSessionTypeLabel(usageRow.sessionKey, usageRow.sessionId);
  const sys = ['heartbeat', 'cron', 'boot'].includes(typeLabel);
  if (ls) return sys ? typeLabel : ls.user || 'unknown';
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
  const timeRangeMs = 86400000; // 24h

  const fetchData = async (showToast = false) => {
    if (showToast) {
      setRefreshing(true);
      message.loading({ content: '正在刷新 Token 监控...', key: 'token-monitor-refresh', duration: 0 });
    }
    try {
      const [usageRes, alertsRes, listRes, activeByKeyRes, archivedByKeyRes] = await Promise.allSettled([
        fetch('/api/sessions/token-usage?page=1&pageSize=200'),
        fetch('/api/sessions/token-alerts/history'),
        fetch('/api/sessions?page=1&pageSize=200'),
        metricsApi.getTokenUsageBySessionKeyPaged({ timeRangeMs, page: activePage, pageSize: 20 }),
        metricsApi.getTokenUsageBySessionKeyPaged({ timeRangeMs, page: archivedPage, pageSize: 20 }),
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

  const topConsumptionSessions = [...sessions]
    .sort((a, b) => b.consumptionRate - a.consumptionRate)
    .slice(0, 10)
    .map((s) => ({
      name: userLabelForTokenRow(s, sessionList).length > 14
        ? `${userLabelForTokenRow(s, sessionList).slice(0, 14)}…`
        : userLabelForTokenRow(s, sessionList),
      nameTip: s.sessionKey,
      rate: s.consumptionRate,
    }));

  const highUtil = sessions.filter((s) => s.utilization > 50);

  if (loading) {
    return <Spin style={{ display: 'block', margin: 48 }} />;
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <Typography.Title level={4} style={{ margin: 0 }}>{intl.formatMessage({ id: 'token.title' })}</Typography.Title>
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
        <Col xs={8} sm={4}><Card size="small"><Statistic title={intl.formatMessage({ id: 'token.sessionsCount' })} value={sessions.length} /></Card></Col>
        <Col xs={8} sm={4}><Card size="small"><Statistic title="OK" value={thresholdDistribution[0].value} valueStyle={{ color: THRESHOLD_COLORS.normal }} /></Card></Col>
        <Col xs={8} sm={4}><Card size="small"><Statistic title="Warn" value={thresholdDistribution[1].value} valueStyle={{ color: THRESHOLD_COLORS.warning }} /></Card></Col>
        <Col xs={12} sm={6}><Card size="small"><Statistic title="Serious/Crit" value={thresholdDistribution[2].value + thresholdDistribution[3].value} valueStyle={{ color: THRESHOLD_COLORS.critical }} /></Card></Col>
        <Col xs={12} sm={6}><Card size="small"><Statistic title="Limit" value={thresholdDistribution[4].value} /></Card></Col>
      </Row>

      {alerts.length > 0 && (
        <Card title="Alerts" style={{ marginBottom: 16 }}>
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
          <Card title="Threshold">
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
        {topConsumptionSessions.length > 0 && (
          <Col xs={24} lg={12}>
            <Card title="Top rate (tok/min)">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={topConsumptionSessions}>
                  <CartesianGrid strokeDasharray="3 3" stroke={token.colorBorderSecondary} />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: token.colorTextSecondary }} height={60} angle={-20} textAnchor="end" />
                  <YAxis tick={{ fill: token.colorTextSecondary }} />
                  <RechartsTooltip labelFormatter={(_, p) => p?.[0]?.payload?.nameTip || ''} contentStyle={{ background: token.colorBgElevated }} />
                  <Bar dataKey="rate" fill={token.colorPrimary} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </Col>
        )}
      </Row>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} lg={12}>
          <Card title={intl.formatMessage({ id: 'token.tableActive' })}>
            <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 8, fontSize: 12 }}>{intl.formatMessage({ id: 'token.tableActiveDesc' })}</Typography.Text>
            <Table
              rowKey={(r) => r.sessionKey}
              size="small"
              scroll={{ x: true }}
              pagination={false}
              dataSource={[...bySessionKey].filter((r) => (r.activeTokens || 0) > 0)}
              columns={[
                { title: 'Type', width: 90, render: (_, r) => <Tag>{sessionList.find((s) => s.sessionKey === r.sessionKey)?.typeLabel || inferSessionTypeLabel(r.sessionKey)}</Tag> },
                { title: 'Session', width: 240, ellipsis: true, render: (_, r) => <Typography.Text code style={{ fontSize: 12 }} title={r.sessionKey}>{r.sessionKey?.length > 28 ? `${r.sessionKey.slice(0, 14)}…${r.sessionKey.slice(-12)}` : r.sessionKey}</Typography.Text> },
                { title: 'Token', dataIndex: 'activeTokens', width: 90, render: (v) => v?.toLocaleString(), sorter: (a, b) => (a.activeTokens ?? 0) - (b.activeTokens ?? 0) },
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
          <Card title={intl.formatMessage({ id: 'token.tableArchived' })}>
            <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 8, fontSize: 12 }}>{intl.formatMessage({ id: 'token.tableArchivedDesc' })}</Typography.Text>
            <Table
              rowKey={(r) => r.sessionKey}
              size="small"
              scroll={{ x: true }}
              pagination={false}
              dataSource={[...bySessionKey].filter((r) => (r.archivedTokens || 0) > 0)}
              columns={[
                { title: 'Type', width: 90, render: (_, r) => <Tag>{sessionList.find((s) => s.sessionKey === r.sessionKey)?.typeLabel || inferSessionTypeLabel(r.sessionKey)}</Tag> },
                { title: 'Session', width: 240, ellipsis: true, render: (_, r) => <Typography.Text code style={{ fontSize: 12 }} title={r.sessionKey}>{r.sessionKey?.length > 28 ? `${r.sessionKey.slice(0, 14)}…${r.sessionKey.slice(-12)}` : r.sessionKey}</Typography.Text> },
                { title: 'Token', dataIndex: 'archivedTokens', width: 90, render: (v) => v?.toLocaleString(), sorter: (a, b) => (a.archivedTokens ?? 0) - (b.archivedTokens ?? 0) },
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
        <Card title="> 50% utilization">
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
              { title: 'Used', dataIndex: 'totalTokens', render: (v) => v?.toLocaleString() },
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
