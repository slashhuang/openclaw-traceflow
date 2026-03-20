import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Card,
  Alert,
  Tabs,
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
} from 'antd';
import { useIntl } from 'react-intl';
import { sessionsApi } from '../api';

function formatJsonForDisplay(val) {
  if (val == null) return '—';
  if (typeof val === 'string') return val;
  try {
    return JSON.stringify(val, null, 2);
  } catch {
    return String(val);
  }
}

function SkillsPanel({ session, intl }) {
  const invoked = session.invokedSkills || [];
  if (!invoked.length) {
    return <Typography.Text type="secondary">—</Typography.Text>;
  }
  return (
    <div style={{ maxHeight: 520, overflow: 'auto' }}>
      <Space wrap>
        {invoked.map((s) => (
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

        return (
          <Card
            key={idx}
            size="small"
            style={{
              marginBottom: 8,
              borderLeft: `4px solid ${tool.success !== false ? (t.colorSuccess || '#52c41a') : (t.colorError || '#ff4d4f')}`,
            }}
          >
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: hasArgs || hasOutputContent ? 8 : 0 }}>
              <Typography.Text strong style={{ fontFamily: 'monospace', fontSize: 14 }}>{name}</Typography.Text>
              <Tag color={tool.success !== false ? 'success' : 'error'}>{tool.success !== false ? 'OK' : 'Fail'}</Tag>
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

function inferMessageLabel(msg) {
  if (msg.role !== 'user') return msg.role;
  const content = (msg.content || '').toLowerCase();
  if (content.includes('heartbeat.md') || content.includes('heartbeat_ok') || content.includes('heartbeat poll')) {
    return 'heartbeat';
  }
  if (content.includes('current time:') && content.length > 150) return 'heartbeat';
  if (content.includes('cron:') || content.includes('scheduled task')) return 'cron';
  return 'user';
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
  const [tokenZeroHelpExpanded, setTokenZeroHelpExpanded] = useState(false);
  const [tab, setTab] = useState(() => (typeof window !== 'undefined' && window.location.hash === '#toolCalls' ? 'toolCalls' : 'messages'));

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
  const utilPct = limit && total > 0 ? Math.min(100, Math.round((total / limit) * 100)) : null;
  const usedPct = limit && total > 0 ? Math.min(100, (total / limit) * 100) : 0;
  const tokenUsageMeta = session?.tokenUsageMeta;
  const showTokenZeroSourceWarning =
    total === 0 &&
    tokenUsageMeta?.source === 'transcript' &&
    tokenUsageMeta?.transcriptUsageObserved &&
    !tokenUsageMeta?.storeTokenFieldsPresent;
  // 用 input/(input+output) 保证条带比例正确，避免 total 与 input+output 不一致时条带溢出
  const sumInOut = input + output;
  const inputRatio = sumInOut > 0 ? input / sumInOut : 0;
  const outputRatio = sumInOut > 0 ? output / sumInOut : 0;
  const inputBarPct = usedPct * inputRatio;
  const outputBarPct = usedPct * outputRatio;

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

      <RowCards session={session} formatDuration={formatDuration} intl={intl} />

      {usage && limit != null && (
        <Card
          size="small"
          title={
            <span>
              Token{' '}
              <Typography.Text type="secondary" style={{ fontWeight: 'normal', fontSize: 13 }}>
                ({total.toLocaleString()}/{limit.toLocaleString()})
              </Typography.Text>
            </span>
          }
          style={{ marginBottom: 16 }}
        >
          <div style={{ marginBottom: 8 }}>
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
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 12 }}
              message={(
                <span
                  onClick={() => setTokenZeroHelpExpanded((v) => !v)}
                  role="button"
                  tabIndex={0}
                  style={{ cursor: 'pointer', fontSize: 13, fontWeight: 500 }}
                >
                  {intl.formatMessage({ id: 'session.tokenZeroTitle' })}
                </span>
              )}
              description={
                tokenZeroHelpExpanded ? (
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
                ) : null
              }
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
        <Tabs
          activeKey={tab}
          onChange={setTab}
          items={[
            {
              key: 'messages',
              label: `${intl.formatMessage({ id: 'session.messages' })} (${session.messages?.length || 0})`,
              children: (
                <div style={{ maxHeight: 520, overflow: 'auto' }}>
                  {(session.messages || []).map((msg, idx) => {
                    const role = inferMessageLabel(msg);
                    const sys = role === 'heartbeat' || role === 'cron';
                    return (
                      <Card
                        key={idx}
                        size="small"
                        style={{
                          marginBottom: 8,
                          background: sys ? token.colorWarningBg : msg.role === 'user' ? token.colorPrimaryBg : token.colorSuccessBg,
                        }}
                      >
                        <Space>
                          <Tag>{role}</Tag>
                          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                            {msg.timestamp ? new Date(msg.timestamp).toLocaleString(intl.locale) : '—'}
                          </Typography.Text>
                        </Space>
                        <Typography.Paragraph style={{ marginTop: 8, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                          {msg.content || '(empty)'}
                        </Typography.Paragraph>
                      </Card>
                    );
                  })}
                  {(!session.messages || !session.messages.length) && (
                    <Typography.Text type="secondary">—</Typography.Text>
                  )}
                </div>
              ),
            },
            {
              key: 'toolCalls',
              label: `${intl.formatMessage({ id: 'session.tools' })} (${session.toolCalls?.length || 0})`,
              children: <ToolCallsPanel toolCalls={session.toolCalls || []} token={token} intl={intl} />,
            },
            {
              key: 'events',
              label: `${intl.formatMessage({ id: 'session.events' })} (${session.events?.length || 0})`,
              children: (
                <div style={{ maxHeight: 520, overflow: 'auto' }}>
                  {(session.events || []).map((ev, idx) => (
                    <Card key={idx} size="small" style={{ marginBottom: 8 }}>
                      <Tag>{ev.type || 'event'}</Tag>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        {ev.timestamp ? new Date(ev.timestamp).toLocaleString(intl.locale) : '—'}
                      </Typography.Text>
                      <pre style={{ fontSize: 12, marginTop: 8 }}>{JSON.stringify(ev.payload || ev, null, 2)}</pre>
                    </Card>
                  ))}
                </div>
              ),
            },
            {
              key: 'skills',
              label: `${intl.formatMessage({ id: 'session.skills' })} (${session.invokedSkills?.length || 0})`,
              children: <SkillsPanel session={session} intl={intl} />,
            },
          ]}
        />
      </Card>
    </div>
  );
}

function RowCards({ session, formatDuration, intl }) {
  const invoked = session.invokedSkills || [];
  return (
    <>
      <Descriptions bordered size="small" column={{ xs: 1, sm: 2, md: 4 }} style={{ marginBottom: 16 }}>
        <Descriptions.Item label="Status">{session.status}</Descriptions.Item>
        <Descriptions.Item label="User">
          {(session.typeLabel === 'heartbeat' || session.typeLabel === 'cron' || session.typeLabel === 'boot') ? session.typeLabel : session.user || '—'}
        </Descriptions.Item>
        <Descriptions.Item label="Messages">{session.messages?.length ?? 0}</Descriptions.Item>
        <Descriptions.Item label="Tools">{session.toolCalls?.length ?? 0}</Descriptions.Item>
        <Descriptions.Item label="Duration">{formatDuration(session.duration)}</Descriptions.Item>
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
