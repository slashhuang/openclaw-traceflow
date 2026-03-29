import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom';
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
  Descriptions,
  Collapse,
  theme,
  message,
  Modal,
  Tooltip,
  Input,
  Popover,
  Select,
  Row,
  Col,
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
import { EvaluationButton } from '../components/evaluation/EvaluationButton';
import { EvaluationResult } from '../components/evaluation/EvaluationResult';
import { formatSessionParticipantDisplay } from '../utils/session-user';
import { sessionTokenUtilizationPercent } from '../utils/session-tokens';
import TokenMetricHint from '../components/TokenMetricHint';
import SectionScopeHint from '../components/SectionScopeHint';
import { sessionStatusLabel } from '../i18n/sessionStatusLabel';
import { formatArchiveEpochLabel } from '../utils/archive-epoch';

/** 详情页「参与者」：多人时首位可点 +Tag 展开全部（participants 与消息列表抽取同源） */
function DetailParticipantField({ session, intl }) {
  const ids = session.participants ?? session.participantIds;
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

/** 转录区各 Tab 共用：随视口增高，并设下限避免过矮 */
const SESSION_DETAIL_TAB_SCROLL_STYLE = {
  minHeight: 280,
  height: 'clamp(280px, calc(100dvh - 260px), 1600px)',
  overflow: 'auto',
};

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
    <div style={SESSION_DETAIL_TAB_SCROLL_STYLE}>
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
    <div style={SESSION_DETAIL_TAB_SCROLL_STYLE}>
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
        const sender = msg.sender;

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
                {sender && isInferredUser && (
                  <Tag color="cyan" style={{ fontSize: 11 }}>
                    {sender}
                  </Tag>
                )}
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
  const [searchParams, setSearchParams] = useSearchParams();
  const archiveResetTs = searchParams.get('resetTimestamp') || '';
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

  const sessionEvalBeforeIdRef = useRef(undefined);
  const [sessionLatestEvaluation, setSessionLatestEvaluation] = useState(null);
  const [sessionEvaluationPending, setSessionEvaluationPending] = useState(false);

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
  }, [id, archiveResetTs]);

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

  const loadSession = useCallback(
    async (showToast = false) => {
      if (showToast) {
        setRetrying(true);
        message.loading({ content: '正在重新加载会话...', key: 'session-detail-retry', duration: 0 });
      }
      setLoading(true);
      try {
        const data = await sessionsApi.getDetail(id, {
          resetTimestamp: archiveResetTs || undefined,
        });
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
    },
    [id, archiveResetTs],
  );

  useEffect(() => {
    loadSession(false);
  }, [loadSession]);

  const tryFetchLatestSessionEvaluation = useCallback(
    async (opts) => {
      if (!session?.sessionId) return;
      const silent = opts && opts.silent === true;
      try {
        const res = await fetch(
          `/api/sessions/${encodeURIComponent(session.sessionId)}/evaluations/latest`,
        );
        const d = await res.json();
        if (!d.success || !d.data) {
          if (sessionEvaluationPending && !silent) {
            message.info(intl.formatMessage({ id: 'sessionEvaluation.notReadyYet' }));
          }
          return;
        }
        const ev = d.data;
        const newId = ev.evaluationId;
        if (sessionEvaluationPending) {
          if (sessionEvalBeforeIdRef.current === newId) {
            if (!silent) {
              message.info(intl.formatMessage({ id: 'sessionEvaluation.notReadyYet' }));
            }
            return;
          }
          setSessionLatestEvaluation(ev);
          setSessionEvaluationPending(false);
          sessionEvalBeforeIdRef.current = undefined;
          message.success(intl.formatMessage({ id: 'sessionEvaluation.messageDone' }));
          requestAnimationFrame(() => {
            document
              .getElementById('session-detail-evaluation-result')
              ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          });
        }
      } catch {
        if (sessionEvaluationPending && !silent) {
          message.error(intl.formatMessage({ id: 'sessionEvaluation.fetchFailed' }));
        }
      }
    },
    [sessionEvaluationPending, intl, session?.sessionId],
  );

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== 'visible') return;
      if (!sessionEvaluationPending) return;
      tryFetchLatestSessionEvaluation({ silent: true });
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [sessionEvaluationPending, tryFetchLatestSessionEvaluation]);

  /** pending 变为 true 后（状态已提交）先拉取一次，再定时轮询；静默避免重复 toast */
  useEffect(() => {
    if (!sessionEvaluationPending || !session?.sessionId) return undefined;
    const first = setTimeout(() => {
      tryFetchLatestSessionEvaluation({ silent: true });
    }, 500);
    const loop = setInterval(() => {
      tryFetchLatestSessionEvaluation({ silent: true });
    }, 5000);
    return () => {
      clearTimeout(first);
      clearInterval(loop);
    };
  }, [sessionEvaluationPending, session?.sessionId, tryFetchLatestSessionEvaluation]);

  useEffect(() => {
    if (!session?.sessionId) {
      setSessionLatestEvaluation(null);
      return;
    }
    (async () => {
      try {
        const res = await fetch(
          `/api/sessions/${encodeURIComponent(session.sessionId)}/evaluations/latest`,
        );
        const d = await res.json();
        if (d.success && d.data) setSessionLatestEvaluation(d.data);
        else setSessionLatestEvaluation(null);
      } catch {
        setSessionLatestEvaluation(null);
      }
    })();
  }, [session?.sessionId]);

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
          <Button type="primary" onClick={() => loadSession(true)} loading={retrying}>{intl.formatMessage({ id: 'common.retry' })}</Button>
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
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 'calc(100dvh - 112px)' }}>
      <Space style={{ marginBottom: 16 }} wrap>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Typography.Title level={4} style={{ margin: 0 }}>{intl.formatMessage({ id: 'session.detail' })}</Typography.Title>
          <SectionScopeHint intl={intl} messageId="session.detailPageScopeDesc" />
        </div>
        {session.typeLabel && <Tag>{session.typeLabel}</Tag>}
        <Typography.Text type="secondary" copyable>{session.sessionId}</Typography.Text>
        <Link to="/sessions"><Button>{intl.formatMessage({ id: 'common.back' })}</Button></Link>
        {session.status === 'active' && !session.archiveResetTimestamp && (
          <Button danger onClick={onKill}>{intl.formatMessage({ id: 'common.kill' })}</Button>
        )}
      </Space>

      {(session.archiveEpochs?.length > 0 || session.archiveResetTimestamp) && (
        <div style={{ marginBottom: 12 }}>
          <Space wrap align="center">
            <Typography.Text type="secondary">
              {intl.formatMessage({ id: 'session.archiveTranscriptLabel' })}
            </Typography.Text>
            <Select
              style={{ minWidth: 300 }}
              value={archiveResetTs || ''}
              options={[
                { value: '', label: intl.formatMessage({ id: 'session.transcriptCurrent' }) },
                ...(session.archiveEpochs || []).map((e) => ({
                  value: e.resetTimestamp,
                  label: intl.formatMessage(
                    { id: 'session.archiveEpochOption' },
                    {
                      time: formatArchiveEpochLabel(e.resetTimestamp),
                      tokens: typeof e.totalTokens === 'number' ? e.totalTokens.toLocaleString() : '0',
                    },
                  ),
                })),
                ...(archiveResetTs &&
                !(session.archiveEpochs || []).some((e) => e.resetTimestamp === archiveResetTs)
                  ? [
                      {
                        value: archiveResetTs,
                        label: formatArchiveEpochLabel(archiveResetTs),
                      },
                    ]
                  : []),
              ]}
              onChange={(v) => {
                const next = new URLSearchParams(searchParams);
                if (v) next.set('resetTimestamp', v);
                else next.delete('resetTimestamp');
                setSearchParams(next, { replace: true });
              }}
            />
            {(session.archiveEpochs?.length ?? 0) > 0 && (
              <Link to={`/sessions/${encodeURIComponent(id)}/archives`} style={{ fontSize: 13 }}>
                {intl.formatMessage({ id: 'session.archivesListLink' })}
              </Link>
            )}
          </Space>
        </div>
      )}

      {session.archiveResetTimestamp && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message={intl.formatMessage({ id: 'session.viewingArchiveBanner' })}
        />
      )}

      {session.transcriptParseMode === 'head_tail' && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message={intl.formatMessage({ id: 'session.transcriptHeadTailAlertTitle' })}
          description={
            <Space direction="vertical" size="small" style={{ width: '100%' }}>
              <span>
                {intl.formatMessage(
                  { id: 'session.transcriptHeadTailAlertDesc' },
                  {
                    size: formatFileSize(resolveSessionLogBytes(session)),
                    head: session.transcriptHeadJsonlLineCount ?? 0,
                    tail: session.transcriptTailJsonlLineCount ?? 0,
                  },
                )}
              </span>
              <Button
                size="small"
                onClick={() => {
                  Modal.confirm({
                    title: intl.formatMessage({ id: 'session.loadFullTranscriptTitle' }),
                    content: intl.formatMessage({ id: 'session.loadFullTranscriptContent' }, {
                      size: formatFileSize(resolveSessionLogBytes(session)),
                    }),
                    okText: intl.formatMessage({ id: 'common.loadFull' }),
                    cancelText: intl.formatMessage({ id: 'common.cancel' }),
                    onOk: () => {
                      message.loading({ content: intl.formatMessage({ id: 'session.loadingFull' }), key: 'loadFull' });
                      sessionsApi.getSessionDetail(session.sessionId, { full: true })
                        .then(() => {
                          message.success({ content: intl.formatMessage({ id: 'session.loadedFull' }), key: 'loadFull' });
                          window.location.reload();
                        })
                        .catch((err) => {
                          message.error({ content: err.message || 'Failed', key: 'loadFull' });
                        });
                    },
                  });
                }}
              >
                {intl.formatMessage({ id: 'session.loadFullTranscript' })}
              </Button>
            </Space>
          }
        />
      )}

      <Card
        size="small"
        title={intl.formatMessage({ id: 'session.detailCollapseMeta' })}
        style={{ marginBottom: 16 }}
      >
        <RowCards
          session={session}
          formatDuration={formatDuration}
          formatFileSize={formatFileSize}
          resolveSessionLogBytes={resolveSessionLogBytes}
          intl={intl}
        />
      </Card>

      <Row gutter={[16, 16]} wrap style={{ alignItems: 'flex-start' }}>
        <Col xs={{ span: 24, order: 2 }} lg={{ span: 15, order: 1 }} xl={{ span: 16, order: 1 }} style={{ minWidth: 0 }}>
      <Card
        title={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            {intl.formatMessage({ id: 'session.transcriptPanelTitle' })}
            <SectionScopeHint intl={intl} messageId="session.transcriptPanelScopeDesc" />
          </span>
        }
        style={{ marginBottom: 0 }}
        styles={{ body: { paddingBottom: 12 } }}
      >
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
                <div style={SESSION_DETAIL_TAB_SCROLL_STYLE}>
                  <SessionMessagesList
                    messages={messagesFilteredReversed}
                    intl={intl}
                    token={token}
                    listResetKey={`${id}-${messageRoleFilter}-${detailSearch.trim()}`}
                  />
                </div>
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
                <div style={SESSION_DETAIL_TAB_SCROLL_STYLE}>
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
        </Col>

        <Col xs={{ span: 24, order: 1 }} lg={{ span: 9, order: 2 }} xl={{ span: 8, order: 2 }}>
          <div
            style={{
              position: 'sticky',
              top: 72,
              alignSelf: 'flex-start',
              maxHeight: 'calc(100dvh - 100px)',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
            }}
          >
            <div
              id="session-detail-evaluation-section"
              style={{
                marginBottom: 0,
                padding: 16,
                borderRadius: token.borderRadius,
                border: `1px solid ${token.colorPrimaryBorder || token.colorBorder}`,
                background: token.colorFillQuaternary,
              }}
            >
              {sessionEvaluationPending && (
                <Alert
                  type="info"
                  showIcon
                  message={intl.formatMessage({ id: 'sessionEvaluation.pendingBanner' })}
                  action={
                    <Button size="small" type="primary" onClick={() => tryFetchLatestSessionEvaluation()}>
                      {intl.formatMessage({ id: 'sessionEvaluation.fetchResult' })}
                    </Button>
                  }
                  style={{ marginBottom: 12 }}
                />
              )}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  flexWrap: 'wrap',
                  gap: 12,
                  marginBottom: sessionLatestEvaluation ? 12 : 8,
                }}
              >
                <Typography.Title level={5} style={{ margin: 0, flex: '1 1 200px' }}>
                  {intl.formatMessage({ id: 'sessionEvaluation.sectionTitle' })}
                </Typography.Title>
                <EvaluationButton
                  resourceId={session.sessionId}
                  resourceType="session"
                  evaluationUi="session"
                  onEvaluationSubmitted={() => {
                    sessionEvalBeforeIdRef.current = sessionLatestEvaluation?.evaluationId;
                    setSessionEvaluationPending(true);
                    requestAnimationFrame(() => {
                      document
                        .getElementById('session-detail-evaluation-section')
                        ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    });
                  }}
                />
              </div>
              <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
                <Link to="/settings#evaluation-prompt">
                  {intl.formatMessage({ id: 'sessionEvaluation.editPromptLink' })}
                </Link>
              </Typography.Paragraph>
              {sessionLatestEvaluation ? (
                <div id="session-detail-evaluation-result">
                  <EvaluationResult evaluation={sessionLatestEvaluation} />
                  <Space style={{ marginTop: 12 }}>
                    <Button onClick={() => setSessionLatestEvaluation(null)}>
                      {intl.formatMessage({ id: 'sessionEvaluation.hideResult' })}
                    </Button>
                    <Button
                      onClick={() => {
                        (async () => {
                          try {
                            const res = await fetch(
                              `/api/sessions/${encodeURIComponent(session.sessionId)}/evaluations/latest`,
                            );
                            const d = await res.json();
                            if (d.success && d.data) setSessionLatestEvaluation(d.data);
                          } catch {
                            message.error(intl.formatMessage({ id: 'sessionEvaluation.fetchFailed' }));
                          }
                        })();
                      }}
                    >
                      {intl.formatMessage({ id: 'sessionEvaluation.refresh' })}
                    </Button>
                  </Space>
                </div>
              ) : (
                <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
                  {intl.formatMessage({ id: 'sessionEvaluation.emptyHint' })}
                </Typography.Paragraph>
              )}
            </div>

      {usage && limit != null && (
      <Collapse
        defaultActiveKey={['token']}
        style={{ marginBottom: 0 }}
        items={[
                {
                  key: 'token',
                  label: intl.formatMessage({ id: 'session.detailCollapseToken' }),
                  children: (
                    <Card
                      size="small"
                      title={
                        <Space wrap size={8}>
                          <span>{intl.formatMessage({ id: 'session.tokenCardTitleDual' })}</span>
                          {contextUnreliable && (
                            <Tooltip
                              title={
                                <span>
                                  <strong>{intl.formatMessage({ id: 'session.tokenContextUnreliableTitle' })}</strong>
                                  <br />
                                  {intl.formatMessage({ id: 'session.tokenContextUnreliableDesc' })}
                                </span>
                              }
                            >
                              <Tag color="purple" style={{ margin: 0, fontSize: 11, cursor: 'help' }}>
                                {intl.formatMessage({ id: 'session.tokenContextUnreliableTitle' })}
                              </Tag>
                            </Tooltip>
                          )}
                          {tokenUsageMeta?.totalTokensFresh === false && (
                            <Tooltip title={intl.formatMessage({ id: 'sessions.estimatedTokensDisclaimer' })}>
                              <Tag color="volcano" style={{ margin: 0, fontSize: 11 }}>
                                {intl.formatMessage({ id: 'sessions.staleIndexBadge' })}
                              </Tag>
                            </Tooltip>
                          )}
                        </Space>
                      }
                      extra={<SectionScopeHint intl={intl} messageId="session.tokenCardScopeDesc" />}
                      style={{ marginBottom: 0 }}
                    >
                      <Descriptions
                        size="small"
                        column={1}
                        layout="vertical"
                        styles={{
                          label: { width: '100%' },
                          content: {
                            width: '100%',
                            maxWidth: '100%',
                            wordBreak: 'break-word',
                            overflowWrap: 'break-word',
                          },
                        }}
                        style={{ marginBottom: 12 }}
                      >
            <Descriptions.Item
              label={
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  {intl.formatMessage({ id: 'session.tokenValidDataLabel' })}
                  <TokenMetricHint intl={intl} value={total} />
                </span>
              }
            >
              <Space direction="vertical" size={4} style={{ width: '100%' }}>
                <Tooltip
                  title={
                    contextUnreliable ? (
                      <span>
                        <strong>{intl.formatMessage({ id: 'session.tokenContextUnreliableTitle' })}</strong>
                        <br />
                        {intl.formatMessage({ id: 'session.tokenContextUnreliableDesc' })}
                      </span>
                    ) : undefined
                  }
                >
                  <Typography.Text type={contextUnreliable ? 'secondary' : undefined}>
                    {total.toLocaleString()} / {limit.toLocaleString()}
                    {contextUnreliable ? ' *' : ''}
                  </Typography.Text>
                </Tooltip>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {intl.formatMessage(
                    { id: 'session.tokenInOutInline' },
                    { inTok: input.toLocaleString(), outTok: output.toLocaleString() },
                  )}
                </Typography.Text>
                {!contextUnreliable && utilPct != null && (
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {intl.formatMessage({ id: 'sessions.column.util' })}: {utilPct}%
                  </Typography.Text>
                )}
              </Space>
            </Descriptions.Item>
            <Descriptions.Item
              label={
                <Tooltip title={intl.formatMessage({ id: 'sessions.column.estimatedLogTooltip' })}>
                  <span style={{ cursor: 'help' }}>
                    {intl.formatMessage({ id: 'session.tokenEstimateLabel' })}
                  </span>
                </Tooltip>
              }
            >
              {session.estimatedTokensFromLog != null ? (
                <Tooltip title={intl.formatMessage({ id: 'sessions.estimatedTokensDisclaimer' })}>
                  <Typography.Text type="secondary">≈ {session.estimatedTokensFromLog.toLocaleString()}</Typography.Text>
                </Tooltip>
              ) : (
                '—'
              )}
            </Descriptions.Item>
          </Descriptions>
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
                  ),
                },
        ]}
      />
      )}
          </div>
        </Col>
      </Row>
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
  const descMb = invoked.length > 0 ? 16 : 0;
  return (
    <>
      <Descriptions
        bordered
        size="small"
        column={{ xs: 1, sm: 2, md: 4 }}
        style={{ marginBottom: descMb }}
      >
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
        <Descriptions.Item
          label={
            <Tooltip title={intl.formatMessage({ id: 'sessions.column.statusTooltip' })}>
              <span style={{ cursor: 'help' }}>{intl.formatMessage({ id: 'sessions.column.status' })}</span>
            </Tooltip>
          }
        >
          {sessionStatusLabel(intl, session.status)}
        </Descriptions.Item>
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
        <Card
          size="small"
          title={intl?.formatMessage({ id: 'session.invokedSkills' }) || 'Skills invoked'}
          extra={<SectionScopeHint intl={intl} messageId="session.invokedSkillsCardScopeDesc" />}
          style={{ marginBottom: 0 }}
        >
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
