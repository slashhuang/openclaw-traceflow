import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useIntl } from 'react-intl';
import {
  Card,
  Col,
  Descriptions,
  Row,
  Statistic,
  Table,
  Tag,
  Typography,
  Spin,
  Alert,
  Button,
  Space,
} from 'antd';
import {
  CodeOutlined,
  QuestionCircleOutlined,
  RobotOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import type {
  AuditSnapshot,
  CodeDeliveryStats,
  QaServiceStats,
  AutomationStats,
} from '../types/audit';

const { Title, Text } = Typography;

interface AuditData {
  snapshot: AuditSnapshot | null;
  loading: boolean;
  error: string | null;
  errorCode: string | null;
}

/**
 * Agent 贡献审计页面
 *
 * 展示 Bot 对团队的贡献数据：
 * - 代码交付（MR 数量、涉及仓库）
 * - 问答服务（服务人数、问题类型）
 * - 自动化运行（定时任务执行情况）
 * - Token 消耗统计
 */
export const Audit: React.FC = () => {
  const intl = useIntl();
  const [data, setData] = useState<AuditData>({
    snapshot: null,
    loading: true,
    error: null,
    errorCode: null,
  });

  const fetchSnapshot = useCallback(async () => {
    try {
      const response = await fetch('/api/audit/snapshot');
      const result = (await response.json()) as {
        success: boolean;
        data?: AuditSnapshot;
        error?: string;
        code?: string;
      };

      if (result.success) {
        setData({ snapshot: result.data ?? null, loading: false, error: null, errorCode: null });
      } else {
        setData({
          snapshot: null,
          loading: false,
          error: result.error ?? intl.formatMessage({ id: 'audit.error.unknown' }),
          errorCode: result.code ?? null,
        });
      }
    } catch (error) {
      setData({
        snapshot: null,
        loading: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        errorCode: null,
      });
    }
  }, [intl]);

  useEffect(() => {
    void fetchSnapshot();
  }, [fetchSnapshot]);

  if (data.loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Spin size="large" tip={intl.formatMessage({ id: 'audit.loadingSnapshot' })} />
      </div>
    );
  }

  if (data.errorCode === 'SNAPSHOT_NOT_FOUND') {
    return (
      <div style={{ padding: 24, maxWidth: 720 }}>
        <Alert
          type="info"
          message={intl.formatMessage({ id: 'audit.onboarding.title' })}
          showIcon
          description={
            <div>
              <p style={{ marginBottom: 12 }}>{intl.formatMessage({ id: 'audit.onboarding.lead' })}</p>
              <ol style={{ marginBottom: 16, paddingLeft: 20 }}>
                <li>{intl.formatMessage({ id: 'audit.onboarding.step1' })}</li>
                <li>{intl.formatMessage({ id: 'audit.onboarding.step2' })}</li>
                <li>{intl.formatMessage({ id: 'audit.onboarding.step3' })}</li>
              </ol>
              <Space wrap>
                <Link to="/traceflow-skills#agent-audit">
                  <Button type="primary">{intl.formatMessage({ id: 'audit.onboarding.openSkills' })}</Button>
                </Link>
                <Button onClick={() => void fetchSnapshot()}>{intl.formatMessage({ id: 'common.retry' })}</Button>
              </Space>
            </div>
          }
        />
      </div>
    );
  }

  if (data.error) {
    return (
      <div style={{ padding: 24 }}>
        <Alert
          message={intl.formatMessage({ id: 'audit.error.title' })}
          description={data.error}
          type="error"
          showIcon
          action={
            <Button size="small" type="primary" onClick={() => void fetchSnapshot()}>
              {intl.formatMessage({ id: 'common.retry' })}
            </Button>
          }
        />
      </div>
    );
  }

  if (!data.snapshot) {
    return (
      <div style={{ padding: 24 }}>
        <Alert
          message={intl.formatMessage({ id: 'audit.onboarding.title' })}
          description={intl.formatMessage({ id: 'audit.onboarding.lead' })}
          type="info"
          showIcon
          action={
            <Space>
              <Link to="/traceflow-skills#agent-audit">
                <Button size="small" type="primary">
                  {intl.formatMessage({ id: 'audit.onboarding.openSkills' })}
                </Button>
              </Link>
              <Button size="small" onClick={() => void fetchSnapshot()}>
                {intl.formatMessage({ id: 'common.retry' })}
              </Button>
            </Space>
          }
        />
      </div>
    );
  }

  const snapshot = data.snapshot;

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 24 }}>
        <Title level={2}>
          <RobotOutlined /> Agent 贡献审计
        </Title>
        <Text type="secondary">
          数据生成时间：{new Date(snapshot.generatedAt).toLocaleString('zh-CN')}
          {snapshot.period && `（${snapshot.period}）`}
        </Text>
      </div>

      {/* 核心指标卡片 */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card>
            <Statistic
              title="代码交付 MR"
              value={snapshot.codeDelivery.totalMRs}
              prefix={<CodeOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="问答服务"
              value={snapshot.qaService.totalQuestions}
              prefix={<QuestionCircleOutlined />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="服务人数"
              value={snapshot.qaService.uniqueUsers}
              prefix={<RobotOutlined />}
              valueStyle={{ color: '#722ed1' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="自动化运行"
              value={snapshot.automation.totalRuns}
              prefix={<ThunderboltOutlined />}
              valueStyle={{ color: '#fa8c16' }}
            />
          </Card>
        </Col>
      </Row>

      {/* 代码交付详情 */}
      <Card title="📦 代码交付" style={{ marginBottom: 24 }}>
        <CodeDeliveryTable data={snapshot.codeDelivery} />
      </Card>

      {/* 问答服务详情 */}
      <Card title="💬 问答服务" style={{ marginBottom: 24 }}>
        <QaServiceTable data={snapshot.qaService} />
      </Card>

      {/* 自动化运行详情 */}
      <Card title="⚡ 自动化运行" style={{ marginBottom: 24 }}>
        <AutomationTable data={snapshot.automation} />
      </Card>

      {/* Token 消耗 */}
      <Card title="💰 Token 消耗">
        <Descriptions column={2}>
          <Descriptions.Item label="Input Tokens">
            {snapshot.cost.totalInputTokens.toLocaleString()}
          </Descriptions.Item>
          <Descriptions.Item label="Output Tokens">
            {snapshot.cost.totalOutputTokens.toLocaleString()}
          </Descriptions.Item>
          <Descriptions.Item label="Total Tokens">
            {(snapshot.cost.totalInputTokens + snapshot.cost.totalOutputTokens).toLocaleString()}
          </Descriptions.Item>
        </Descriptions>
      </Card>
    </div>
  );
};

// ─── 子组件 ───────────────────────────────────────────────

/**
 * 代码交付详情表格
 */
interface CodeDeliveryTableProps {
  data: CodeDeliveryStats;
}

const CodeDeliveryTable: React.FC<CodeDeliveryTableProps> = ({ data }) => {
  const initiatorColumns = [
    { title: '发起人', dataIndex: 'name', key: 'name' },
    { title: 'MR 数量', dataIndex: 'total', key: 'total', sorter: (a: any, b: any) => a.total - b.total },
    { title: '涉及仓库', dataIndex: 'repos', key: 'repos', render: (repos: string[]) => repos.join(', ') },
  ];

  const initiatorData = Object.entries(data.byInitiator).map(([userId, stats]) => ({
    key: userId,
    name: stats.displayName,
    total: stats.total,
    repos: stats.repos,
  }));

  const repoColumns = [
    { title: '仓库', dataIndex: 'repo', key: 'repo' },
    { title: 'MR 数量', dataIndex: 'count', key: 'count', sorter: (a: any, b: any) => a.count - b.count },
  ];

  const repoData = Object.entries(data.byRepo).map(([repo, count]) => ({
    key: repo,
    repo,
    count,
  }));

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      <div>
        <Title level={5}>按发起人</Title>
        <Table columns={initiatorColumns} dataSource={initiatorData} pagination={false} size="small" />
      </div>
      <div>
        <Title level={5}>按仓库</Title>
        <Table columns={repoColumns} dataSource={repoData} pagination={false} size="small" />
      </div>
    </Space>
  );
};

/**
 * 问答服务详情表格
 */
interface QaServiceTableProps {
  data: QaServiceStats;
}

const QaServiceTable: React.FC<QaServiceTableProps> = ({ data }) => {
  const userColumns = [
    { title: '用户', dataIndex: 'name', key: 'name' },
    { title: '问题数', dataIndex: 'questions', key: 'questions', sorter: (a: any, b: any) => a.questions - b.questions },
    {
      title: 'Top 标签',
      dataIndex: 'topTags',
      key: 'topTags',
      render: (tags: { tag: string; count: number }[]) => (
        <Space>
          {tags.slice(0, 3).map(({ tag, count }) => (
            <Tag key={tag} color="blue">
              {tag}({count})
            </Tag>
          ))}
        </Space>
      ),
    },
  ];

  const userData = Object.entries(data.byUser).map(([userId, stats]) => {
    const topTags = Object.entries(stats.tags)
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      key: userId,
      name: stats.displayName,
      questions: stats.questions,
      topTags,
    };
  });

  const tagColumns = [
    { title: '标签', dataIndex: 'tag', key: 'tag' },
    { title: '数量', dataIndex: 'count', key: 'count', sorter: (a: any, b: any) => a.count - b.count },
  ];

  const tagData = Object.entries(data.byTag).map(([tag, count]) => ({
    key: tag,
    tag,
    count,
  }));

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      <div>
        <Title level={5}>按用户</Title>
        <Table columns={userColumns} dataSource={userData} pagination={false} size="small" />
      </div>
      <div>
        <Title level={5}>问题标签分布</Title>
        <Table columns={tagColumns} dataSource={tagData} pagination={false} size="small" />
      </div>
    </Space>
  );
};

/**
 * 自动化运行详情表格
 */
interface AutomationTableProps {
  data: AutomationStats;
}

const AutomationTable: React.FC<AutomationTableProps> = ({ data }) => {
  const columns = [
    { title: '自动化类型', dataIndex: 'type', key: 'type' },
    { title: '运行次数', dataIndex: 'count', key: 'count', sorter: (a: any, b: any) => a.count - b.count },
  ];

  const dataSource = Object.entries(data.byType).map(([type, count]) => ({
    key: type,
    type,
    count,
  }));

  return <Table columns={columns} dataSource={dataSource} pagination={false} size="small" />;
};

export default Audit;
