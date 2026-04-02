import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useIntl } from 'react-intl';
import {
  Alert,
  Card,
  Typography,
  Table,
  Tag,
  Button,
  Space,
  Modal,
  message,
  Select,
  Statistic,
  Row,
  Col,
  Divider,
} from 'antd';
import {
  RobotOutlined,
  UserOutlined,
  CommentOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';

const { Title, Text, Paragraph } = Typography;
const { Option } = Select;

interface Reflection {
  id: string;
  timestamp: string;
  sessionId: string;
  dimension: 'ai' | 'user' | 'interaction';
  category: string;
  priority: 'high' | 'medium' | 'low';
  triggerType: string;
  finding: string;
  suggestion: string;
  userGuidance?: string;
  impact: string;
  occurrenceCount: number;
  sessionIds: string[];
  lastSeen: string;
  applicableTo: 'ai' | 'user' | 'both';
  status: 'pending' | 'applied' | 'ignored' | 'escalated';
  diff?: {
    file: string;
    old: Record<string, any>;
    new: Record<string, any>;
  };
  fullContent?: string;
}

interface ReflectionsResponse {
  reflections: Reflection[];
  stats: {
    pending: number;
    applied: number;
    ignored: number;
    escalated: number;
  };
  source?: { reflectionsFileExists: boolean };
  code?: string;
}

export const Reflections: React.FC = () => {
  const intl = useIntl();
  const [reflections, setReflections] = useState<Reflection[]>([]);
  const [loading, setLoading] = useState(false);
  const [sourceMissing, setSourceMissing] = useState(false);
  const [stats, setStats] = useState<ReflectionsResponse['stats']>({
    pending: 0,
    applied: 0,
    ignored: 0,
    escalated: 0,
  });
  const [statusFilter, setStatusFilter] = useState<string>('pending');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [dimensionFilter, setDimensionFilter] = useState<string>('all');
  const [diffModalVisible, setDiffModalVisible] = useState(false);
  const [selectedDiff, setSelectedDiff] = useState<any>(null);

  /**
   * 加载反思列表
   */
  const loadReflections = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.append('status', statusFilter);
      if (priorityFilter !== 'all') params.append('priority', priorityFilter);
      if (dimensionFilter !== 'all') params.append('dimension', dimensionFilter);

      const response = await fetch(`/api/reflections?${params.toString()}`);
      const data = (await response.json()) as ReflectionsResponse;

      setReflections(data.reflections ?? []);
      setStats(data.stats);
      const missing =
        data.code === 'REFLECTIONS_SOURCE_MISSING' ||
        data.source?.reflectionsFileExists === false;
      setSourceMissing(Boolean(missing));
    } catch (error) {
      message.error(intl.formatMessage({ id: 'reflections.loadError' }));
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, priorityFilter, dimensionFilter, intl]);

  useEffect(() => {
    loadReflections();
  }, [loadReflections]);

  /**
   * 应用反思
   */
  const handleApply = async (id: string, action: 'apply' | 'ignore') => {
    try {
      const response = await fetch(`/api/reflections/${id}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      
      if (response.ok) {
        message.success(action === 'apply' ? '已应用建议' : '已忽略');
        loadReflections();
      } else {
        message.error('操作失败');
      }
    } catch (error) {
      message.error('操作失败');
      console.error(error);
    }
  };

  /**
   * 查看 Diff
   */
  const handleViewDiff = async (id: string) => {
    try {
      const response = await fetch(`/api/reflections/${id}/diff`);
      const data = await response.json();
      
      if (data.error) {
        message.error(data.error);
        return;
      }
      
      setSelectedDiff(data);
      setDiffModalVisible(true);
    } catch (error) {
      message.error('获取 Diff 失败');
      console.error(error);
    }
  };

  /**
   * 获取维度图标
   */
  const getDimensionIcon = (dimension: string) => {
    switch (dimension) {
      case 'ai':
        return <RobotOutlined />;
      case 'user':
        return <UserOutlined />;
      case 'interaction':
        return <CommentOutlined />;
      default:
        return <ThunderboltOutlined />;
    }
  };

  /**
   * 获取优先级颜色
   */
  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'red';
      case 'medium':
        return 'orange';
      case 'low':
        return 'green';
      default:
        return 'default';
    }
  };

  /**
   * 获取状态标签
   */
  const getStatusTag = (status: string) => {
    switch (status) {
      case 'pending':
        return <Tag color="blue">待处理</Tag>;
      case 'applied':
        return <Tag icon={<CheckCircleOutlined />} color="success">已应用</Tag>;
      case 'ignored':
        return <Tag icon={<CloseCircleOutlined />} color="default">已忽略</Tag>;
      case 'escalated':
        return <Tag icon={<ExclamationCircleOutlined />} color="red">已升级</Tag>;
      default:
        return <Tag>{status}</Tag>;
    }
  };

  const columns: ColumnsType<Reflection> = [
    {
      title: '时间',
      dataIndex: 'timestamp',
      key: 'timestamp',
      width: 160,
      render: (timestamp: string) => (
        <Text type="secondary" style={{ fontSize: 13 }}>
          {new Date(timestamp).toLocaleString('zh-CN', {
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </Text>
      ),
    },
    {
      title: '维度',
      dataIndex: 'dimension',
      key: 'dimension',
      width: 80,
      render: (dimension: string) => (
        <span title={dimension}>{getDimensionIcon(dimension)}</span>
      ),
    },
    {
      title: '优先级',
      dataIndex: 'priority',
      key: 'priority',
      width: 80,
      render: (priority: string) => (
        <Tag color={getPriorityColor(priority)}>
          {priority === 'high' ? '高' : priority === 'medium' ? '中' : '低'}
        </Tag>
      ),
    },
    {
      title: '发现',
      dataIndex: 'finding',
      key: 'finding',
      ellipsis: true,
      render: (finding: string, record: Reflection) => (
        <Space direction="vertical" size={0}>
          <Text>{finding}</Text>
          {record.occurrenceCount > 1 && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              发生 {record.occurrenceCount} 次
            </Text>
          )}
        </Space>
      ),
    },
    {
      title: '建议',
      dataIndex: 'suggestion',
      key: 'suggestion',
      ellipsis: true,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => getStatusTag(status),
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      render: (_, record) => (
        <Space size="small">
          {record.diff && (
            <Button size="small" onClick={() => handleViewDiff(record.id)}>
              查看 Diff
            </Button>
          )}
          {record.userGuidance && (
            <Button
              size="small"
              onClick={() => {
                Modal.info({
                  title: '用户指南',
                  content: record.userGuidance,
                  width: 500,
                });
              }}
            >
              查看指南
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>
          🔄 反思列表
        </Title>
      </div>

      {sourceMissing ? (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message={intl.formatMessage({ id: 'reflections.onboarding.title' })}
          description={
            <div>
              <p style={{ marginBottom: 12 }}>{intl.formatMessage({ id: 'reflections.onboarding.lead' })}</p>
              <ol style={{ marginBottom: 16, paddingLeft: 20 }}>
                <li>{intl.formatMessage({ id: 'reflections.onboarding.step1' })}</li>
                <li>{intl.formatMessage({ id: 'reflections.onboarding.step2' })}</li>
                <li>{intl.formatMessage({ id: 'reflections.onboarding.step3' })}</li>
              </ol>
              <Link to="/traceflow-skills#self-improvement">
                <Button type="primary">{intl.formatMessage({ id: 'reflections.onboarding.openSkills' })}</Button>
              </Link>
            </div>
          }
        />
      ) : null}

      {/* 统计卡片 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="待处理"
              value={stats.pending}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="已应用"
              value={stats.applied}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="已忽略"
              value={stats.ignored}
              valueStyle={{ color: '#8c8c8c' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="已升级"
              value={stats.escalated}
              valueStyle={{ color: '#ff4d4f' }}
            />
          </Card>
        </Col>
      </Row>

      {/* 筛选器 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space size="middle">
          <span>状态：</span>
          <Select
            value={statusFilter}
            onChange={setStatusFilter}
            style={{ width: 120 }}
          >
            <Option value="pending">待处理</Option>
            <Option value="applied">已应用</Option>
            <Option value="ignored">已忽略</Option>
            <Option value="escalated">已升级</Option>
          </Select>

          <span>优先级：</span>
          <Select
            value={priorityFilter}
            onChange={setPriorityFilter}
            style={{ width: 100 }}
          >
            <Option value="all">全部</Option>
            <Option value="high">高</Option>
            <Option value="medium">中</Option>
            <Option value="low">低</Option>
          </Select>

          <span>维度：</span>
          <Select
            value={dimensionFilter}
            onChange={setDimensionFilter}
            style={{ width: 120 }}
          >
            <Option value="all">全部</Option>
            <Option value="ai">AI 自我</Option>
            <Option value="user">用户输入</Option>
            <Option value="interaction">交互质量</Option>
          </Select>

          <Button onClick={loadReflections}>刷新</Button>
        </Space>
      </Card>

      {/* 反思列表 */}
      <Card>
        <Table
          columns={columns}
          dataSource={reflections}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 20 }}
          scroll={{ x: 1200 }}
          locale={
            !loading && !sourceMissing
              ? {
                  emptyText: (
                    <span>
                      {intl.formatMessage({ id: 'reflections.emptyHint' })}{' '}
                      <Link to="/traceflow-skills#self-improvement">
                        {intl.formatMessage({ id: 'menu.traceflowSkills' })}
                      </Link>
                    </span>
                  ),
                }
              : undefined
          }
        />
      </Card>

      {/* Diff 弹窗 */}
      <Modal
        title="配置变更"
        open={diffModalVisible}
        onCancel={() => setDiffModalVisible(false)}
        footer={[
          <Button
            key="copy"
            onClick={() => {
              navigator.clipboard.writeText(selectedDiff?.unified || '');
              message.success('已复制到剪贴板');
            }}
          >
            复制
          </Button>,
          <Button key="close" onClick={() => setDiffModalVisible(false)}>
            关闭
          </Button>,
        ]}
        width={700}
      >
        {selectedDiff && (
          <div>
            <Paragraph>
              <Text strong>文件：</Text>
              {selectedDiff.file}
            </Paragraph>
            <Divider />
            <pre
              style={{
                background: '#f5f5f5',
                padding: 16,
                borderRadius: 4,
                overflow: 'auto',
                fontSize: 13,
                fontFamily: 'monospace',
              }}
            >
              {selectedDiff.unified}
            </pre>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default Reflections;
