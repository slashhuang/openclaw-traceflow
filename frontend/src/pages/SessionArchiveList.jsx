import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Card, Table, Typography, Button, Space, Spin, Alert } from 'antd';
import { ArrowLeftOutlined, HistoryOutlined } from '@ant-design/icons';
import { useIntl } from 'react-intl';
import { sessionsApi, extractApiErrorMessage } from '../api';
import SectionScopeHint from '../components/SectionScopeHint';
import { formatArchiveEpochLabel } from '../utils/archive-epoch';

/**
 * 某会话的全部归档轮次（*.jsonl.reset.*），独立列表页，可分页，避免 Popover 装不下。
 */
export default function SessionArchiveList() {
  const { id } = useParams();
  const intl = useIntl();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [epochs, setEpochs] = useState([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const data = await sessionsApi.getArchiveEpochs(id);
        if (!cancelled) setEpochs(Array.isArray(data) ? data : []);
      } catch (e) {
        if (!cancelled) setError(extractApiErrorMessage(e, intl.formatMessage({ id: 'sessions.archivesLoadError' })));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, intl]);

  const detailBase = `/sessions/${encodeURIComponent(id)}`;

  const columns = useMemo(
    () => [
      {
        title: intl.formatMessage({ id: 'sessions.archivesColumnTime' }),
        dataIndex: 'resetTimestamp',
        key: 'time',
        width: 220,
        render: (ts) => formatArchiveEpochLabel(ts),
      },
      {
        title: intl.formatMessage({ id: 'sessions.archivesColumnIn' }),
        dataIndex: 'inputTokens',
        key: 'in',
        width: 100,
        align: 'right',
        render: (v) => (typeof v === 'number' ? v.toLocaleString() : '—'),
      },
      {
        title: intl.formatMessage({ id: 'sessions.archivesColumnOut' }),
        dataIndex: 'outputTokens',
        key: 'out',
        width: 100,
        align: 'right',
        render: (v) => (typeof v === 'number' ? v.toLocaleString() : '—'),
      },
      {
        title: intl.formatMessage({ id: 'sessions.archivesColumnTotal' }),
        dataIndex: 'totalTokens',
        key: 'total',
        width: 120,
        align: 'right',
        render: (v) => (typeof v === 'number' ? v.toLocaleString() : '—'),
      },
      {
        title: intl.formatMessage({ id: 'sessions.column.actions' }),
        key: 'actions',
        width: 100,
        render: (_, row) => (
          <Link to={`${detailBase}?resetTimestamp=${encodeURIComponent(row.resetTimestamp)}`}>
            {intl.formatMessage({ id: 'sessions.archivesRowAction' })}
          </Link>
        ),
      },
    ],
    [intl, detailBase],
  );

  if (loading) {
    return <Spin style={{ display: 'block', margin: 48 }} />;
  }

  return (
    <Card
      bordered={false}
      style={{ borderRadius: 16, background: 'var(--ant-color-bg-container)' }}
      bodyStyle={{ padding: 16 }}
    >
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Space wrap align="center" style={{ width: '100%', justifyContent: 'space-between' }}>
          <Space align="center" wrap>
            <Typography.Title level={4} style={{ margin: 0 }}>
              <HistoryOutlined style={{ marginRight: 8 }} />
              {intl.formatMessage({ id: 'sessions.archivesTitle' })}
            </Typography.Title>
            <SectionScopeHint intl={intl} messageId="sessions.archivesPageScopeDesc" />
            <Typography.Text type="secondary" copyable code style={{ fontSize: 12 }}>
              {id}
            </Typography.Text>
          </Space>
          <Space wrap>
            <Link to="/sessions">
              <Button icon={<ArrowLeftOutlined />}>{intl.formatMessage({ id: 'sessions.archivesBackSessions' })}</Button>
            </Link>
            <Link to={detailBase}>
              <Button type="primary">{intl.formatMessage({ id: 'sessions.archivesBackSession' })}</Button>
            </Link>
          </Space>
        </Space>

        <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
          {intl.formatMessage({ id: 'sessions.archivesIntro' })}
        </Typography.Paragraph>

        {error && (
          <Alert type="error" message={error} showIcon />
        )}

        <Table
          rowKey={(r) => r.resetTimestamp}
          columns={columns}
          dataSource={epochs}
          locale={{ emptyText: intl.formatMessage({ id: 'sessions.archivesEmpty' }) }}
          pagination={{
            pageSize: 20,
            showSizeChanger: true,
            pageSizeOptions: ['20', '50', '100'],
            showTotal: (t) => intl.formatMessage({ id: 'sessions.archivesTotalFmt' }, { n: t }),
          }}
          size="small"
          scroll={{ x: 'max-content' }}
        />
      </Space>
    </Card>
  );
}
