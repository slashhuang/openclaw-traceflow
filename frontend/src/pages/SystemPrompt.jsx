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
import { useIntl } from 'react-intl';
import SectionScopeHint from '../components/SectionScopeHint';

/** 避免 undefined/非数字调用 toLocaleString 导致运行时崩溃 */
function safeLocaleNum(n) {
  const x = Number(n);
  return (Number.isFinite(x) ? x : 0).toLocaleString();
}

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

/** breakdown 优先级排序：OpenClaw Project Context / 引导文件优先 */
const BREAKDOWN_PRIORITY_MAP = {
  'project': 1,      // Project Context: AGENTS.md、IDENTITY.md 等
  'workspace': 2,    // Workspace Files: 其他工作区文件
  'core': 3,         // Core: 核心系统提示
  'skills': 4,       // Skills
  'tools_list': 5,   // Tools List
  'tools_schema': 6, // Tools Schema
};

function sortBreakdownItems(items) {
  return [...items].sort((a, b) => {
    const priorityA = BREAKDOWN_PRIORITY_MAP[a.id] || 999;
    const priorityB = BREAKDOWN_PRIORITY_MAP[b.id] || 999;
    return priorityA - priorityB;
  });
}

/** 与 OpenClaw docs/concepts/system-prompt.md「Workspace bootstrap injection」顺序一致 */
function workspaceBasename(p) {
  const s = String(p || '').replace(/\\/g, '/').split('/').pop() || '';
  return s.toLowerCase();
}

/** 与 OpenClaw 注入顺序对齐；前四为核心引导（默认展开），后四为其余（默认收起） */
const BOOTSTRAP_CATALOG = [
  { id: 'agents', label: 'AGENTS.md', match: (bn) => bn === 'agents.md' },
  { id: 'soul', label: 'SOUL.md', match: (bn) => bn === 'soul.md' },
  { id: 'identity', label: 'IDENTITY.md', match: (bn) => bn === 'identity.md' },
  { id: 'user', label: 'USER.md', match: (bn) => bn === 'user.md' },
  { id: 'tools', label: 'TOOLS.md', match: (bn) => bn === 'tools.md' },
  { id: 'heartbeat', label: 'HEARTBEAT.md', match: (bn) => bn === 'heartbeat.md' },
  { id: 'bootstrap', label: 'BOOTSTRAP.md', match: (bn) => bn === 'bootstrap.md' },
  { id: 'memory', label: 'MEMORY.md / memory.md', match: (bn) => bn === 'memory.md' },
];

const TIER_A_IDS = ['agents', 'soul', 'identity', 'user'];
const TIER_B_IDS = ['tools', 'heartbeat', 'bootstrap', 'memory'];

function mergeWorkspaceFileContentsForProbe(probe) {
  const workspaceFileContents = Array.isArray(probe?.workspaceFileContents) ? probe.workspaceFileContents : [];
  if (!probe?.injectedWorkspaceFiles || probe.injectedWorkspaceFiles.length === 0) {
    return workspaceFileContents;
  }
  const injectedMap = new Map(probe.injectedWorkspaceFiles.map((f) => [f.name || f.path, f]));
  return workspaceFileContents.map((wf) => {
    const injected = injectedMap.get(wf.name || wf.path);
    if (injected) {
      return {
        ...wf,
        content: `// sessions.json injectedWorkspaceFiles\n// Path: ${injected.path || wf.path}\n\n${wf.content}`,
        injected: true,
      };
    }
    return wf;
  });
}

function resolveBootstrapRow(entry, mergedContents, injectedWorkspaceFiles) {
  let hit = null;
  for (const wf of mergedContents) {
    const bn = workspaceBasename(wf.name || wf.path);
    if (entry.match(bn)) {
      hit = wf;
      break;
    }
  }
  const injectedFromList =
    Array.isArray(injectedWorkspaceFiles) &&
    injectedWorkspaceFiles.some((f) => entry.match(workspaceBasename(f.name || f.path)));
  const injected = !!(hit?.injected || injectedFromList);
  const chars = hit?.content != null ? String(hit.content).length : 0;
  const missing = !hit;
  const empty = !!(hit && !String(hit.content || '').trim());
  return { hit, injected, chars, missing, empty };
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

function buildBootstrapTierPanels(tierIds, merged, injectedWorkspaceFiles, intl, token) {
  return tierIds
    .map((id) => BOOTSTRAP_CATALOG.find((c) => c.id === id))
    .filter(Boolean)
    .map((entry) => {
      const { hit, injected, chars, missing, empty } = resolveBootstrapRow(
        entry,
        merged,
        injectedWorkspaceFiles,
      );
      const role = intl.formatMessage({ id: `systemPrompt.bootstrap.${entry.id}.role` });
      const tip = intl.formatMessage({ id: `systemPrompt.bootstrap.${entry.id}.tip` });
      return {
        key: entry.id,
        label: (
          <Space wrap size="small">
            <Typography.Text strong style={{ fontFamily: 'monospace', fontSize: 13 }}>
              {entry.label}
            </Typography.Text>
            {injected && (
              <Tag color="blue">
                📌 {intl.formatMessage({ id: 'systemPrompt.bootstrap.tagInjected' })}
              </Tag>
            )}
            {missing && (
              <Tag color="default">{intl.formatMessage({ id: 'systemPrompt.bootstrap.tagMissing' })}</Tag>
            )}
            {empty && !missing && (
              <Tag color="orange">{intl.formatMessage({ id: 'systemPrompt.bootstrap.tagEmpty' })}</Tag>
            )}
            {!missing && (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {intl.formatMessage({ id: 'systemPrompt.bootstrap.charsLabel' }, { count: safeLocaleNum(chars) })}
              </Typography.Text>
            )}
          </Space>
        ),
        children: (
          <div>
            <Typography.Paragraph style={{ marginBottom: 8 }}>{role}</Typography.Paragraph>
            <Typography.Paragraph type="secondary" style={{ marginBottom: 12, fontSize: 13 }}>
              {tip}
            </Typography.Paragraph>
            {hit?.readError && (
              <Typography.Text type="danger" style={{ display: 'block', marginBottom: 8 }}>
                {hit.readError}
              </Typography.Text>
            )}
            {hit && !missing ? (
              <PreBlock
                text={hit.content}
                token={token}
                emptyHint={intl.formatMessage({ id: 'systemPrompt.emptyFileHint' })}
              />
            ) : (
              <Alert type="warning" message={intl.formatMessage({ id: 'systemPrompt.bootstrap.tagMissing' })} />
            )}
          </div>
        ),
      };
    });
}

/** 引导 Markdown → # Project Context 汇总 → Skills 快照（均无跳转） */
function HarnessBootstrapStack({
  probe,
  probeLoading,
  sections,
  token,
  intl,
  skillsSnapshot,
  copied,
  onCopySkillsPrompt,
}) {
  const workspaceFiles = Array.isArray(probe?.workspaceFiles) ? probe.workspaceFiles : [];
  const workspaceFileContents = Array.isArray(probe?.workspaceFileContents) ? probe.workspaceFileContents : [];

  const mergedWorkspaceFiles = useMemo(() => {
    if (!probe?.injectedWorkspaceFiles || probe.injectedWorkspaceFiles.length === 0) {
      return workspaceFiles;
    }
    const injectedMap = new Map(probe.injectedWorkspaceFiles.map((f) => [f.name || f.path, f]));
    return workspaceFiles.map((f) => {
      const injected = injectedMap.get(f.name || f.path);
      return injected ? { ...f, ...injected, injected: true } : f;
    });
  }, [probe?.injectedWorkspaceFiles, workspaceFiles]);

  const mergedWorkspaceFileContents = useMemo(() => {
    if (!probe?.injectedWorkspaceFiles || probe.injectedWorkspaceFiles.length === 0) {
      return workspaceFileContents;
    }
    const injectedMap = new Map(probe.injectedWorkspaceFiles.map((f) => [f.name || f.path, f]));
    return workspaceFileContents.map((wf) => {
      const injected = injectedMap.get(wf.name || wf.path);
      if (injected) {
        return {
          ...wf,
          content: `// 来自 sessions.json injectedWorkspaceFiles\n// Path: ${injected.path || wf.path}\n\n${wf.content}`,
          injected: true,
        };
      }
      return wf;
    });
  }, [probe?.injectedWorkspaceFiles, workspaceFileContents]);

  const mergedForBootstrap = useMemo(() => {
    if (!probe?.ok) return [];
    return mergeWorkspaceFileContentsForProbe(probe);
  }, [probe]);

  const tierAPanels = useMemo(
    () =>
      buildBootstrapTierPanels(
        TIER_A_IDS,
        mergedForBootstrap,
        probe?.injectedWorkspaceFiles,
        intl,
        token,
      ),
    [mergedForBootstrap, probe?.injectedWorkspaceFiles, intl, token],
  );

  const tierBPanels = useMemo(
    () =>
      buildBootstrapTierPanels(
        TIER_B_IDS,
        mergedForBootstrap,
        probe?.injectedWorkspaceFiles,
        intl,
        token,
      ),
    [mergedForBootstrap, probe?.injectedWorkspaceFiles, intl, token],
  );

  const otherFiles = useMemo(() => {
    if (!probe?.ok) return [];
    return mergedWorkspaceFileContents.filter(
      (wf) => !BOOTSTRAP_CATALOG.some((c) => c.match(workspaceBasename(wf.name || wf.path))),
    );
  }, [probe?.ok, mergedWorkspaceFileContents]);

  const projectBreakdown = probe?.ok ? probe.breakdown?.find((b) => b.id === 'project') : undefined;
  const workspaceBreakdown = probe?.ok ? probe.breakdown?.find((b) => b.id === 'workspace') : undefined;
  const totalFiles = mergedWorkspaceFileContents.length;
  const totalTokensRaw =
    (Number(projectBreakdown?.tokens) || 0) + (Number(workspaceBreakdown?.tokens) || 0);
  const totalTokens = Number.isFinite(totalTokensRaw) ? totalTokensRaw : 0;

  const projectContextText = sections?.projectContextText || '';
  const hasSkills = !!(skillsSnapshot && (skillsSnapshot.skills?.length > 0 || skillsSnapshot.prompt));

  if (probeLoading) {
    return (
      <Card style={{ marginBottom: 16 }}>
        <Spin style={{ display: 'block', margin: '24px 0' }} />
      </Card>
    );
  }

  if (!probe?.ok) {
    return (
      <Card style={{ marginBottom: 16 }}>
        <Alert type="warning" showIcon message={probe?.error || 'Probe failed'} />
      </Card>
    );
  }

  const otherFilesCollapseItems =
    otherFiles.length > 0
      ? [
          {
            key: 'other-md',
            label: `${intl.formatMessage({ id: 'systemPrompt.harness.otherFilesTitle' })} (${otherFiles.length})`,
            children: (
              <div>
                {probe.injectedWorkspaceFiles && probe.injectedWorkspaceFiles.length > 0 && (
                  <Alert
                    type="info"
                    showIcon
                    message={intl.formatMessage(
                      { id: 'systemPrompt.injectedMergeHint' },
                      { count: probe.injectedWorkspaceFiles.length },
                    )}
                    style={{ marginBottom: 12 }}
                  />
                )}
                {otherFiles.map((wf, i) => (
                  <Collapse
                    key={`${wf.name || wf.path}-${i}`}
                    style={{ marginBottom: 8 }}
                    defaultActiveKey={[]}
                    items={[
                      {
                        key: '1',
                        label: (
                          <Space wrap>
                            <Typography.Text strong>{wf.name || wf.path}</Typography.Text>
                            {wf.injected && (
                              <Tag color="blue">
                                📌 {intl.formatMessage({ id: 'systemPrompt.bootstrap.tagInjected' })}
                              </Tag>
                            )}
                            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                              {intl.formatMessage(
                                { id: 'systemPrompt.bootstrap.charsLabel' },
                                { count: safeLocaleNum(String(wf.content || '').length) },
                              )}
                            </Typography.Text>
                          </Space>
                        ),
                        children: wf.readError ? (
                          <Typography.Text type="danger">{wf.readError}</Typography.Text>
                        ) : (
                          <PreBlock
                            text={wf.content}
                            token={token}
                            emptyHint={intl.formatMessage({ id: 'systemPrompt.emptyFileHint' })}
                          />
                        ),
                      },
                    ]}
                  />
                ))}
                <Table
                  size="small"
                  pagination={false}
                  dataSource={mergedWorkspaceFiles.map((f, j) => ({ ...f, key: j }))}
                  columns={[
                    {
                      title: 'File',
                      dataIndex: 'name',
                      render: (_, r) => (
                        <Space>
                          <span>{r.name || r.path}</span>
                          {r.injected && <Tag color="blue" style={{ fontSize: 10 }}>📌</Tag>}
                        </Space>
                      ),
                    },
                    {
                      title: 'Chars',
                      dataIndex: 'injectedChars',
                      align: 'right',
                      render: (v) => safeLocaleNum(v),
                    },
                    { title: 'Trunc', dataIndex: 'truncated', render: (v) => (v ? 'Y' : '') },
                    {
                      title: 'Source',
                      render: (_, r) => (r.injected ? 'sessions.json' : 'workspace'),
                    },
                  ]}
                  style={{ marginTop: 12 }}
                />
              </div>
            ),
          },
        ]
      : [];

  return (
    <>
      <Card
        title={
          <Typography.Text strong>
            {intl.formatMessage({ id: 'systemPrompt.bootstrapHeaderTitle' })}
          </Typography.Text>
        }
        extra={
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            📁 {totalFiles} files · ~{safeLocaleNum(totalTokens)} tok
          </Typography.Text>
        }
        style={{ marginBottom: 16 }}
      >
        <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 12 }}>
          {intl.formatMessage({ id: 'systemPrompt.bootstrapHeaderHint' })}
        </Typography.Paragraph>
        <Alert
          type="info"
          showIcon
          message={intl.formatMessage({ id: 'systemPrompt.bootstrapGoldenRules' })}
          style={{ marginBottom: 16 }}
        />
        <Typography.Text strong>
          {intl.formatMessage({ id: 'systemPrompt.harness.tierPrimaryTitle' })}
        </Typography.Text>
        <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 8 }}>
          {intl.formatMessage({ id: 'systemPrompt.harness.tierPrimaryDesc' })}
        </Typography.Paragraph>
        <Collapse defaultActiveKey={TIER_A_IDS} items={tierAPanels} style={{ marginBottom: 20 }} />
        <Typography.Text strong>
          {intl.formatMessage({ id: 'systemPrompt.harness.tierSecondaryTitle' })}
        </Typography.Text>
        <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 8 }}>
          {intl.formatMessage({ id: 'systemPrompt.harness.tierSecondaryDesc' })}
        </Typography.Paragraph>
        <Collapse defaultActiveKey={[]} items={tierBPanels} style={{ marginBottom: otherFiles.length ? 16 : 0 }} />
        {otherFilesCollapseItems.length > 0 && <Collapse defaultActiveKey={[]} items={otherFilesCollapseItems} />}
      </Card>

      <Collapse
        style={{ marginBottom: 16 }}
        defaultActiveKey={['project-context']}
        items={[
          {
            key: 'project-context',
            label: (
              <Space align="center" wrap>
                <Typography.Text strong>
                  {intl.formatMessage({ id: 'systemPrompt.harness.projectContextCollapseTitle' })}
                </Typography.Text>
                <SectionScopeHint intl={intl} messageId="systemPrompt.projectContextHint" />
              </Space>
            ),
            children:
              projectContextText.trim().length > 0 ? (
                <PreBlock
                  text={projectContextText}
                  token={token}
                  emptyHint={intl.formatMessage({ id: 'systemPrompt.noContent' })}
                />
              ) : (
                <Alert type="warning" message={intl.formatMessage({ id: 'systemPrompt.noContent' })} />
              ),
          },
        ]}
      />

      {hasSkills && (
        <Collapse
          style={{ marginBottom: 16 }}
          defaultActiveKey={[]}
          items={[
            {
              key: 'skills-snapshot',
              label: (
                <Space
                  style={{ width: '100%', justifyContent: 'space-between' }}
                  align="center"
                  wrap
                >
                  <Space wrap align="center">
                    <Typography.Text strong>
                      {intl.formatMessage({ id: 'systemPrompt.harness.skillsCollapseTitle' })}
                    </Typography.Text>
                    <SectionScopeHint intl={intl} messageId="systemPrompt.skillsSnapshotDesc" />
                  </Space>
                  {skillsSnapshot.prompt && (
                    <Button
                      type="link"
                      size="small"
                      icon={<CopyOutlined />}
                      onClick={(e) => {
                        e.stopPropagation();
                        onCopySkillsPrompt();
                      }}
                    >
                      {copied
                        ? intl.formatMessage({ id: 'systemPrompt.copied' })
                        : intl.formatMessage({ id: 'systemPrompt.copy' })}
                    </Button>
                  )}
                </Space>
              ),
              children: (
                <div>
                  <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 16 }}>
                    {intl.formatMessage({ id: 'systemPrompt.skillsSnapshotDesc' })}
                  </Typography.Paragraph>
                  {skillsSnapshot.skills?.length > 0 && (
                    <div style={{ marginBottom: 16 }}>
                      <Typography.Text strong style={{ fontSize: 13 }}>
                        {intl.formatMessage({ id: 'systemPrompt.skillsList' })}
                      </Typography.Text>
                      <Typography.Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>
                        {intl.locale === 'zh-CN'
                          ? `共 ${skillsSnapshot.skills.length} 个`
                          : `${skillsSnapshot.skills.length} skills`}
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
                        {intl.locale === 'zh-CN'
                          ? '注入到 system prompt 的 XML 文本，含 name/description/location'
                          : 'XML injected into system prompt (name, description, location)'}
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
                </div>
              ),
            },
          ]}
        />
      )}
    </>
  );
}

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

/** 横向比例柱状图：显示 Token 占比 */
function TokenDistributionBar({ items, token }) {
  if (!items || items.length === 0) return null;

  const total = items.reduce((sum, item) => sum + (item.tokens || 0), 0);
  if (total === 0) return null;

  // 定义颜色方案（优先级从高到低）
  const colorMap = {
    'project': token.colorPrimaryBorder || '#1890ff',      // 蓝色：用户自定义项目文件
    'workspace': token.colorSuccessBorder || '#52c41a',    // 绿色：工作区文件
    'core': token.colorWarningBorder || '#faad14',         // 橙色：核心系统
    'skills': token.colorInfoBorder || '#13c2c2',          // 青色：Skills
    'tools_list': token.colorErrorBorder || '#f5222d',     // 红色：Tools List
    'tools_schema': token.colorTextSecondary || '#8c8c8c', // 灰色：Tools Schema
  };

  return (
    <div style={{ marginBottom: 16 }}>
      {/* 横向比例柱 */}
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: 40,
          borderRadius: token.borderRadius,
          overflow: 'hidden',
          border: `1px solid ${token.colorBorder}`,
        }}
      >
        {items.map((item) => {
          const percent = ((item.tokens || 0) / total) * 100;
          if (percent < 0.5) return null; // 小于 0.5% 不显示

          return (
            <div
              key={item.id}
              style={{
                width: `${percent}%`,
                background: colorMap[item.id] || token.colorFillTertiary,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0 4px',
                position: 'relative',
                transition: 'all 0.3s ease',
              }}
              title={`${item.label}: ${safeLocaleNum(item.tokens)} tok (${item.percent}%)`}
            >
              {percent >= 8 && (
                <Typography.Text
                  style={{
                    fontSize: 11,
                    color: '#fff',
                    fontWeight: 500,
                    textShadow: '0 1px 2px rgba(0,0,0,0.3)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {percent >= 15 ? `${item.label} ${item.percent}%` : `${item.percent}%`}
                </Typography.Text>
              )}
            </div>
          );
        })}
      </div>

      {/* 图例 */}
      <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        {items.map((item) => (
          <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div
              style={{
                width: 12,
                height: 12,
                borderRadius: 2,
                background: colorMap[item.id] || token.colorFillTertiary,
              }}
            />
            <Typography.Text style={{ fontSize: 12 }}>
              {item.label}
              <Typography.Text type="secondary" style={{ marginLeft: 4 }}>
                {safeLocaleNum(item.tokens)} tok · {item.percent}%
              </Typography.Text>
            </Typography.Text>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function SystemPromptPage() {
  const intl = useIntl();
  const { token } = theme.useToken();
  const [probe, setProbe] = useState(null);
  const [probeLoading, setProbeLoading] = useState(true);
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

    (async () => {
      try {
        const skillsRes = await fetch('/api/skills/usage');
        const skillsData = await skillsRes.json();
        if (!cancelled) {
          setSkills(Array.isArray(skillsData) ? skillsData : []);
        }
      } catch {
        // ignore
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
  const probeTotalTok = Array.isArray(probe?.breakdown)
    ? probe.breakdown.reduce((s, x) => s + (Number(x?.tokens) || 0), 0)
    : 0;
  const probeTotalTokSafe = Number.isFinite(probeTotalTok) ? probeTotalTok : 0;
  const skillsSnapshot = probe?.skillsSnapshot;
  const skillsPreviewLimit = 30;
  const toolsPreviewLimit = 30;

  const promptChunks = useMemo(
    () => parseSystemPromptChunks(probe?.systemPromptMarkdown),
    [probe?.systemPromptMarkdown],
  );

  // 合并 injectedWorkspaceFiles 和 workspaceFiles：优先使用 injectedWorkspaceFiles
  const mergedWorkspaceFiles = useMemo(() => {
    if (!probe?.injectedWorkspaceFiles || probe.injectedWorkspaceFiles.length === 0) {
      return workspaceFiles;
    }
    // 用 injectedWorkspaceFiles override 同名文件
    const injectedMap = new Map(probe.injectedWorkspaceFiles.map(f => [f.name || f.path, f]));
    return workspaceFiles.map(f => {
      const injected = injectedMap.get(f.name || f.path);
      return injected ? { ...f, ...injected, injected: true } : f;
    });
  }, [probe?.injectedWorkspaceFiles, workspaceFiles]);
  
  // 合并 workspaceFileContents：优先使用 injectedWorkspaceFiles 的内容
  const mergedWorkspaceFileContents = useMemo(() => {
    if (!probe?.injectedWorkspaceFiles || probe.injectedWorkspaceFiles.length === 0) {
      return workspaceFileContents;
    }
    const injectedMap = new Map(probe.injectedWorkspaceFiles.map(f => [f.name || f.path, f]));
    return workspaceFileContents.map(wf => {
      const injected = injectedMap.get(wf.name || wf.path);
      if (injected) {
        return {
          ...wf,
          content: `// 来自 sessions.json injectedWorkspaceFiles\n// Path: ${injected.path || wf.path}\n\n${wf.content}`,
          injected: true,
        };
      }
      return wf;
    });
  }, [probe?.injectedWorkspaceFiles, workspaceFileContents]);

  // 排序后的 breakdown：用户自定义文件优先
  const sortedBreakdownItems = useMemo(
    () => sortBreakdownItems(breakdownItems),
    [breakdownItems]
  );

  // 过滤掉 workspace 与 project：引导文件与 # Project Context 已在 HarnessBootstrapStack 展示
  const filteredBreakdownItems = useMemo(
    () => sortedBreakdownItems.filter(b => b.id !== 'workspace' && b.id !== 'project'),
    [sortedBreakdownItems]
  );

  const collapseItems = useMemo(() => {
    if (!probe?.ok) return [];
    return filteredBreakdownItems.map((b) => {
      const isSkills = b.id === 'skills';
      const skillsShown = showAllSkills ? skillsDetail : skillsDetail.slice(0, skillsPreviewLimit);
      const toolsShown = showAllTools ? toolsDetail : toolsDetail.slice(0, toolsPreviewLimit);
      let children = null;
      if (b.id === 'core') {
        children = <PreBlock text={sections.coreText} token={token} />;
      } else if (b.id === 'tools_list') {
        children = <PreBlock text={sections.toolsListText} token={token} />;
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
                  { title: 'Chars', dataIndex: 'blockChars', align: 'right', render: (v) => safeLocaleNum(v) },
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
      } else if ((b.chars || 0) === 0) {
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
              {safeLocaleNum(b.chars)} chars
            </Typography.Text>
            {children}
          </div>
        ),
      };
    });
  }, [
    probe?.ok,
    filteredBreakdownItems,
    sections,
    skillsDetail,
    toolsDetail,
    showAllSkills,
    showAllTools,
    token,
    intl,
  ]);

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

  const sessionsJsonSummary = useMemo(() => {
    if (!probe) return null;
    const parts = [];
    if (probe.sessionKey) parts.push(`sessionKey: ${probe.sessionKey}`);
    if (probe.sessionId) parts.push(`sessionId: ${probe.sessionId}`);
    if (probe.agentId) parts.push(`agentId: ${probe.agentId}`);
    if (probe.workspaceFileContents?.length) parts.push(`workspaceFiles: ${probe.workspaceFileContents.length}`);
    if (probe.skillsDetail?.length) parts.push(`skills: ${probe.skillsDetail.length}`);
    if (probe.toolsDetail?.length) parts.push(`tools: ${probe.toolsDetail.length}`);
    return parts.join(' · ');
  }, [probe]);

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Typography.Title level={4} style={{ margin: 0 }}>{intl.formatMessage({ id: 'menu.systemPrompt' })}</Typography.Title>
        <SectionScopeHint intl={intl} messageId="systemPrompt.pageScopeDesc" />
      </div>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
        {intl.formatMessage({ id: 'systemPrompt.pageSubtitle' })}
      </Typography.Paragraph>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
        {intl.formatMessage({ id: 'systemPrompt.harnessIntro' })}
      </Typography.Paragraph>

      <HarnessBootstrapStack
        probe={probe}
        probeLoading={probeLoading}
        sections={sections}
        token={token}
        intl={intl}
        skillsSnapshot={skillsSnapshot}
        copied={copied}
        onCopySkillsPrompt={copySkillsPrompt}
      />

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
              <Typography.Text type="secondary">Total ~{safeLocaleNum(probeTotalTokSafe)} tokens</Typography.Text>
            </Space>

            {/* Token 分布横向比例柱 */}
            <TokenDistributionBar items={sortedBreakdownItems} token={token} />

            <Row gutter={[16, 16]}>
              <Col xs={24} lg={12}>
                <Row gutter={[16, 16]}>
                  {collapseItems.slice(0, 2).map((item, i) => {
                    const b = filteredBreakdownItems[i];
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
                                    {safeLocaleNum(b?.chars)} chars · {intl.formatMessage({ id: 'systemPrompt.expandHint' })}
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
                  {collapseItems.slice(2, 4).map((item, i) => {
                    const idx = i + 2;
                    const b = filteredBreakdownItems[idx];
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
                                    {safeLocaleNum(b?.chars)} chars · {intl.formatMessage({ id: 'systemPrompt.expandHint' })}
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

      {/* 完整 System Prompt：高级全文，默认收起 */}
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
                  ) : probe?.systemPromptSource === 'rebuild' ? (
                    <Alert
                      type="info"
                      showIcon
                      message={intl.formatMessage({ id: 'systemPrompt.fromRebuild' })}
                      style={{ marginBottom: 12 }}
                    />
                  ) : probe?.systemPromptSource === 'transcript' ? (
                    <Alert
                      type="success"
                      showIcon
                      message={intl.formatMessage({ id: 'systemPrompt.fromTranscript' })}
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

      {probe?.ok && (
        <Collapse
          style={{ marginBottom: 16 }}
          items={[
            {
              key: 'sessions-json',
              label: (
                <Space>
                  <Typography.Text strong>{intl.formatMessage({ id: 'systemPrompt.sessionsJsonTitle' })}</Typography.Text>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>{sessionsJsonSummary}</Typography.Text>
                </Space>
              ),
              children: (
                <div style={{ fontSize: 12 }}>
                  {probe.injectedWorkspaceFiles && probe.injectedWorkspaceFiles.length > 0 && (
                    <div style={{ marginBottom: 16 }}>
                      <Typography.Text strong>injectedWorkspaceFiles:</Typography.Text>
                      <Table
                        size="small"
                        pagination={false}
                        dataSource={probe.injectedWorkspaceFiles.map((f, i) => ({ ...f, key: i }))}
                        columns={[
                          { title: 'Name', dataIndex: 'name', render: (_, r) => r.name || r.path },
                          { title: 'Path', dataIndex: 'path', ellipsis: true },
                        ]}
                      />
                    </div>
                  )}
                  {skillsSnapshot && (
                    <div style={{ marginBottom: 16 }}>
                      <Typography.Text strong>skillsSnapshot:</Typography.Text>
                      <pre style={{
                        fontSize: 11,
                        fontFamily: 'monospace',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        maxHeight: 300,
                        overflow: 'auto',
                        padding: 8,
                        borderRadius: token.borderRadius,
                        border: `1px solid ${token.colorBorder}`,
                        background: token.colorFillQuaternary,
                      }}>
                        {JSON.stringify({
                          prompt: skillsSnapshot.prompt?.substring(0, 500) + (skillsSnapshot.prompt?.length > 500 ? '...' : ''),
                          skills: skillsSnapshot.skills?.length,
                          resolvedSkills: skillsSnapshot.resolvedSkills?.length,
                          injectedWorkspaceFiles: skillsSnapshot.injectedWorkspaceFiles?.length,
                          version: skillsSnapshot.version,
                        }, null, 2)}
                      </pre>
                    </div>
                  )}
                  {probe.sessionMeta && (
                    <div style={{ marginBottom: 16 }}>
                      <Typography.Text strong>Session Meta (transcript 首行):</Typography.Text>
                      <pre style={{
                        fontSize: 11,
                        fontFamily: 'monospace',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        padding: 8,
                        borderRadius: token.borderRadius,
                        border: `1px solid ${token.colorBorder}`,
                        background: token.colorFillQuaternary,
                      }}>
                        {JSON.stringify(probe.sessionMeta, null, 2)}
                      </pre>
                    </div>
                  )}
                  <div>
                    <Typography.Text strong>Full sessions.json entry:</Typography.Text>
                    <pre style={{
                      fontSize: 11,
                      fontFamily: 'monospace',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      maxHeight: 400,
                      overflow: 'auto',
                      padding: 8,
                      borderRadius: token.borderRadius,
                      border: `1px solid ${token.colorBorder}`,
                      background: token.colorFillQuaternary,
                    }}>
                      {JSON.stringify(probe.sessionsJsonEntry || {
                        sessionKey: probe.sessionKey,
                        sessionId: probe.sessionId,
                        agentId: probe.agentId,
                        reportSource: probe.reportSource,
                        reportGeneratedAt: probe.reportGeneratedAt,
                        model: probe.model,
                        provider: probe.provider,
                        workspaceDir: probe.workspaceDir,
                        workspaceFilesCount: probe.workspaceFiles?.length,
                        skillsDetailCount: probe.skillsDetail?.length,
                        toolsDetailCount: probe.toolsDetail?.length,
                      }, null, 2)}
                    </pre>
                  </div>
                </div>
              ),
            },
          ]}
          defaultActiveKey={[]}
        />
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
    </div>
  );
}
