import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Card,
  Alert,
  Tabs,
  Segmented,
  Button,
  Space,
  Typography,
  Spin,
  Tag,
  Progress,
  Descriptions,
  Collapse,
  theme,
  message,
  Modal,
  Tooltip,
  Input,
  Popover,
} from 'antd';
import {
  QuestionCircleOutlined,
  VerticalAlignTopOutlined,
  WarningOutlined,
  DownOutlined,
  RightOutlined,
} from '@ant-design/icons';
import { useIntl } from 'react-intl';
import { sessionsApi } from '../api';
import { formatSessionParticipantDisplay } from '../utils/session-user';
import { sessionTokenUtilizationPercent } from '../utils/session-tokens';

/** 详情页「参与者」：多人时首位可点 +Tag 展开全部（与列表 participantSummary 同源） */
function DetailParticipantField({ session, intl }) {
  const ids = session.participantIds;
  if (Array.isArray(ids) && ids.length > 1) {
    const first = ids[0];
    const rest = ids.length - 1;
    const content = (
      <div style={{ maxWidth: 360 }}>
        <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
          {intl.formatMessage({ id: 'session.participantsGroupHint' })}
        </Typography.Text>
        <Space wrap size={[4, 4]}>
          {ids.map((id) => (
            <Tag key={id} style={{ fontFamily: 'monospace', fontSize: 12, margin: 0 }}>
              {id}
            </Tag>
          ))}
        </Space>
      </div>
    );
    return (
      <Space wrap align="center" size={4}>
        <Typography.Text ellipsis={{ tooltip: first }} style={{ maxWidth: 160 }}>
          {first}
        </Typography.Text>
        <Popover
          placement="bottomLeft"
          trigger="click"
          title={intl.formatMessage({ id: 'session.participantsListTitle' }, { n: ids.length })}
          content={content}
        >
          <Tag color="blue" style={{ cursor: 'pointer' }}>+{rest}</Tag>
        </Popover>
      </Space>
    );
  }
  return formatSessionParticipantDisplay(session);
}

/** 与会话详情其他 Tab 滚动区域高度一致 */
const SESSION_DETAIL_LIST_HEIGHT = 520;

function formatJsonForDisplay(val) {
  if (val == null) return '—';
  if (typeof val === 'string') return val;
  try {
    return JSON.stringify(val, null, 2);
  } catch {
    return String(val);
  }
}

function formatFileSize(bytes) {
  if (bytes == null || bytes === '') return '—';
  const n = typeof bytes === 'number' ? bytes : Number(bytes);
  if (!Number.isFinite(n) || n < 0) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

/** 顶层 transcriptFileSizeBytes 与 tokenUsageMeta.sessionLogFileSizeBytes 任一即可（兼容 snake_case） */
function resolveSessionLogBytes(session) {
  const meta = session?.tokenUsageMeta ?? session?.token_usage_meta;
  const raw =
    session?.transcriptFileSizeBytes ??
    session?.transcript_file_size_bytes ??
    meta?.sessionLogFileSizeBytes ??
    meta?.session_log_file_size_bytes;
  if (raw == null || raw === '') return undefined;
  const n = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

function SkillsPanel({ skills, intl }) {
  if (!skills.length) {
    return <Typography.Text type="secondary">—</Typography.Text>;
  }
  return (
    <div style={{ maxHeight: 520, overflow: 'auto' }}>
      <Space wrap>
        {skills.map((s) => (
          <Tag key={s.skillName}>
            {s.skillName}
            {s.readCount > 1 && ` ×${s.readCount}`}
          </Tag>
        ))}
      </Space>
    </div>
  );
}

function ToolCallsPanel({ toolCalls, token, intl }) {
  if (!toolCalls?.length) {
    return <Typography.Text type="secondary">—</Typography.Text>;
  }
  const t = token || {};
  const argsLabel = intl?.formatMessage?.({ id: 'session.toolArgs' }) || '参数';
  const outputLabel = intl?.formatMessage?.({ id: 'session.toolOutput' }) || '输出';
  const calledAtLabel = intl?.formatMessage?.({ id: 'session.toolCalledAt' }) || 'Called at';
  return (
    <div style={{ maxHeight: 520, overflow: 'auto' }}>
      {toolCalls.map((tool, idx) => {
        const name = tool?.name || tool?.tool || 'unknown';
        const args = tool?.input && typeof tool.input === 'object' ? tool.input : {};
        const output = tool?.output;
        const hasArgs = Object.keys(args).length > 0;
        const hasOutputContent =
          (typeof output === 'string' && output !== '') ||
          (Array.isArray(output) && output.length > 0) ||
          (output && typeof output === 'object' && Object.keys(output).length > 0);
        const ts = tool.timestamp;
        const key = `${name}-${ts ?? 't'}-${idx}`;

        return (
          <Card
            key={key}
            size="small"
            style={{
              marginBottom: 8,
              borderLeft: `4px solid ${tool.success !== false ? (t.colorSuccess || '#52c41a') : (t.colorError || '#ff4d4f')}`,
            }}
          >
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: hasArgs || hasOutputContent ? 8 : 0 }}>
              {idx === 0 && (
                <Tag color="processing">{intl.formatMessage({ id: 'session.detailNewestBadge' })}</Tag>
              )}
              <Typography.Text strong style={{ fontFamily: 'monospace', fontSize: 14 }}>{name}</Typography.Text>
              <Tag color={tool.success !== false ? 'success' : 'error'}>{tool.success !== false ? 'OK' : 'Fail'}</Tag>
              {typeof ts === 'number' && (
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {calledAtLabel}: {new Date(ts).toLocaleString(intl.locale)}
                </Typography.Text>
              )}
              {(tool.durationMs ?? tool.duration) != null && (
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {(tool.durationMs ?? tool.duration)}ms
                </Typography.Text>
              )}
            </div>

            {hasArgs && (
              <div style={{ marginBottom: 8 }}>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>{argsLabel}</Typography.Text>
                <pre style={{
                  margin: '4px 0 0',
                  padding: 8,
                  background: t.colorFillTertiary || 'rgba(0,0,0,0.02)',
                  borderRadius: 4,
                  fontSize: 11,
                  overflow: 'auto',
                  maxHeight: 120,
                  fontFamily: 'monospace',
                }}>
                  {formatJsonForDisplay(args)}
                </pre>
              </div>
            )}

            {tool.error && (
              <Typography.Paragraph type="danger" style={{ marginBottom: 8, fontSize: 12 }}>{tool.error}</Typography.Paragraph>
            )}

            {hasOutputContent && !tool.error && (
              <div>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>{outputLabel}</Typography.Text>
                <pre style={{
                  margin: '4px 0 0',
                  padding: 8,
                  background: t.colorFillTertiary || 'rgba(0,0,0,0.02)',
                  borderRadius: 4,
                  fontSize: 11,
                  overflow: 'auto',
                  maxHeight: 200,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                  fontFamily: 'monospace',
                }}>
                  {formatJsonForDisplay(output)}
                </pre>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

/**
 * 由正文推断的会话内子类型（user / assistant 均可能出现 boot、心跳轮询等模板）。
 */
function inferContentDrivenMessageKind(content) {
  const c = (typeof content === 'string' ? content : '').toLowerCase();
  if (c.includes('heartbeat.md') || c.includes('heartbeat_ok') || c.includes('heartbeat poll')) {
    return 'heartbeat';
  }
  if (c.includes('current time:') && c.length > 150) return 'heartbeat';
  if (c.includes('cron:') || c.includes('scheduled task')) return 'cron';
  if (
    c.includes('boot check') ||
    c.includes('boot.md') ||
    c.includes('follow boot') ||
    c.includes('running a boot') ||
    c.includes('are running a boot')
  ) {
    return 'boot';
  }
  return null;
}

/**
 * 单条消息展示标签：优先正文子类型，否则沿用 JSONL role（user / assistant / system 等）。
 */
function inferMessageLabel(msg) {
  const fromContent = inferContentDrivenMessageKind(msg.content);
  if (fromContent === 'heartbeat' || fromContent === 'cron' || fromContent === 'boot') {
    return fromContent;
  }
  if (msg.role !== 'user') return msg.role;
  return 'user';
}

function messageRoleTagColor(role) {
  switch (role) {
    case 'user':
      return 'geekblue';
    case 'assistant':
      return 'green';
    case 'boot':
      return 'purple';
    case 'heartbeat':
    case 'cron':
      return 'warning';
    case 'system':
      return 'default';
    default:
      return 'default';
  }
}

/** 单栏消息列表：默认一行摘要，点击展开全文 */
function SessionMessagesList({ messages, intl, token, listResetKey }) {
  const [expanded, setExpanded] = useState(() => new Set());

  useEffect(() => {
    setExpanded(new Set());
  }, [listResetKey]);

  if (!messages.length) {
    return <Typography.Text type="secondary">—</Typography.Text>;
  }

  const toggle = (index) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  return (
    <div
      style={{
        maxHeight: SESSION_DETAIL_LIST_HEIGHT,
        overflowY: 'auto',
        overflowX: 'hidden',
        paddingRight: 4,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      {messages.map((msg, index) => {
        const role = inferMessageLabel(msg);
        const sys = role === 'heartbeat' || role === 'cron';
        const isInferredUser = role === 'user';
        const isBoot = role === 'boot';
        let msgBg = token.colorSuccessBg;
        if (sys) msgBg = token.colorWarningBg;
        else if (isBoot) msgBg = token.colorInfoBg;
        else if (isInferredUser) msgBg = token.colorPrimaryBg;
        const isOpen = expanded.has(index);
        const content = msg.content || '(empty)';
        const timeStr = msg.timestamp ? new Date(msg.timestamp).toLocaleString(intl.locale) : '—';

        return (
          <Card
            key={`${msg.timestamp ?? 't'}-${index}`}
            size="small"
            style={{
              background: msgBg,
              minWidth: 0,
            }}
            styles={{ body: { padding: '8px 12px' } }}
          >
            <div
              onClick={isOpen ? undefined : () => toggle(index)}
              onKeyDown={
                isOpen
                  ? undefined
                  : (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        toggle(index);
                      }
                    }
              }
              tabIndex={isOpen ? undefined : 0}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8,
                width: '100%',
                cursor: isOpen ? 'default' : 'pointer',
                outline: 'none',
              }}
            >
              <Space size={4} wrap style={{ flexShrink: 0 }}>
                {index === 0 && (
                  <Tag color="processing">{intl.formatMessage({ id: 'session.detailNewestBadge' })}</Tag>
                )}
                <Tag color={messageRoleTagColor(role)}>{role}</Tag>
                <Typography.Text type="secondary" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                  {timeStr}
                </Typography.Text>
              </Space>
              <Typography.Paragraph
                ellipsis={
                  isOpen
                    ? false
                    : {
                        rows: 1,
                        tooltip: intl.formatMessage({ id: 'session.msgExpandTooltip' }),
                      }
                }
                style={{
                  margin: 0,
                  flex: 1,
                  minWidth: 0,
                  fontSize: 13,
                  ...(isOpen
                    ? { whiteSpace: 'pre-wrap', wordBreak: 'break-all', userSelect: 'text' }
                    : { userSelect: 'none' }),
                }}
              >
                {content}
              </Typography.Paragraph>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggle(index);
                }}
                style={{
                  flexShrink: 0,
                  border: 'none',
                  background: 'transparent',
                  padding: '2px 4px',
                  cursor: 'pointer',
                  color: token.colorTextSecondary,
                  fontSize: 12,
                  lineHeight: '22px',
                  display: 'inline-flex',
                  alignItems: 'center',
                }}
                title={
                  isOpen
                    ? intl.formatMessage({ id: 'session.msgCollapseTooltip' })
                    : intl.formatMessage({ id: 'session.msgExpandTooltip' })
                }
                aria-expanded={isOpen}
              >
                {isOpen ? <DownOutlined /> : <RightOutlined />}
              </button>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

export default function SessionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const intl = useIntl();
  const { token } = theme.useToken();
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState(() => (typeof window !== 'undefined' && window.location.hash === '#toolCalls' ? 'toolCalls' : 'messages'));
  const [detailSearch, setDetailSearch] = useState('');
  /** 消息 Tab：按展示分类筛选（user / assistant / boot，与 inferMessageLabel 一致） */
  const [messageRoleFilter, setMessageRoleFilter] = useState(() => 'all');

  const { messagesFilteredReversed, messagesSearchMatchCount } = useMemo(() => {
    if (!session) {
      return { messagesFilteredReversed: [], messagesSearchMatchCount: 0 };
    }
    const searchQ = detailSearch.trim().toLowerCase();
    const match = (parts) => {
      if (!searchQ) return true;
      return parts.some((p) => String(p ?? '').toLowerCase().includes(searchQ));
    };
    const list = session.messages || [];
    const afterSearch = list.filter((msg) => {
      const role = inferMessageLabel(msg);
      return match([
        msg.content,
        role,
        msg.sender,
        msg.timestamp && new Date(msg.timestamp).toLocaleString(intl.locale),
      ]);
    });
    const afterRole =
      messageRoleFilter === 'all'
        ? afterSearch
        : afterSearch.filter((msg) => inferMessageLabel(msg) === messageRoleFilter);
    return {
      messagesFilteredReversed: [...afterRole].reverse(),
      messagesSearchMatchCount: afterSearch.length,
    };
  }, [session, detailSearch, intl.locale, messageRoleFilter]);

  useEffect(() => {
    setMessageRoleFilter('all');
  }, [id]);

  const sortedTools = useMemo(() => {
    if (!session) return [];
    const searchQ = detailSearch.trim().toLowerCase();
    const match = (parts) => {
      if (!searchQ) return true;
      return parts.some((p) => String(p ?? '').toLowerCase().includes(searchQ));
    };
    const list = session.toolCalls || [];
    const filtered = list.filter((tool) => {
      const name = tool?.name || tool?.tool || '';
      return match([
        name,
        formatJsonForDisplay(tool?.input),
        formatJsonForDisplay(tool?.output),
        tool?.error,
        typeof tool.timestamp === 'number' ? new Date(tool.timestamp).toLocaleString(intl.locale) : '',
      ]);
    });
    return filtered
      .map((t, i) => ({ t, i }))
      .sort((a, b) => {
        const ta = a.t.timestamp ?? 0;
        const tb = b.t.timestamp ?? 0;
        if (tb !== ta) return tb - ta;
        return b.i - a.i;
      })
      .map(({ t }) => t);
  }, [session, detailSearch, intl.locale]);

  const eventsFilteredSorted = useMemo(() => {
    if (!session) return [];
    const searchQ = detailSearch.trim().toLowerCase();
    const match = (parts) => {
      if (!searchQ) return true;
      return parts.some((p) => String(p ?? '').toLowerCase().includes(searchQ));
    };
    const list = session.events || [];
    const filtered = list.filter((ev) =>
      match([ev.type, formatJsonForDisplay(ev.payload), formatJsonForDisplay(ev)]),
    );
    return [...filtered].sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
  }, [session, detailSearch]);

  const skillsFilteredReversed = useMemo(() => {
    if (!session) return [];
    const searchQ = detailSearch.trim().toLowerCase();
    const match = (parts) => {
      if (!searchQ) return true;
      return parts.some((p) => String(p ?? '').toLowerCase().includes(searchQ));
    };
    const list = session.invokedSkills || [];
    const filtered = list.filter((s) => match([s.skillName, String(s.readCount)]));
    return [...filtered].reverse();
  }, [session, detailSearch]);

  const fetchSession = async (showToast = false) => {
    if (showToast) {
      setRetrying(true);
      message.loading({ content: '正在重新加载会话...', key: 'session-detail-retry', duration: 0 });
    }
    try {
      const data = await sessionsApi.getDetail(id);
      setSession(data);
      setError(null);
      if (showToast) {
        message.success({ content: '会话已重新加载', key: 'session-detail-retry' });
      }
    } catch (e) {
      setError(e?.message || 'Error');
      if (showToast) {
        message.error({ content: e?.message || '加载会话失败', key: 'session-detail-retry' });
      }
    } finally {
      setLoading(false);
      if (showToast) {
        setRetrying(false);
      }
    }
  };

  useEffect(() => {
    fetchSession();
  }, [id]);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.hash === '#toolCalls') {
      setTab('toolCalls');
    }
  }, [id]);

  useEffect(() => {
    const onHash = () => setTab(window.location.hash === '#toolCalls' ? 'toolCalls' : 'messages');
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const onKill = () => {
    Modal.confirm({
      title: intl.formatMessage({ id: 'confirm.killSession' }),
      onOk: async () => {
        const toastKey = 'session-kill';
        message.loading({ content: '正在结束会话...', key: toastKey, duration: 0 });
        try {
          await sessionsApi.kill(id);
          message.success({ content: '会话已结束', key: toastKey });
          navigate('/sessions');
        } catch (e) {
          message.error({ content: e?.message || '结束会话失败', key: toastKey });
          throw e;
        }
      },
    });
  };

  const formatDuration = (ms) => {
    if (!ms) return '—';
    const sec = Math.floor(ms / 1000);
    const m = Math.floor(sec / 60);
    const h = Math.floor(m / 60);
    if (h > 0) return `${h}h ${m % 60}m`;
    if (m > 0) return `${m}m ${sec % 60}s`;
    return `${sec}s`;
  };

  if (loading) {
    return <Spin style={{ display: 'block', margin: 48 }} />;
  }
  if (error) {
    return (
      <Card>
        <Typography.Title type="danger" level={4}>{intl.formatMessage({ id: 'session.loadError' })}</Typography.Title>
        <Typography.Paragraph>{error}</Typography.Paragraph>
        <Space>
          <Button type="primary" onClick={() => fetchSession(true)} loading={retrying}>{intl.formatMessage({ id: 'common.retry' })}</Button>
          <Button onClick={() => navigate('/sessions')}>{intl.formatMessage({ id: 'common.back' })}</Button>
        </Space>
      </Card>
    );
  }
  if (!session) {
    return (
      <Card>
        <Typography.Title level={4}>{intl.formatMessage({ id: 'session.notFound' })}</Typography.Title>
        <Button type="primary" onClick={() => navigate('/sessions')}>{intl.formatMessage({ id: 'common.back' })}</Button>
      </Card>
    );
  }

  const usage = session.tokenUsage;
  const limit = usage?.limit ?? session.contextTokens;
  const input = usage?.input ?? 0;
  const output = usage?.output ?? 0;
  const total = usage?.total ?? (input + output);
  const contextUnreliable = usage?.contextUtilizationReliable === false;
  const utilPct = sessionTokenUtilizationPercent(session);
  const usedPct =
    !contextUnreliable && limit && total > 0 ? Math.min(100, (total / limit) * 100) : 0;
  const tokenUsageMeta = session?.tokenUsageMeta;
  const showTokenZeroSourceWarning =
    total === 0 &&
    tokenUsageMeta?.source === 'transcript' &&
    tokenUsageMeta?.transcriptUsageObserved &&
    !tokenUsageMeta?.storeTokenFieldsPresent;
  // 用 input/(input+output) 保证条带比例正确；不可靠时仅展示 In/Out 构成，不映射为占上限比例
  const sumInOut = input + output;
  const inputRatio = sumInOut > 0 ? input / sumInOut : 0;
  const outputRatio = sumInOut > 0 ? output / sumInOut : 0;
  const inputBarPct = contextUnreliable ? inputRatio * 100 : usedPct * inputRatio;
  const outputBarPct = contextUnreliable ? outputRatio * 100 : usedPct * outputRatio;

  const searchQ = detailSearch.trim();
  const tabFilteredN =
    tab === 'messages'
      ? messagesFilteredReversed.length
      : tab === 'toolCalls'
        ? sortedTools.length
        : tab === 'events'
          ? eventsFilteredSorted.length
          : skillsFilteredReversed.length;
  const tabTotalN =
    tab === 'messages'
      ? searchQ
        ? messagesSearchMatchCount
        : session.messages?.length ?? 0
      : tab === 'toolCalls'
        ? (session.toolCalls?.length ?? 0)
        : tab === 'events'
          ? (session.events?.length ?? 0)
          : (session.invokedSkills?.length ?? 0);

  return (
    <div>
      <Space style={{ marginBottom: 16 }} wrap>
        <Typography.Title level={4} style={{ margin: 0 }}>{intl.formatMessage({ id: 'session.detail' })}</Typography.Title>
        {session.typeLabel && <Tag>{session.typeLabel}</Tag>}
        <Typography.Text type="secondary" copyable>{session.sessionId}</Typography.Text>
        <Link to="/sessions"><Button>{intl.formatMessage({ id: 'common.back' })}</Button></Link>
        {session.status === 'active' && (
          <Button danger onClick={onKill}>{intl.formatMessage({ id: 'common.kill' })}</Button>
        )}
      </Space>

      <div style={{ marginBottom: 16 }}>
        <Space size="large" wrap>
          <Typography.Text>
            <Typography.Text type="secondary">{intl.formatMessage({ id: 'session.transcriptLogSize' })}: </Typography.Text>
            <Typography.Text strong>{formatFileSize(resolveSessionLogBytes(session))}</Typography.Text>
          </Typography.Text>
          <Typography.Text>
            <Tooltip title={intl.formatMessage({ id: 'session.messageCountTooltip' })}>
              <span style={{ cursor: 'help' }}>
                <Typography.Text type="secondary">
                  {intl.formatMessage({ id: 'session.messageCount' })}
                  <QuestionCircleOutlined style={{ marginLeft: 4, fontSize: 12, opacity: 0.55 }} />
                  :{' '}
                </Typography.Text>
              </span>
            </Tooltip>
            <Typography.Text strong>{session.messages?.length ?? 0}</Typography.Text>
          </Typography.Text>
        </Space>
      </div>

      {session.transcriptParseMode === 'head_tail' && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message={intl.formatMessage({ id: 'session.transcriptHeadTailAlertTitle' })}
          description={intl.formatMessage(
            { id: 'session.transcriptHeadTailAlertDesc' },
            {
              size: formatFileSize(resolveSessionLogBytes(session)),
              head: session.transcriptHeadJsonlLineCount ?? 0,
              tail: session.transcriptTailJsonlLineCount ?? 0,
            },
          )}
        />
      )}

      <RowCards
        session={session}
        formatDuration={formatDuration}
        formatFileSize={formatFileSize}
        resolveSessionLogBytes={resolveSessionLogBytes}
        intl={intl}
      />

      {usage && limit != null && (
        <Card
          size="small"
          title={
            <Tooltip title={contextUnreliable ? intl.formatMessage({ id: 'session.tokenContextUnreliableTitle' }) : undefined}>
              <span>
                Token{' '}
                <Typography.Text type="secondary" style={{ fontWeight: 'normal', fontSize: 13 }}>
                  ({total.toLocaleString()}/{limit.toLocaleString()})
                  {contextUnreliable ? ' *' : ''}
                </Typography.Text>
              </span>
            </Tooltip>
          }
          style={{ marginBottom: 16 }}
        >
          {contextUnreliable && (
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 12 }}
              message={intl.formatMessage({ id: 'session.tokenContextUnreliableTitle' })}
              description={intl.formatMessage({ id: 'session.tokenContextUnreliableDesc' })}
            />
          )}
          <div style={{ marginBottom: 8, opacity: contextUnreliable ? 0.55 : 1 }}>
            <div
              style={{
                display: 'flex',
                height: 10,
                borderRadius: 4,
                overflow: 'hidden',
                background: token.colorFillSecondary || 'rgba(0,0,0,0.06)',
              }}
            >
              {input > 0 && (
                <div
                  style={{
                    width: `${inputBarPct}%`,
                    minWidth: inputBarPct > 0 ? 2 : 0,
                    background: token.colorPrimary || '#1677ff',
                  }}
                  title={`Input: ${input.toLocaleString()}`}
                />
              )}
              {output > 0 && (
                <div
                  style={{
                    width: `${outputBarPct}%`,
                    minWidth: outputBarPct > 0 ? 2 : 0,
                    background: token.colorSuccess || '#52c41a',
                  }}
                  title={`Output: ${output.toLocaleString()}`}
                />
              )}
            </div>
          </div>
          {showTokenZeroSourceWarning && (
            <Collapse
              bordered={false}
              expandIconPosition="end"
              defaultActiveKey={[]}
              style={{
                marginBottom: 12,
                background: token.colorWarningBg,
                borderRadius: token.borderRadiusLG,
                border: `1px solid ${token.colorWarningBorder}`,
              }}
              items={[
                {
                  key: 'token-zero',
                  styles: {
                    header: {
                      alignItems: 'flex-start',
                      padding: '10px 12px',
                    },
                    body: {
                      padding: '0 12px 12px',
                      background: 'transparent',
                    },
                  },
                  label: (
                    <div style={{ paddingRight: 8 }}>
                      <Space align="start" size={8}>
                        <WarningOutlined style={{ color: token.colorWarning, marginTop: 2 }} />
                        <div>
                          <Typography.Text strong style={{ fontSize: 13, display: 'block' }}>
                            {intl.formatMessage({ id: 'session.tokenZeroTitle' })}
                          </Typography.Text>
                          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                            {intl.formatMessage({ id: 'session.tokenZeroExpandLabel' })}
                          </Typography.Text>
                        </div>
                      </Space>
                    </div>
                  ),
                  children: (
                    <Space direction="vertical" size={10} style={{ width: '100%' }}>
                      <Card size="small" styles={{ body: { padding: 10 } }}>
                        <Typography.Text strong>{intl.formatMessage({ id: 'session.tokenZeroPoint1Title' })}</Typography.Text>
                        <Typography.Paragraph type="secondary" style={{ margin: '6px 0 0' }}>
                          <span dangerouslySetInnerHTML={{ __html: intl.formatMessage({ id: 'session.tokenZeroPoint1Desc' }) }} />
                        </Typography.Paragraph>
                      </Card>

                      <Card size="small" styles={{ body: { padding: 10 } }}>
                        <Typography.Text strong>{intl.formatMessage({ id: 'session.tokenZeroPoint2Title' })}</Typography.Text>
                        <Typography.Paragraph type="secondary" style={{ margin: '6px 0 0' }}>
                          {intl.formatMessage({ id: 'session.tokenZeroPoint2Desc' })}
                          {tokenUsageMeta?.totalTokensFresh === false && (
                            <>
                              <br />
                              {intl.formatMessage({ id: 'session.tokenZeroPoint2FreshHint' })}
                            </>
                          )}
                        </Typography.Paragraph>
                      </Card>

                      <Card size="small" styles={{ body: { padding: 10 } }}>
                        <Typography.Text strong>{intl.formatMessage({ id: 'session.tokenZeroPoint3Title' })}</Typography.Text>
                        <div style={{ marginTop: 6, fontSize: 12, color: token.colorTextSecondary }}>
                          {tokenUsageMeta?.stateRootAbsolute ? (
                            <Typography.Paragraph style={{ marginBottom: 6 }}>
                              {intl.formatMessage({ id: 'session.tokenZeroStateRootLabel' })}
                              <br />
                              <Typography.Text copyable code style={{ fontSize: 12 }}>
                                {tokenUsageMeta.stateRootAbsolute}
                              </Typography.Text>
                            </Typography.Paragraph>
                          ) : (
                            <Typography.Paragraph style={{ marginBottom: 6 }}>
                              {intl.formatMessage({ id: 'session.tokenZeroStateRootFallback' })}
                            </Typography.Paragraph>
                          )}
                          {tokenUsageMeta?.sessionLogAbsolutePath && (
                            <Typography.Paragraph style={{ marginBottom: 6 }}>
                              {intl.formatMessage({ id: 'session.tokenZeroLogFileLabel' })}
                              <br />
                              <Typography.Text copyable code style={{ fontSize: 12 }}>
                                {tokenUsageMeta.sessionLogAbsolutePath}
                              </Typography.Text>
                            </Typography.Paragraph>
                          )}
                          {tokenUsageMeta?.transcriptPath && (
                            <Typography.Paragraph style={{ marginBottom: 6 }}>
                              {intl.formatMessage({ id: 'session.tokenZeroRelativePathLabel' })}
                              <br />
                              <Typography.Text copyable code style={{ fontSize: 12 }}>
                                {tokenUsageMeta.transcriptPath}
                              </Typography.Text>
                            </Typography.Paragraph>
                          )}
                          {tokenUsageMeta?.sessionsIndexRelativePath && (
                            <Typography.Paragraph style={{ marginBottom: 0 }}>
                              {intl.formatMessage({ id: 'session.tokenZeroIndexFileLabel' })}
                              <br />
                              <Typography.Text copyable code style={{ fontSize: 12 }}>
                                {tokenUsageMeta.sessionsIndexRelativePath}
                              </Typography.Text>
                              <br />
                              {intl.formatMessage({ id: 'session.tokenZeroIndexPathHint' })}
                            </Typography.Paragraph>
                          )}
                        </div>
                      </Card>

                      <Card size="small" styles={{ body: { padding: 10 } }}>
                        <Typography.Text strong>{intl.formatMessage({ id: 'session.tokenZeroPoint4Title' })}</Typography.Text>
                        <Typography.Paragraph type="secondary" style={{ margin: '6px 0 0' }}>
                          {intl.formatMessage({ id: 'session.tokenZeroPoint4Desc' })}
                        </Typography.Paragraph>
                      </Card>
                    </Space>
                  ),
                },
              ]}
            />
          )}
          <Space split={<Typography.Text type="secondary">·</Typography.Text>}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              In: {input.toLocaleString()}
            </Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Out: {output.toLocaleString()}
            </Typography.Text>
            {utilPct != null && (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {utilPct}%
              </Typography.Text>
            )}
          </Space>
        </Card>
      )}

      <Card>
        <Input.Search
          allowClear
          placeholder={intl.formatMessage({ id: 'session.detailSearchPlaceholder' })}
          value={detailSearch}
          onChange={(e) => setDetailSearch(e.target.value)}
          style={{ marginBottom: searchQ ? 8 : 12 }}
        />
        {tab === 'messages' && (
          <div style={{ marginBottom: 12 }}>
            <Typography.Text type="secondary" style={{ fontSize: 12, marginRight: 8 }}>
              {intl.formatMessage({ id: 'session.msgRoleFilterLabel' })}
            </Typography.Text>
            <Segmented
              size="small"
              value={messageRoleFilter}
              onChange={setMessageRoleFilter}
              options={[
                { label: intl.formatMessage({ id: 'session.msgRoleFilterAll' }), value: 'all' },
                { label: 'user', value: 'user' },
                { label: 'assistant', value: 'assistant' },
                { label: 'boot', value: 'boot' },
              ]}
            />
            <Tooltip title={intl.formatMessage({ id: 'session.msgRoleFilterTooltip' })}>
              <QuestionCircleOutlined style={{ marginLeft: 8, fontSize: 12, opacity: 0.55, cursor: 'help' }} />
            </Tooltip>
          </div>
        )}
        {searchQ && (
          <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 12, fontSize: 12 }}>
            {intl.formatMessage(
              { id: 'session.detailSearchMatch' },
              { n: tabFilteredN, total: tabTotalN },
            )}
          </Typography.Text>
        )}
        <div
          style={{
            marginBottom: 12,
            padding: '10px 12px',
            borderRadius: token.borderRadius,
            background: token.colorFillTertiary,
            border: `1px solid ${token.colorBorderSecondary}`,
          }}
        >
          <Space align="start" size={10}>
            <VerticalAlignTopOutlined
              style={{ color: token.colorPrimary, fontSize: 18, marginTop: 1 }}
              aria-hidden
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <Typography.Text style={{ fontSize: 13 }}>
                {intl.formatMessage({ id: 'session.detailSortHint' })}
              </Typography.Text>
              <Tooltip title={intl.formatMessage({ id: 'session.detailSortTooltip' })}>
                <QuestionCircleOutlined
                  style={{ marginLeft: 8, fontSize: 12, opacity: 0.55, cursor: 'help' }}
                  aria-label={intl.formatMessage({ id: 'session.detailSortTooltip' })}
                />
              </Tooltip>
              <Typography.Paragraph type="secondary" style={{ margin: '6px 0 0', fontSize: 12, marginBottom: 0 }}>
                {intl.formatMessage({ id: 'session.detailSortSubline' })}
              </Typography.Paragraph>
            </div>
          </Space>
        </div>
        <Tabs
          activeKey={tab}
          onChange={setTab}
          items={[
            {
              key: 'messages',
              label: `${intl.formatMessage({ id: 'session.messages' })} (${messagesFilteredReversed.length})`,
              children: (
                <SessionMessagesList
                  messages={messagesFilteredReversed}
                  intl={intl}
                  token={token}
                  listResetKey={`${id}-${messageRoleFilter}-${detailSearch.trim()}`}
                />
              ),
            },
            {
              key: 'toolCalls',
              label: `${intl.formatMessage({ id: 'session.tools' })} (${session.toolCalls?.length || 0})`,
              children: <ToolCallsPanel toolCalls={sortedTools} token={token} intl={intl} />,
            },
            {
              key: 'events',
              label: `${intl.formatMessage({ id: 'session.events' })} (${session.events?.length || 0})`,
              children: (
                <div style={{ maxHeight: 520, overflow: 'auto' }}>
                  {eventsFilteredSorted.map((ev, idx) => (
                    <Card key={`${ev.timestamp ?? 'e'}-${idx}`} size="small" style={{ marginBottom: 8 }}>
                      <Space wrap align="center">
                        {idx === 0 && (
                          <Tag color="processing">{intl.formatMessage({ id: 'session.detailNewestBadge' })}</Tag>
                        )}
                        <Tag>{ev.type || 'event'}</Tag>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          {ev.timestamp ? new Date(ev.timestamp).toLocaleString(intl.locale) : '—'}
                        </Typography.Text>
                      </Space>
                      <pre style={{ fontSize: 12, marginTop: 8 }}>{JSON.stringify(ev.payload || ev, null, 2)}</pre>
                    </Card>
                  ))}
                  {!eventsFilteredSorted.length && (
                    <Typography.Text type="secondary">—</Typography.Text>
                  )}
                </div>
              ),
            },
            {
              key: 'skills',
              label: `${intl.formatMessage({ id: 'session.skills' })} (${session.invokedSkills?.length || 0})`,
              children: <SkillsPanel skills={skillsFilteredReversed} intl={intl} />,
            },
          ]}
        />
      </Card>
    </div>
  );
}

function RowCards({ session, formatDuration, formatFileSize, resolveSessionLogBytes, intl }) {
  const invoked = [...(session.invokedSkills || [])].reverse();
  const parseScopeLabel =
    session.transcriptParseMode === 'head_tail'
      ? intl.formatMessage(
          { id: 'session.transcriptParseHeadTailDetail' },
          {
            head: session.transcriptHeadJsonlLineCount ?? 0,
            tail: session.transcriptTailJsonlLineCount ?? 0,
          },
        )
      : intl.formatMessage(
          { id: 'session.transcriptParseFullDetail' },
          { lines: session.transcriptJsonlLineCount ?? '—' },
        );
  return (
    <>
      <Descriptions bordered size="small" column={{ xs: 1, sm: 2, md: 4 }} style={{ marginBottom: 16 }}>
        <Descriptions.Item label={intl.formatMessage({ id: 'session.transcriptLogSize' })}>
          {formatFileSize(resolveSessionLogBytes(session))}
        </Descriptions.Item>
        <Descriptions.Item
          label={
            <Tooltip title={intl.formatMessage({ id: 'session.messageCountTooltip' })}>
              <span style={{ cursor: 'help' }}>
                {intl.formatMessage({ id: 'session.messageCount' })}
                <QuestionCircleOutlined style={{ marginLeft: 4, fontSize: 12, opacity: 0.55 }} />
              </span>
            </Tooltip>
          }
        >
          {session.messages?.length ?? 0}
        </Descriptions.Item>
        <Descriptions.Item label="Status">{session.status}</Descriptions.Item>
        <Descriptions.Item
          label={
            <Tooltip title={intl.formatMessage({ id: 'sessions.column.participantTooltip' })}>
              <span style={{ cursor: 'help' }}>
                {intl.formatMessage({ id: 'sessions.detailParticipantLabel' })}
              </span>
            </Tooltip>
          }
        >
          <DetailParticipantField session={session} intl={intl} />
        </Descriptions.Item>
        <Descriptions.Item label="Tools">{session.toolCalls?.length ?? 0}</Descriptions.Item>
        <Descriptions.Item label="Duration">{formatDuration(session.duration)}</Descriptions.Item>
        {session.transcriptParseMode && (
          <Descriptions.Item label={intl.formatMessage({ id: 'session.transcriptParseScope' })} span={2}>
            {parseScopeLabel}
          </Descriptions.Item>
        )}
      </Descriptions>
      {invoked.length > 0 && (
        <Card size="small" title={intl?.formatMessage({ id: 'session.invokedSkills' }) || 'Skills invoked'} style={{ marginBottom: 16 }}>
          <Space wrap>
            {invoked.map((s) => (
              <Tag key={s.skillName}>
                {s.skillName}
                {s.readCount > 1 && ` ×${s.readCount}`}
              </Tag>
            ))}
          </Space>
        </Card>
      )}
    </>
  );
}
