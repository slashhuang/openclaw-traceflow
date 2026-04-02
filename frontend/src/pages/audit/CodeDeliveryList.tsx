import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Table, Skeleton, Button } from 'antd';
import { AuditEvent } from '../../types';

const CodeDeliveryList = () => {
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
      const res = await fetch(`/api/audit/code?limit=${limit}&offset=${offset}`);
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
        <h1>📦 代码交付明细</h1>
        <Table
          columns={[
            { title: 'MR', dataIndex: 'mr', key: 'mr' },
            { title: '发起人', dataIndex: 'senderId', key: 'senderId' },
            { title: '仓库', dataIndex: 'project', key: 'project' },
            { title: '时间', dataIndex: 'timestamp', key: 'timestamp' },
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
      title: 'MR',
      dataIndex: 'mr',
      key: 'mr',
      render: (_, record: AuditEvent) => {
        const mrUrl = record.mr?.url;
        const mrTitle = record.mr?.title || 'N/A';
        const mrIid = record.mr?.iid;
        
        if (mrUrl) {
          return (
            <a href={mrUrl} target="_blank" rel="noopener noreferrer">
              📝 MR #{mrIid}: {mrTitle}
            </a>
          );
        }
        return (
          <div>
            📝 MR #{mrIid}: {mrTitle}
          </div>
        );
      },
    },
    {
      title: '发起人',
      dataIndex: 'senderId',
      key: 'senderId',
      render: (_, record: AuditEvent) => record.senderName || record.senderId || 'N/A',
    },
    {
      title: '仓库',
      dataIndex: 'project',
      key: 'project',
      render: (_, record: AuditEvent) => record.mr?.project || 'N/A',
    },
    {
      title: '时间',
      dataIndex: 'timestamp',
      key: 'timestamp',
      render: (_, record: AuditEvent) =>
        new Date(record.timestamp).toLocaleString('zh-CN'),
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
      <h1>📦 代码交付明细</h1>
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
      
      {/* 分页控件占位符（antd Table 已内置） */}
    </div>
  );
};

export default CodeDeliveryList;