import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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
  Tag,
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
} from 'recharts';
import { useIntl } from 'react-intl';
import SectionScopeHint from '../components/SectionScopeHint';

/** OpenClaw buildAgentSystemPrompt 组装顺序，用于摘要锚点 */
const ASSEMBLY_ORDER = [
  { id: 'identity', label: 'Identity' },
  { id: 'tooling', label: 'Tooling' },
  { id: 'safety', label: 'Safety' },
  { id: 'openclaw-cli-quick-reference', label: 'OpenClaw CLI' },
  { id: 'skills-mandatory', label: 'Skills' },
  { id: 'workspace', label: 'Workspace' },
  { id: 'workspace-files-injected', label: 'Workspace Files' },
  { id: 'project-context', label: 'Project Context' },
  { id: 'silent-replies', label: 'Silent Replies' },
  { id: 'heartbeats', label: 'Heartbeats' },
  { id: 'runtime', label: 'Runtime' },
];

function slugify(text) {
  return String(text)
    .replace(/\s+/g, '-')
    .replace(/[()]/g, '')
    .replace(/--+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

/** 按 ## / # 分块，每块有 id、title、content，便于锚点滚动 */
function parseSystemPromptChunks(markdown) {
  if (!markdown || typeof markdown !== 'string') return [];
  const chunks = [];
  const lines = markdown.split('\n');
  let current = { id: 'identity', title: 'Identity', content: [] };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const headerMatch = line.match(/^(#+)\s+(.+)$/);
    if (headerMatch) {
      const [, hashes, title] = headerMatch;
      const titleTrim = title.trim();
      const id = slugify(titleTrim);
      if (current.content.length > 0 || current.id !== 'identity') {
        chunks.push({ ...current, content: current.content.join('\n').trimEnd() });
      }
      current = { id, title: titleTrim, content: [line] };
    } else {
      current.content.push(line);
    }
  }
  if (current.content.length > 0) {
    chunks.push({ ...current, content: current.content.join('\n').trimEnd() });
  }
  return chunks;
}

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
  const scrollContainerRef = useRef(null);

  const scrollToSection = useCallback((id) => {
    const container = scrollContainerRef.current;
    const target = document.getElementById(id);
    if (container) {
      if (target) {
        const targetRect = target.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        const scrollTop = container.scrollTop + (targetRect.top - containerRect.top) - 12;
        container.scrollTo({ top: Math.max(0, scrollTop), behavior: 'smooth' });
      } else if (id === 'identity') {
        container.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
  }, []);

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
  const skillsSnapshot = probe?.skillsSnapshot;
  const skillsPreviewLimit = 30;
  const toolsPreviewLimit = 30;

  const promptChunks = useMemo(
    () => parseSystemPromptChunks(probe?.systemPromptMarkdown),
    [probe?.systemPromptMarkdown],
  );

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
              message={intl.formatMessage({ id: 'systemPrompt.toolsSchemaHintTitle' })}
              description={intl.formatMessage({ id: 'systemPrompt.toolsSchemaHint' })}
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

  const copySkillsPrompt = () => {
    if (!skillsSnapshot?.prompt) return;
    navigator.clipboard.writeText(skillsSnapshot.prompt).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Typography.Title level={4} style={{ margin: 0 }}>{intl.formatMessage({ id: 'menu.systemPrompt' })}</Typography.Title>
        <SectionScopeHint intl={intl} messageId="systemPrompt.pageScopeDesc" />
      </div>
      <Typography.Paragraph type="secondary">
        Gateway · systemPromptReport · sessions.json.
      </Typography.Paragraph>

      {/* 完整 System Prompt 默认收起，点击展开 */}
      {(probeLoading || probe?.ok) && (
        <Collapse
          style={{ marginBottom: 16 }}
          items={[
            {
              key: 'full',
              label: (
                <Space>
                  <Typography.Text strong>{intl.formatMessage({ id: 'systemPrompt.fullTitle' })}</Typography.Text>
                  <SectionScopeHint intl={intl} messageId="systemPrompt.fullCollapseScopeDesc" />
                  {probe?.systemPromptMarkdown?.length > 0 && (
                    <Button
                      type="text"
                      size="small"
                      icon={<CopyOutlined />}
                      onClick={(e) => {
                        e.stopPropagation();
                        copyFullMarkdown();
                      }}
                    >
                      {copied ? intl.formatMessage({ id: 'systemPrompt.copied' }) : intl.formatMessage({ id: 'systemPrompt.copy' })}
                    </Button>
                  )}
                </Space>
              ),
              children: (
                <>
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
                  {probe?.systemPromptMarkdown?.length > 0 && (
                    <div style={{ marginBottom: 12 }}>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        {intl.formatMessage({ id: 'systemPrompt.assemblyToc' })}：
                      </Typography.Text>
                      <Space size="small" wrap style={{ marginTop: 6 }}>
                        {ASSEMBLY_ORDER.filter(({ id }) =>
                          promptChunks.some((c) => c.id === id) || id === 'identity',
                        ).map(({ id, label }) => (
                          <Button
                            key={id}
                            type="link"
                            size="small"
                            style={{ padding: '0 6px', height: 'auto', fontSize: 12 }}
                            onClick={() => scrollToSection(id)}
                          >
                            {label}
                          </Button>
                        ))}
                      </Space>
                    </div>
                  )}
                  <div
                    ref={scrollContainerRef}
                    className="system-prompt-md"
                    style={{
                      maxHeight: '70vh',
                      minHeight: 120,
                      overflow: 'auto',
                      fontSize: 13,
                      padding: '12px 16px',
                      border: `1px solid ${token.colorBorder}`,
                      borderRadius: token.borderRadius,
                      background: token.colorFillQuaternary,
                    }}
                  >
                    {probe?.systemPromptMarkdown?.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                        {promptChunks.map((chunk) => (
                          <section
                            key={chunk.id}
                            id={chunk.id}
                            style={{
                              paddingBottom: 20,
                              borderBottom: chunk.id !== promptChunks[promptChunks.length - 1]?.id
                                ? `1px solid ${token.colorBorderSecondary || token.colorBorder}`
                                : 'none',
                            }}
                          >
                            <ReactMarkdown
                              components={{
                                h1: ({ children, ...props }) => (
                                  <h1 style={{ marginTop: 0, marginBottom: 12, fontSize: 16 }} {...props}>{children}</h1>
                                ),
                                h2: ({ children, ...props }) => (
                                  <h2 style={{ marginTop: 0, marginBottom: 10, fontSize: 14 }} {...props}>{children}</h2>
                                ),
                                p: ({ children, ...props }) => (
                                  <p style={{ margin: '0 0 8px' }} {...props}>{children}</p>
                                ),
                              }}
                            >
                              {chunk.content}
                            </ReactMarkdown>
                          </section>
                        ))}
                      </div>
                    ) : (
                      <Typography.Text type="secondary">{intl.formatMessage({ id: 'systemPrompt.noContent' })}</Typography.Text>
                    )}
                  </div>
                </>
              ),
            },
          ]}
          defaultActiveKey={[]}
        />
      )}

      <Card
        title={intl.formatMessage({ id: 'systemPrompt.breakdownTitle' })}
        extra={<SectionScopeHint intl={intl} messageId="systemPrompt.breakdownCardScopeDesc" />}
        style={{ marginBottom: 16 }}
      >
        {probeLoading ? (
          <Spin style={{ display: 'block', margin: '8px 0' }} />
        ) : !probe?.ok ? (
          <Alert type="warning" showIcon message={probe?.error || 'Error'} style={{ marginBottom: 16 }} />
        ) : (
          <>
            <Space wrap size="middle" style={{ marginBottom: 16 }}>
              {probe.sessionKey && <Typography.Text code>{probe.sessionKey}</Typography.Text>}
              {probe.model && <span>Model: {probe.model}</span>}
              {probe.workspaceDir && (
                <Typography.Text
                  code
                  title={probe.workspaceDir}
                  style={{ wordBreak: 'break-all' }}
                >
                  WS: {probe.workspaceDir}
                </Typography.Text>
              )}
              <Typography.Text type="secondary">Total ~{probeTotalTok.toLocaleString()} tokens</Typography.Text>
            </Space>
            <Row gutter={[16, 16]}>
              <Col xs={24} lg={12}>
                <Row gutter={[16, 16]}>
                  {collapseItems.slice(0, 3).map((item, i) => {
                    const idx = i;
                    const b = breakdownItems[idx];
                    return (
                      <Col xs={24} key={item.key}>
                        <Card
                          size="small"
                          title={
                            <Typography.Text style={{ wordBreak: 'break-word' }}>
                              {b?.label}
                            </Typography.Text>
                          }
                          extra={
                            <Typography.Text type="secondary" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
                              ~{b?.tokens ?? 0} tok · {b?.percent ?? 0}%
                            </Typography.Text>
                          }
                        >
                          <Collapse
                            size="small"
                            items={[
                              {
                                key: item.key,
                                label: (
                                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                                    {b?.chars?.toLocaleString()} chars · {intl.formatMessage({ id: 'systemPrompt.expandHint' })}
                                  </Typography.Text>
                                ),
                                children: item.children,
                              },
                            ]}
                            defaultActiveKey={[]}
                          />
                        </Card>
                      </Col>
                    );
                  })}
                </Row>
              </Col>
              <Col xs={24} lg={12}>
                <Row gutter={[16, 16]}>
                  {collapseItems.slice(3, 6).map((item, i) => {
                    const idx = i + 3;
                    const b = breakdownItems[idx];
                    return (
                      <Col xs={24} key={item.key}>
                        <Card
                          size="small"
                          title={
                            <Typography.Text style={{ wordBreak: 'break-word' }}>
                              {b?.label}
                            </Typography.Text>
                          }
                          extra={
                            <Typography.Text type="secondary" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
                              ~{b?.tokens ?? 0} tok · {b?.percent ?? 0}%
                            </Typography.Text>
                          }
                        >
                          <Collapse
                            size="small"
                            items={[
                              {
                                key: item.key,
                                label: (
                                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                                    {b?.chars?.toLocaleString()} chars · {intl.formatMessage({ id: 'systemPrompt.expandHint' })}
                                  </Typography.Text>
                                ),
                                children: item.children,
                              },
                            ]}
                            defaultActiveKey={[]}
                          />
                        </Card>
                      </Col>
                    );
                  })}
                </Row>
              </Col>
            </Row>
          </>
        )}
      </Card>

      {analysis && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Typography.Title level={5} style={{ margin: 0 }}>Skills dir · analysis</Typography.Title>
            <SectionScopeHint intl={intl} messageId="systemPrompt.analysisBlockScopeDesc" />
          </div>
          <Row gutter={16} style={{ marginBottom: 24 }}>
            <Col xs={24} lg={12}>
              <Card
                title={intl.formatMessage({ id: 'skills.analysisTokenPieTitle' })}
                extra={<SectionScopeHint intl={intl} messageId="systemPrompt.analysisBlockScopeDesc" />}
              >
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
              <Card
                title={intl.formatMessage({ id: 'skills.analysisSavingsTitle' })}
                extra={<SectionScopeHint intl={intl} messageId="systemPrompt.analysisBlockScopeDesc" />}
              >
                <Typography.Paragraph>Current: {analysis.totalTokens.toLocaleString()}</Typography.Paragraph>
                <Typography.Paragraph type="success">
                  After: {(analysis.totalTokens - analysis.savings).toLocaleString()} (−{analysis.savings}, {analysis.savingsPercent}%)
                </Typography.Paragraph>
                <ul>
                  {(analysis.recommendations || []).map((rec, i) => (
                    <li key={i}>{rec}</li>
                  ))}
                </ul>
                {(analysis.zombieSkillNames?.length > 0) && (
                  <div style={{ marginTop: 12 }}>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      {intl.locale === 'zh-CN' ? '僵尸 skills：' : 'Zombie skills: '}
                    </Typography.Text>
                    <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {(analysis.zombieSkillNames || []).map((name) => (
                        <Tag key={name} color="red">{name}</Tag>
                      ))}
                    </div>
                  </div>
                )}
                {(analysis.duplicateSkillNames?.length > 0) && (
                  <div style={{ marginTop: 12 }}>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      {intl.locale === 'zh-CN' ? '重复 skills：' : 'Duplicate skills: '}
                    </Typography.Text>
                    <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {(analysis.duplicateSkillNames || []).map((name) => (
                        <Tag key={name} color="orange">{name}</Tag>
                      ))}
                    </div>
                  </div>
                )}
              </Card>
            </Col>
          </Row>
        </>
      )}

      {zombieSkills.length > 0 && (
        <Card
          title="Zombie skills"
          extra={<SectionScopeHint intl={intl} messageId="systemPrompt.zombieDuplicateCardScopeDesc" />}
          style={{ marginBottom: 16 }}
        >
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
        <Card
          title="Duplicate skills"
          extra={<SectionScopeHint intl={intl} messageId="systemPrompt.zombieDuplicateCardScopeDesc" />}
          style={{ marginBottom: 16 }}
        >
          {duplicateSkills.slice(0, 15).map((s, i) => (
            <Typography.Paragraph key={i}>
              <strong>{s.name}</strong> ↔ {s.duplicateWith?.join(', ')}
            </Typography.Paragraph>
          ))}
        </Card>
      )}

      {/* Skills 快照：页面底部，来自 sessions.json，展示当前注入的 skills 列表与提示词 */}
      {skillsSnapshot && (skillsSnapshot.skills?.length > 0 || skillsSnapshot.prompt) && (
        <Card
          title={intl.formatMessage({ id: 'systemPrompt.skillsSnapshotTitle' })}
          extra={
            <Space size="small">
              {skillsSnapshot.prompt && (
                <Button type="text" size="small" icon={<CopyOutlined />} onClick={copySkillsPrompt}>
                  {copied ? intl.formatMessage({ id: 'systemPrompt.copied' }) : intl.formatMessage({ id: 'systemPrompt.copy' })}
                </Button>
              )}
              <SectionScopeHint intl={intl} messageId="systemPrompt.skillsSnapshotDesc" />
            </Space>
          }
        >
          <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 16 }}>
            {intl.formatMessage({ id: 'systemPrompt.skillsSnapshotDesc' })}
          </Typography.Paragraph>
          {skillsSnapshot.skills?.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <Typography.Text strong style={{ fontSize: 13 }}>
                {intl.formatMessage({ id: 'systemPrompt.skillsList' })}
              </Typography.Text>
              <Typography.Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>
                {intl.locale === 'zh-CN' ? `共 ${skillsSnapshot.skills.length} 个` : `${skillsSnapshot.skills.length} skills`}
              </Typography.Text>
              <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {skillsSnapshot.skills.map((s) => (
                  <Tag key={s.name}>{s.name}</Tag>
                ))}
              </div>
            </div>
          )}
          {skillsSnapshot.prompt && (
            <div>
              <Typography.Text strong style={{ fontSize: 13 }}>
                {intl.formatMessage({ id: 'systemPrompt.skillsPrompt' })}
              </Typography.Text>
              <Typography.Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>
                {intl.locale === 'zh-CN' ? '注入到 system prompt 的 XML 文本，含 name/description/location' : 'XML injected into system prompt (name, description, location)'}
              </Typography.Text>
              <pre
                style={{
                  margin: '10px 0 0',
                  padding: 12,
                  fontSize: 11,
                  maxHeight: 360,
                  overflow: 'auto',
                  fontFamily: 'monospace',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                  borderRadius: token.borderRadius,
                  border: `1px solid ${token.colorBorder}`,
                  background: token.colorFillQuaternary,
                }}
              >
                {skillsSnapshot.prompt}
              </pre>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
