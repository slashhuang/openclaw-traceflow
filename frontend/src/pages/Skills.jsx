import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Card,
  Row,
  Col,
  Statistic,
  Table,
  Tabs,
  Typography,
  Spin,
  Tag,
  Space,
  theme,
  Tooltip as AntdTooltip,
  Select,
  message,
} from 'antd';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { useIntl } from 'react-intl';
import { skillsApi } from '../api';

const COLORS = ['#1677ff', '#52c41a', '#faad14', '#ff7a45', '#722ed1', '#13c2c2'];
const TOOL_COLORS = ['#1677ff', '#52c41a', '#faad14', '#ff7a45', '#722ed1', '#13c2c2', '#eb2f96', '#a0d911'];

export default function Skills() {
  const intl = useIntl();
  const { token } = theme.useToken();
  const [skills, setSkills] = useState([]);
  const [systemPrompt, setSystemPrompt] = useState(null);
  const [usageByUser, setUsageByUser] = useState([]);
  const [skillToolUsage, setSkillToolUsage] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('list');
  const [insightDimension, setInsightDimension] = useState('callCount');

  const DIMENSION_OPTIONS = [
    { value: 'callCount', label: intl.formatMessage({ id: 'skills.dimCalls' }) },
    { value: 'sessionCount', label: intl.formatMessage({ id: 'skills.dimSessions' }) },
    { value: 'userCount', label: intl.formatMessage({ id: 'skills.dimUsers' }) },
    { value: 'recent7dCalls', label: intl.formatMessage({ id: 'skills.dimRecent7d' }) },
    { value: 'recent30dCalls', label: intl.formatMessage({ id: 'skills.dimRecent30d' }) },
    { value: 'avgCallsPerSession', label: intl.formatMessage({ id: 'skills.dimAvgPerSession' }) },
  ];

  useEffect(() => {
    (async () => {
      try {
        const [skillsData, spData, byUserData, skillToolData] = await Promise.all([
          skillsApi.getUsage(),
          skillsApi.getSystemPromptAnalysis(),
          skillsApi.getUsageByUser(),
          skillsApi.getSkillToolUsage(),
        ]);
        setSkills(skillsData || []);
        setSystemPrompt(spData || null);
        setUsageByUser(byUserData || []);
        setSkillToolUsage(skillToolData || []);
      } catch (e) {
        console.error(e);
        message.error(e?.message || '技能数据加载失败');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const callFrequencyData = (skills || [])
    .filter((s) => s.callCount > 0)
    .sort((a, b) => b.callCount - a.callCount)
    .slice(0, 10)
    .map((s) => ({ name: s.name, count: s.callCount }));

  // 洞察柱状图：按选定维度展示所有 skills
  const insightChartData = (skills || [])
    .map((s) => ({
      name: s.name,
      value: s[insightDimension] ?? 0,
    }))
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 20);

  // 构建 skill × 用户 堆叠柱状图数据（top 5 用户 + 其他）
  const { userBreakdownData, topUserLabels } = (() => {
    const raw = usageByUser || [];
    if (!raw.length) return { userBreakdownData: [], topUserLabels: [] };
    const userTotals = new Map();
    raw.forEach(({ users }) => {
      users.forEach(({ userId, count }) => {
        userTotals.set(userId, (userTotals.get(userId) || 0) + count);
      });
    });
    const topUsers = [...userTotals.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([u]) => u);
    const userBreakdownData = raw.map(({ skillName, users }) => {
      const row = { skillName };
      topUsers.forEach((uid, i) => {
        const u = users.find((x) => x.userId === uid);
        row[`user_${i}`] = u ? u.count : 0;
      });
      let other = 0;
      users.forEach(({ userId, count }) => {
        if (!topUsers.includes(userId)) other += count;
      });
      row.__other__ = other;
      return row;
    });
    return { userBreakdownData, topUserLabels: topUsers };
  })();

  const tokenDistributionData = systemPrompt
    ? [
        { name: 'Active', value: systemPrompt.activeSkillsTokens || 0 },
        { name: 'Zombie', value: systemPrompt.zombieSkillsTokens || 0 },
        { name: 'Dup', value: systemPrompt.duplicateSkillsTokens || 0 },
      ]
    : [];

  const zombieSkills = (skills || []).filter(
    (s) => s.lastUsed && s.lastUsed < Date.now() - 30 * 24 * 60 * 60 * 1000,
  );
  const duplicateSkills = (skills || []).filter((s) => s.duplicateWith?.length > 0);

  if (loading) {
    return <Spin style={{ display: 'block', margin: 48 }} />;
  }

  return (
    <div>
      <Typography.Title level={4}>{intl.formatMessage({ id: 'skills.title' })}</Typography.Title>
      <Typography.Paragraph type="secondary">{intl.formatMessage({ id: 'skills.subtitle' })}</Typography.Paragraph>
      <Tabs
        activeKey={tab}
        onChange={setTab}
        items={[
          {
            key: 'list',
            label: intl.formatMessage({ id: 'skills.tabList' }),
            children: (
              <>
                <Row gutter={16} style={{ marginBottom: 16 }}>
                  <Col xs={12} sm={6}><Card><Statistic title="Total" value={skills.length} /></Card></Col>
                  <Col xs={12} sm={6}><Card><Statistic title="Enabled" value={skills.filter((s) => s.enabled).length} valueStyle={{ color: token.colorSuccess }} /></Card></Col>
                  <Col xs={12} sm={6}><Card><Statistic title="Zombie" value={zombieSkills.length} valueStyle={{ color: token.colorError }} /></Card></Col>
                  <Col xs={12} sm={6}><Card><Statistic title="Dup" value={duplicateSkills.length} valueStyle={{ color: token.colorWarning }} /></Card></Col>
                </Row>
                <Typography.Paragraph type="secondary" style={{ marginBottom: 16, fontSize: 12 }}>
                  {intl.formatMessage({ id: 'skills.callTrackingHint' })}
                </Typography.Paragraph>
                {insightChartData.length > 0 && (
                  <Card
                    title={intl.formatMessage({ id: 'skills.insightChartTitle' })}
                    extra={
                      <Select
                        size="small"
                        value={insightDimension}
                        onChange={setInsightDimension}
                        options={DIMENSION_OPTIONS}
                        style={{ width: 160 }}
                      />
                    }
                    style={{ marginBottom: 16 }}
                  >
                    <ResponsiveContainer width="100%" height={320}>
                      <BarChart data={insightChartData} layout="vertical" margin={{ left: 80 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={token.colorBorderSecondary} />
                        <XAxis type="number" tick={{ fill: token.colorTextSecondary }} />
                        <YAxis type="category" dataKey="name" width={75} tick={{ fill: token.colorTextSecondary, fontSize: 11 }} />
                        <Tooltip contentStyle={{ background: token.colorBgElevated }} />
                        <Bar dataKey="value" fill={token.colorPrimary} name={DIMENSION_OPTIONS.find((o) => o.value === insightDimension)?.label} />
                      </BarChart>
                    </ResponsiveContainer>
                  </Card>
                )}
                {(callFrequencyData.length > 0 || userBreakdownData.length > 0) && (
                  <Row gutter={16} style={{ marginBottom: 16 }}>
                    {callFrequencyData.length > 0 && (
                      <Col xs={24} lg={12}>
                        <Card title={intl.formatMessage({ id: 'skills.top10Title' })}>
                          <ResponsiveContainer width="100%" height={280}>
                            <BarChart data={callFrequencyData}>
                              <CartesianGrid strokeDasharray="3 3" stroke={token.colorBorderSecondary} />
                              <XAxis dataKey="name" tick={{ fill: token.colorTextSecondary, fontSize: 10 }} />
                              <YAxis tick={{ fill: token.colorTextSecondary }} />
                              <Tooltip contentStyle={{ background: token.colorBgElevated }} />
                              <Bar dataKey="count" fill={token.colorPrimary} />
                            </BarChart>
                          </ResponsiveContainer>
                        </Card>
                      </Col>
                    )}
                    {userBreakdownData.length > 0 && (
                      <Col xs={24} lg={12}>
                        <Card title={intl.formatMessage({ id: 'skills.userDistributionTitle' })}>
                          <ResponsiveContainer width="100%" height={280}>
                            <BarChart data={userBreakdownData} layout="vertical" margin={{ left: 60 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke={token.colorBorderSecondary} />
                              <XAxis type="number" tick={{ fill: token.colorTextSecondary }} />
                              <YAxis type="category" dataKey="skillName" width={80} tick={{ fill: token.colorTextSecondary, fontSize: 10 }} />
                              <Tooltip contentStyle={{ background: token.colorBgElevated }} />
                              <Legend />
                              {topUserLabels.map((uid, i) => (
                                <Bar
                                  key={uid}
                                  dataKey={`user_${i}`}
                                  stackId="user"
                                  name={uid.length > 12 ? `${uid.slice(0, 8)}…` : uid}
                                  fill={COLORS[i % COLORS.length]}
                                />
                              ))}
                              <Bar dataKey="__other__" stackId="user" name="其他" fill={token.colorTextTertiary || '#bfbfbf'} />
                            </BarChart>
                          </ResponsiveContainer>
                        </Card>
                      </Col>
                    )}
                  </Row>
                )}
                <Card>
                  <Table
                    rowKey={(r) => r.name}
                    dataSource={skills}
                    scroll={{ x: true }}
                    columns={[
                      {
                        title: 'Name',
                        dataIndex: 'name',
                        sorter: (a, b) => (a.name || '').localeCompare(b.name || ''),
                        sortDirections: ['ascend', 'descend'],
                        render: (n, r) => (
                          <div>
                            <Typography.Text strong>{n}</Typography.Text>
                            <AntdTooltip
                              title={
                                <span style={{ display: 'inline-block', maxWidth: 400, whiteSpace: 'pre-wrap' }}>
                                  {r.description || '—'}
                                </span>
                              }
                            >
                              <div style={{ maxWidth: 280 }}>
                                <Typography.Text type="secondary" ellipsis>{r.description || '—'}</Typography.Text>
                              </div>
                            </AntdTooltip>
                          </div>
                        ),
                      },
                      {
                        title: 'Status',
                        render: (_, r) => <Tag color={r.enabled ? 'green' : 'red'}>{r.enabled ? 'On' : 'Off'}</Tag>,
                      },
                      {
                        title: 'Tools',
                        key: 'tools',
                        width: 180,
                        render: (_, r) => {
                          const st = skillToolUsage.find((s) => s.skillName === r.name);
                          if (!st?.tools?.length) return '—';
                          const top = st.tools.slice(0, 4);
                          return (
                            <Space size={4} wrap>
                              {top.map((t) => (
                                <Tag key={t.toolName} style={{ margin: 0 }}>
                                  {t.toolName}×{t.count}
                                </Tag>
                              ))}
                              {st.tools.length > 4 && (
                                <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                                  +{st.tools.length - 4}
                                </Typography.Text>
                              )}
                            </Space>
                          );
                        },
                      },
                      {
                        title: 'Tokens',
                        dataIndex: 'tokenCount',
                        sorter: (a, b) => (a.tokenCount ?? 0) - (b.tokenCount ?? 0),
                        sortDirections: ['ascend', 'descend'],
                      },
                      {
                        title: 'Calls',
                        dataIndex: 'callCount',
                        sorter: (a, b) => (a.callCount ?? 0) - (b.callCount ?? 0),
                        sortDirections: ['ascend', 'descend'],
                      },
                      {
                        title: 'Sessions',
                        dataIndex: 'sessionCount',
                        sorter: (a, b) => (a.sessionCount ?? 0) - (b.sessionCount ?? 0),
                        sortDirections: ['ascend', 'descend'],
                      },
                      {
                        title: 'Users',
                        dataIndex: 'userCount',
                        sorter: (a, b) => (a.userCount ?? 0) - (b.userCount ?? 0),
                        sortDirections: ['ascend', 'descend'],
                      },
                      {
                        title: '7d',
                        dataIndex: 'recent7dCalls',
                        sorter: (a, b) => (a.recent7dCalls ?? 0) - (b.recent7dCalls ?? 0),
                        sortDirections: ['ascend', 'descend'],
                      },
                      {
                        title: '30d',
                        dataIndex: 'recent30dCalls',
                        sorter: (a, b) => (a.recent30dCalls ?? 0) - (b.recent30dCalls ?? 0),
                        sortDirections: ['ascend', 'descend'],
                      },
                      {
                        title: 'Last',
                        dataIndex: 'lastUsed',
                        sorter: (a, b) => (a.lastUsed ?? 0) - (b.lastUsed ?? 0),
                        sortDirections: ['ascend', 'descend'],
                        render: (t) => (t ? new Date(t).toLocaleDateString(intl.locale) : '—'),
                      },
                      {
                        title: 'Flags',
                        render: (_, r) => (
                          <Space>
                            {r.duplicateWith?.length > 0 && <Tag color="orange">Dup</Tag>}
                            {r.lastUsed && r.lastUsed < Date.now() - 30 * 24 * 60 * 60 * 1000 && <Tag color="red">Zombie</Tag>}
                          </Space>
                        ),
                      },
                    ]}
                  />
                </Card>
              </>
            ),
          },
          {
            key: 'skillTool',
            label: intl.formatMessage({ id: 'skills.tabSkillTool' }) || 'Skill × Tool',
            children: (
              <>
                <Typography.Paragraph type="secondary" style={{ marginBottom: 8, fontSize: 12 }}>
                  {intl.formatMessage({ id: 'skills.skillToolHint' }) || 'Skill 调用由 read(skills/xxx/SKILL.md) 反推；同一会话内各工具的调用次数聚合。'}
                </Typography.Paragraph>
                <Typography.Paragraph type="secondary" style={{ marginBottom: 16, fontSize: 12 }}>
                  {intl.formatMessage({ id: 'skills.toolBreakdownHint' })}
                </Typography.Paragraph>
                {skillToolUsage.length > 0 ? (
                  <>
                    <Row gutter={16} style={{ marginBottom: 16 }}>
                      <Col xs={24} lg={12}>
                        <Card title={intl.formatMessage({ id: 'skills.skillToolChartTitle' }) || 'Skill × Tool 分布'}>
                          {(() => {
                            const allTools = [...new Set(skillToolUsage.flatMap((s) => s.tools.map((t) => t.toolName)))].slice(0, 8);
                            const chartData = skillToolUsage.slice(0, 15).map((s) => {
                              const row = { name: s.skillName };
                              const toolMap = Object.fromEntries((s.tools || []).map((t) => [t.toolName, t.count]));
                              allTools.forEach((t) => { row[t] = toolMap[t] ?? 0; });
                              return row;
                            });
                            return (
                              <ResponsiveContainer width="100%" height={Math.max(300, chartData.length * 36)}>
                                <BarChart data={chartData} layout="vertical" margin={{ left: 80, right: 20 }}>
                                  <CartesianGrid strokeDasharray="3 3" stroke={token.colorBorderSecondary} />
                                  <XAxis type="number" tick={{ fill: token.colorTextSecondary }} />
                                  <YAxis type="category" dataKey="name" width={75} tick={{ fill: token.colorTextSecondary, fontSize: 11 }} />
                                  <Tooltip contentStyle={{ background: token.colorBgElevated }} />
                                  <Legend />
                                  {allTools.map((toolName, i) => (
                                    <Bar
                                      key={toolName}
                                      dataKey={toolName}
                                      stackId="tools"
                                      name={toolName}
                                      fill={TOOL_COLORS[i % TOOL_COLORS.length]}
                                    />
                                  ))}
                                </BarChart>
                              </ResponsiveContainer>
                            );
                          })()}
                        </Card>
                      </Col>
                      <Col xs={24} lg={12}>
                        <Card title={intl.formatMessage({ id: 'skills.skillToolTableTitle' }) || 'Skill 工具明细'}>
                          <Table
                            size="small"
                            dataSource={skillToolUsage}
                            rowKey="skillName"
                            pagination={false}
                            scroll={{ y: 400 }}
                            columns={[
                              {
                                title: 'Skill',
                                dataIndex: 'skillName',
                                render: (n) => (
                                  <Typography.Text strong style={{ fontFamily: 'monospace' }}>
                                    {n}
                                  </Typography.Text>
                                ),
                              },
                              {
                                title: (
                                  <AntdTooltip title={intl.formatMessage({ id: 'skills.toolBreakdownHint' })}>
                                    <span>{intl.formatMessage({ id: 'skills.toolBreakdown' }) || '工具'} <Typography.Text type="secondary" style={{ fontSize: 11 }}>?</Typography.Text></span>
                                  </AntdTooltip>
                                ),
                                key: 'tools',
                                render: (_, r) => (
                                  <Space size={4} wrap>
                                    {(r.tools || []).map((t) => (
                                      <Tag key={t.toolName}>
                                        {t.toolName}: {t.count}
                                      </Tag>
                                    ))}
                                  </Space>
                                ),
                              },
                              {
                                title: 'Total',
                                dataIndex: 'totalToolCalls',
                                width: 70,
                              },
                            ]}
                          />
                        </Card>
                      </Col>
                    </Row>
                  </>
                ) : (
                  <Typography.Text type="secondary">—</Typography.Text>
                )}
              </>
            ),
          },
          {
            key: 'analysis',
            label: intl.formatMessage({ id: 'skills.tabAnalysis' }),
            children: systemPrompt ? (
              <Row gutter={[16, 16]}>
                <Col xs={24} lg={12}>
                  <Card title="Token split">
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie data={tokenDistributionData} cx="50%" cy="50%" outerRadius={90} dataKey="value" label>
                          {tokenDistributionData.map((_, i) => (
                            <Cell key={i} fill={COLORS[i % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </Card>
                </Col>
                <Col xs={24} lg={12}>
                  <Card title="Savings">
                    <Statistic title="Current" value={systemPrompt.totalTokens} />
                    <Statistic title="After" value={systemPrompt.totalTokens - systemPrompt.savings} valueStyle={{ color: token.colorSuccess }} />
                    <Typography.Paragraph>
                      Save {systemPrompt.savings} ({systemPrompt.savingsPercent}%)
                    </Typography.Paragraph>
                    <ul style={{ paddingLeft: 20, marginBottom: 12 }}>
                      {(systemPrompt.recommendations || []).map((rec, i) => (
                        <li key={i}><Typography.Text>{rec}</Typography.Text></li>
                      ))}
                    </ul>
                    {(systemPrompt.zombieSkillNames?.length > 0) && (
                      <div style={{ marginTop: 12 }}>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          {intl.formatMessage({ id: 'skills.zombieSkillList' })}：
                        </Typography.Text>
                        <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {(systemPrompt.zombieSkillNames || []).map((name) => (
                            <Tag key={name} color="red">{name}</Tag>
                          ))}
                        </div>
                      </div>
                    )}
                    {(systemPrompt.duplicateSkillNames?.length > 0) && (
                      <div style={{ marginTop: 12 }}>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          {intl.formatMessage({ id: 'skills.duplicateSkillList' })}：
                        </Typography.Text>
                        <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {(systemPrompt.duplicateSkillNames || []).map((name) => (
                            <Tag key={name} color="orange">{name}</Tag>
                          ))}
                        </div>
                      </div>
                    )}
                  </Card>
                </Col>
              </Row>
            ) : (
              <Typography.Text type="secondary">—</Typography.Text>
            ),
          },
        ]}
      />
    </div>
  );
}
