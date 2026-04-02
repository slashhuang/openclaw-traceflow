import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Table, Skeleton, Button } from 'antd';
import { AuditEvent } from '../../types';

const QaServiceList = () => {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState(20);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const navigate = useNavigate();

  const fetchEvents = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/audit/qa?limit=${limit}&offset=${offset}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.success) {
        setEvents(data.events || []);
        setTotal(data.total || 0);
      } else {
        setError(data.error || 'Failed to load events');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [limit, offset]);

  useEffect(() => {
    void fetchEvents();
  }, [fetchEvents]);

  if (loading) {
    return (
      <div>
        <h1>💬 问答服务明细</h1>
        <Table
          columns={[
            { title: '用户', dataIndex: 'senderId', key: 'senderId' },
            { title: '时间', dataIndex: 'timestamp', key: 'timestamp' },
            { title: '标签', dataIndex: 'tags', key: 'tags' },
            { title: '问题摘要', dataIndex: 'questionSummary', key: 'questionSummary' },
            { title: 'Token', dataIndex: 'token', key: 'token' },
            { title: '会话', dataIndex: 'sessionId', key: 'sessionId' },
          ]}
          dataSource={Array.from({ length: 5 }).map((_, i) => ({ key: i }))}
          pagination={false}
          loading={true}
        />
      </div>
    );
  }

  if (error) return <div>Error: {error}</div>;

  const columns = [
    {
      title: '用户',
      dataIndex: 'senderId',
      key: 'senderId',
      render: (_, record: AuditEvent) => record.senderName || record.senderId || 'N/A',
    },
    {
      title: '时间',
      dataIndex: 'timestamp',
      key: 'timestamp',
      render: (_, record: AuditEvent) =>
        new Date(record.timestamp).toLocaleString('zh-CN'),
    },
    {
      title: '标签',
      dataIndex: 'tags',
      key: 'tags',
      render: (_, record: AuditEvent) =>
        (record.tags || []).join(', ') || 'N/A',
    },
    {
      title: '问题摘要',
      dataIndex: 'userMessage',
      key: 'userMessage',
      render: (_, record: AuditEvent) => {
        const msg = record.userMessage || 'N/A';
        // 截断过长的消息
        if (msg.length > 100) {
          return <span title={msg}>{msg.substring(0, 100)}...</span>;
        }
        return msg;
      },
    },
    {
      title: 'Token',
      dataIndex: 'token',
      key: 'token',
      render: (_, record: AuditEvent) =>
        (record.tokenUsage?.input + record.tokenUsage?.output || 0) + 'K',
    },
    {
      title: '会话',
      dataIndex: 'sessionId',
      key: 'sessionId',
      render: (_, record: AuditEvent) => (
        <Button size="small" onClick={() => navigate(`/audit/session/${record.sessionId}`)}>
          查看
        </Button>
      ),
    },
  ];

  return (
    <div>
      <h1>💬 问答服务明细</h1>
      <Table
        columns={columns}
        dataSource={events.map((e, i) => ({ ...e, key: i }))}
        pagination={{
          current: Math.floor(offset / limit) + 1,
          pageSize: limit,
          total,
          onChange: (page) => setOffset((page - 1) * limit),
        }}
      />
    </div>
  );
};

export default QaServiceList;