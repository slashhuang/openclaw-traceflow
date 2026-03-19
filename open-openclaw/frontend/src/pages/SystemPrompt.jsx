import React, { useState, useEffect, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import {
  Card,
  Row,
  Col,
  Typography,
  Spin,
  Alert,
  Collapse,
  Button,
  Table,
  theme,
  Space,
} from 'antd';
import { CopyOutlined } from '@ant-design/icons';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  LabelList,
} from 'recharts';
import { useIntl } from 'react-intl';

const BAR_PALETTE = ['#6366f1', '#8b5cf6', '#10b981', '#f59e0b', '#3b82f6', '#ec4899'];

function PreBlock({ text, emptyHint, token }) {
  const t = typeof text === 'string' ? text : '';
  if (!t.trim()) {
    return (
      <Alert type="warning" message={emptyHint || 'Empty'} style={{ fontSize: 12 }} />
    );
  }
  return (
    <pre
      style={{
        fontSize: 12,
        fontFamily: 'monospace',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        maxHeight: 'min(50vh, 420px)',
        overflow: 'auto',
        padding: 12,
        borderRadius: token.borderRadius,
        border: `1px solid ${token.colorBorder}`,
        background: token.colorFillQuaternary,
        color: token.colorText,
      }}
    >
      {t}
    </pre>
  );
}

export default function SystemPromptPage() {
  const intl = useIntl();
  const { token } = theme.useToken();
  const [probe, setProbe] = useState(null);
  const [probeLoading, setProbeLoading] = useState(true);
  const [analysis, setAnalysis] = useState(null);
  const [analysisLoading, setAnalysisLoading] = useState(true);
  const [skills, setSkills] = useState([]);
  const [showAllSkills, setShowAllSkills] = useState(false);
  const [showAllTools, setShowAllTools] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyFullMarkdown = () => {
    const text = probe?.systemPromptMarkdown || '';
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  useEffect(() => {
    let cancelled = false;
    // Probe 独立加载：避免阻塞整个页面渲染。
    (async () => {
      setProbeLoading(true);
      try {
        const probeRes = await fetch('/api/skills/system-prompt/probe');
        const probeData = await probeRes.json();
        if (!cancelled) setProbe(probeData);
      } catch (e) {
        if (!cancelled) setProbe({ ok: false, error: String(e.message || e), breakdown: [] });
      } finally {
        if (!cancelled) setProbeLoading(false);
      }
    })();

    // Analysis + skills 独立加载。
    (async () => {
      setAnalysisLoading(true);
      try {
        const [analysisRes, skillsRes] = await Promise.all([
          fetch('/api/skills/system-prompt/analysis'),
          fetch('/api/skills/usage'),
        ]);
        const [analysisData, skillsData] = await Promise.all([analysisRes.json(), skillsRes.json()]);
        if (!cancelled) {
          setAnalysis(analysisData);
          setSkills(Array.isArray(skillsData) ? skillsData : []);
        }
      } catch {
        // keep analysis null on failure
      } finally {
        if (!cancelled) setAnalysisLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const sections = probe?.sections || {
    fromTranscript: false,
    coreText: '',
    projectContextText: '',
    toolsListText: '',
    skillBlocks: [],
  };
  const breakdownItems = Array.isArray(probe?.breakdown) ? probe.breakdown : [];
  const workspaceFiles = Array.isArray(probe?.workspaceFiles) ? probe.workspaceFiles : [];
  const skillsDetail = Array.isArray(probe?.skillsDetail) ? probe.skillsDetail : [];
  const toolsDetail = Array.isArray(probe?.toolsDetail) ? probe.toolsDetail : [];
  const workspaceFileContents = Array.isArray(probe?.workspaceFileContents) ? probe.workspaceFileContents : [];
  const probeTotalTok = probe?.breakdown?.reduce((s, x) => s + (x.tokens || 0), 0) || 0;
  const skillsPreviewLimit = 30;
  const toolsPreviewLimit = 30;

  const collapseItems = useMemo(() => {
    if (!probe?.ok) return [];
    return breakdownItems.map((b) => {
      const isWorkspace = b.id === 'workspace';
      const isSkills = b.id === 'skills';
      const skillsShown = showAllSkills ? skillsDetail : skillsDetail.slice(0, skillsPreviewLimit);
      const toolsShown = showAllTools ? toolsDetail : toolsDetail.slice(0, toolsPreviewLimit);
      let children = null;
      if (b.id === 'core') {
        children = <PreBlock text={sections.coreText} token={token} />;
      } else if (b.id === 'project') {
        children = <PreBlock text={sections.projectContextText} token={token} />;
      } else if (b.id === 'tools_list') {
        children = <PreBlock text={sections.toolsListText} token={token} />;
      } else if (isWorkspace) {
        children = (
          <div>
            {workspaceFileContents.map((wf, i) => (
              <Collapse
                key={i}
                style={{ marginBottom: 8 }}
                items={[
                  {
                    key: '1',
                    label: wf.name || wf.path,
                    children: wf.readError ? (
                      <Typography.Text type="danger">{wf.readError}</Typography.Text>
                    ) : (
                      <PreBlock text={wf.content} token={token} emptyHint="Empty file" />
                    ),
                  },
                ]}
              />
            ))}
            <Table
              size="small"
              pagination={false}
              dataSource={workspaceFiles.map((f, j) => ({ ...f, key: j }))}
              columns={[
                { title: 'File', dataIndex: 'name', render: (_, r) => r.name || r.path },
                { title: 'Chars', dataIndex: 'injectedChars', align: 'right', render: (v) => (v ?? 0).toLocaleString() },
                { title: 'Trunc', dataIndex: 'truncated', render: (v) => (v ? 'Y' : '') },
              ]}
            />
          </div>
        );
      } else if (isSkills) {
        children =
          sections.skillBlocks?.length > 0 ? (
            sections.skillBlocks.map((sk, i) => (
              <Collapse
                key={i}
                style={{ marginBottom: 8 }}
                items={[{ key: '1', label: sk.name, children: <PreBlock text={sk.content} token={token} /> }]}
              />
            ))
          ) : (
            <div>
              <Space style={{ marginBottom: 8 }}>
                <Typography.Text type="secondary">
                  {skillsShown.length}/{skillsDetail.length}
                </Typography.Text>
                {skillsDetail.length > skillsPreviewLimit && (
                  <Button type="link" size="small" onClick={() => setShowAllSkills(!showAllSkills)}>
                    {showAllSkills ? 'Less' : 'More'}
                  </Button>
                )}
              </Space>
              <Table
                size="small"
                dataSource={skillsShown.map((s, i) => ({ ...s, key: i }))}
                columns={[
                  { title: 'Skill', dataIndex: 'name' },
                  { title: 'Chars', dataIndex: 'blockChars', align: 'right', render: (v) => v?.toLocaleString() },
                ]}
                pagination={false}
              />
            </div>
          );
      } else if (b.id === 'tools_schema') {
        children = (
          <div>
            <Alert
              type="info"
              showIcon
              message="JSON Schema not in system text; stats from Gateway report."
              style={{ marginBottom: 8 }}
            />
            <Space>
              <Button type="link" size="small" onClick={() => setShowAllTools(!showAllTools)}>
                {showAllTools ? 'Less' : 'More'}
              </Button>
            </Space>
            <Table
              size="small"
              dataSource={toolsShown.map((t, i) => ({ ...t, key: i }))}
              columns={[
                { title: 'Tool', dataIndex: 'name' },
                { title: 'Schema chars', dataIndex: 'schemaChars', align: 'right' },
                { title: 'Props', dataIndex: 'propertiesCount', align: 'right' },
              ]}
              pagination={false}
            />
          </div>
        );
      } else if ((b.chars || 0) === 0 && !isWorkspace && !isSkills) {
        children = <Typography.Text type="secondary">—</Typography.Text>;
      }
      return {
        key: b.id,
        label: (
          <Space>
            <span>{b.label}</span>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              ~{b.tokens} tok · {b.percent}%
            </Typography.Text>
          </Space>
        ),
        children: (
          <div>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {b.chars?.toLocaleString()} chars
            </Typography.Text>
            {children}
          </div>
        ),
      };
    });
  }, [
    probe?.ok,
    breakdownItems,
    sections,
    workspaceFiles,
    workspaceFileContents,
    skillsDetail,
    toolsDetail,
    showAllSkills,
    showAllTools,
    token,
  ]);

  const tokenDistribution = analysis
    ? [
        { name: intl.locale === 'zh-CN' ? '活跃' : 'Active', value: analysis.activeSkillsTokens, color: '#10B981' },
        { name: intl.locale === 'zh-CN' ? '僵尸' : 'Zombie', value: analysis.zombieSkillsTokens, color: '#EF4444' },
        { name: intl.locale === 'zh-CN' ? '重复' : 'Dup', value: analysis.duplicateSkillsTokens, color: '#F59E0B' },
      ]
    : [];

  const zombieSkills = skills.filter(
    (s) => s.lastUsed && s.lastUsed < Date.now() - 30 * 24 * 60 * 60 * 1000,
  );
  const duplicateSkills = skills.filter((s) => s.duplicateWith?.length > 0);

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto' }}>
      <Typography.Title level={4}>{intl.formatMessage({ id: 'menu.systemPrompt' })}</Typography.Title>
      <Typography.Paragraph type="secondary">
        Gateway · systemPromptReport · transcript system messages.
      </Typography.Paragraph>

      {/* 仅展示「真实发给大模型的」system 正文；无 transcript 时不冒充 report 概览为正文 */}
      {(probeLoading || probe?.ok) && (
        <Card
          title={intl.formatMessage({ id: 'systemPrompt.fullTitle' })}
          style={{ marginBottom: 16 }}
          extra={
            (probe?.systemPromptMarkdown?.length > 0) && (
              <Button
                type="default"
                icon={<CopyOutlined />}
                onClick={copyFullMarkdown}
              >
                {copied ? intl.formatMessage({ id: 'systemPrompt.copied' }) : intl.formatMessage({ id: 'systemPrompt.copy' })}
              </Button>
            )
          }
        >
          {probeLoading ? (
            <Spin style={{ display: 'block', margin: '8px 0' }} />
          ) : probe.systemPromptSource === 'rebuild' ? (
            <Alert
              type="info"
              showIcon
              message={intl.formatMessage({ id: 'systemPrompt.fromRebuild' })}
              style={{ marginBottom: 12 }}
            />
          ) : (
            <Alert
              type="warning"
              showIcon
              message={intl.formatMessage({ id: 'systemPrompt.noRealPrompt' })}
              style={{ marginBottom: 12 }}
            />
          )}
          <div
            className="system-prompt-md"
            style={{
              maxHeight: '70vh',
              minHeight: 120,
              overflow: 'auto',
              fontSize: 13,
              padding: 16,
              border: `1px solid ${token.colorBorder}`,
              borderRadius: token.borderRadius,
              background: token.colorFillQuaternary,
            }}
          >
            {probe?.systemPromptMarkdown?.length > 0 ? (
              <ReactMarkdown>{probe?.systemPromptMarkdown}</ReactMarkdown>
            ) : (
              <Typography.Text type="secondary">{intl.formatMessage({ id: 'systemPrompt.noContent' })}</Typography.Text>
            )}
          </div>
        </Card>
      )}

      <Card title={intl.formatMessage({ id: 'systemPrompt.breakdownTitle' })} style={{ marginBottom: 16 }}>
        {probeLoading ? (
          <Spin style={{ display: 'block', margin: '8px 0' }} />
        ) : !probe?.ok ? (
          <Alert type="warning" showIcon message={probe?.error || 'Error'} style={{ marginBottom: 16 }} />
        ) : (
          <>
            <Space wrap size="middle" style={{ marginBottom: 12 }}>
              {probe.sessionKey && <Typography.Text code>{probe.sessionKey}</Typography.Text>}
              {probe.model && <span>Model: {probe.model}</span>}
              {probe.workspaceDir && (
                <Typography.Text
                  code
                  title={probe.workspaceDir}
                  style={{
                    wordBreak: 'break-all',
                  }}
                >
                  WS: {probe.workspaceDir}
                </Typography.Text>
              )}
            </Space>
            <Row gutter={[16, 16]}>
              <Col xs={24} lg={12}>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart layout="vertical" data={probe.breakdown} margin={{ left: 8, right: 80, top: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={token.colorBorderSecondary} />
                    <XAxis type="number" tick={{ fontSize: 11, fill: token.colorTextSecondary }} />
                    <YAxis type="category" dataKey="label" width={160} tick={{ fontSize: 10, fill: token.colorTextSecondary }} interval={0} />
                    <Tooltip
                      contentStyle={{ background: token.colorBgElevated }}
                      formatter={(v, _n, p) => [`${v} tok (${p?.payload?.chars ?? '?'} chars)`, '~']}
                    />
                    <Bar dataKey="tokens" radius={[0, 4, 4, 0]}>
                      {probe.breakdown.map((_, i) => (
                        <Cell key={i} fill={BAR_PALETTE[i % BAR_PALETTE.length]} />
                      ))}
                      <LabelList dataKey="percent" position="right" formatter={(v) => `${v}%`} style={{ fontSize: 11, fill: token.colorTextSecondary }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <Typography.Text type="secondary">Total ~{probeTotalTok.toLocaleString()} tokens</Typography.Text>
              </Col>
              <Col xs={24} lg={12}>
                <Typography.Text strong>Blocks</Typography.Text>
                <Collapse items={collapseItems} style={{ marginTop: 8 }} />
              </Col>
            </Row>
          </>
        )}
      </Card>

      {analysis && (
        <>
          <Typography.Title level={5}>Skills dir · analysis</Typography.Title>
          <Row gutter={16} style={{ marginBottom: 24 }}>
            <Col xs={24} lg={12}>
              <Card>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie data={tokenDistribution} cx="50%" cy="50%" outerRadius={100} dataKey="value" label>
                      {tokenDistribution.map((e, i) => (
                        <Cell key={i} fill={e.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => v?.toLocaleString()} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </Card>
            </Col>
            <Col xs={24} lg={12}>
              <Card title="Savings">
                <Typography.Paragraph>Current: {analysis.totalTokens.toLocaleString()}</Typography.Paragraph>
                <Typography.Paragraph type="success">
                  After: {(analysis.totalTokens - analysis.savings).toLocaleString()} (−{analysis.savings}, {analysis.savingsPercent}%)
                </Typography.Paragraph>
                <ul>
                  {(analysis.recommendations || []).map((rec, i) => (
                    <li key={i}>{rec}</li>
                  ))}
                </ul>
              </Card>
            </Col>
          </Row>
        </>
      )}

      {zombieSkills.length > 0 && (
        <Card title="Zombie skills" style={{ marginBottom: 16 }}>
          <Table
            size="small"
            dataSource={zombieSkills.slice(0, 20).map((s, i) => ({ ...s, key: i }))}
            columns={[
              { title: 'Name', dataIndex: 'name' },
              { title: 'Tokens', dataIndex: 'tokenCount' },
            ]}
            pagination={false}
          />
        </Card>
      )}

      {duplicateSkills.length > 0 && (
        <Card title="Duplicate skills">
          {duplicateSkills.slice(0, 15).map((s, i) => (
            <Typography.Paragraph key={i}>
              <strong>{s.name}</strong> ↔ {s.duplicateWith?.join(', ')}
            </Typography.Paragraph>
          ))}
        </Card>
      )}
    </div>
  );
}
