import React, { useEffect, useRef, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ProLayout } from '@ant-design/pro-layout';
import {
  MessageOutlined,
  FileTextOutlined,
  UnorderedListOutlined,
  SettingOutlined,
  ApiOutlined,
  GithubOutlined,
  FolderOutlined,
  DatabaseOutlined,
  WifiOutlined,
  DisconnectOutlined,
} from '@ant-design/icons';
import { Button, Dropdown, Space, Tag, Tooltip, theme, Popover } from 'antd';
import { DownOutlined } from '@ant-design/icons';
import { useIntl } from 'react-intl';
import { useLocaleTheme } from '../providers/LocaleThemeProvider';
import { healthApi, watchSessionApi } from '../api';
import { SETTINGS_GATEWAY_PATH } from '../constants/settingsPaths';
import { APP_BUILD_TIME_ISO, APP_GIT_SHA } from '../buildInfo';

/** 格式化构建时间为北京时间显示 */
function formatBuildTimeDisplay(iso) {
  if (!iso || typeof iso !== 'string') return '';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString('zh-CN', {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: 'Asia/Shanghai',
    });
  } catch {
    return iso;
  }
}

const HEADER_HEALTH_POLL_INTERVAL_MS = 10000;
const WATCH_SESSION_POLL_INTERVAL_MS = 5000;

export default function BasicLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const intl = useIntl();
  const { token } = theme.useToken();
  const { locale, setLocale, themeMode, setThemeMode, isDark } = useLocaleTheme();
  const [health, setHealth] = useState(null);
  const [watchStatus, setWatchStatus] = useState(null);
  const healthFetchInFlightRef = useRef(false);
  const watchFetchInFlightRef = useRef(false);

  // 获取 Session Watch 状态
  useEffect(() => {
    const fetchWatchStatus = async () => {
      if (watchFetchInFlightRef.current) return;
      watchFetchInFlightRef.current = true;
      try {
        const data = await watchSessionApi.getStatus();
        setWatchStatus(data);
      } catch {
        setWatchStatus(null);
      } finally {
        watchFetchInFlightRef.current = false;
      }
    };
    fetchWatchStatus();
    const t = setInterval(fetchWatchStatus, WATCH_SESSION_POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, [intl]);

  useEffect(() => {
    const fetchHealth = async () => {
      if (healthFetchInFlightRef.current) return;
      healthFetchInFlightRef.current = true;
      try {
        const data = await healthApi.getHealth();
        setHealth(data);
      } catch {
        setHealth(null);
      } finally {
        healthFetchInFlightRef.current = false;
      }
    };
    fetchHealth();
    const t = setInterval(fetchHealth, HEADER_HEALTH_POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, [intl]);

  const menuData = [
    {
      path: '/sessions',
      key: '/sessions',
      name: intl.formatMessage({ id: 'menu.sessions' }),
      icon: <MessageOutlined />,
    },
    {
      path: '/system-prompt',
      key: '/system-prompt',
      name: intl.formatMessage({ id: 'menu.systemPrompt' }),
      icon: <FileTextOutlined />,
    },
    { path: '/workspace', key: '/workspace', name: '工作区与记忆', icon: <FolderOutlined /> },
    { path: '/states', key: '/states', name: 'States', icon: <DatabaseOutlined /> },
    {
      path: '/logs',
      key: '/logs',
      name: intl.formatMessage({ id: 'menu.logs' }),
      icon: <UnorderedListOutlined />,
    },
    {
      path: '/settings',
      key: '/settings',
      name: intl.formatMessage({ id: 'menu.settings' }),
      icon: <SettingOutlined />,
    },
    // 贡献审计：路由保留，侧栏隐藏（直达 URL 仍可用）
  ];

  return (
    <ProLayout
      title={intl.formatMessage({ id: 'app.title' })}
      logo={<span style={{ fontSize: 22 }}>🦞</span>}
      layout="mix"
      fixedHeader
      fixSiderbar
      navTheme={isDark ? 'realDark' : 'light'}
      location={{ pathname: location.pathname }}
      menuDataRender={() => menuData}
      menuItemRender={(item, dom) =>
        item.path && !String(item.path).includes(':') ? <Link to={item.path}>{dom}</Link> : dom
      }
      actionsRender={() =>
        [
          (health?.status || health?.openclawConnected != null) && (
            <Tooltip
              key="health-poll"
              styles={{ body: { maxWidth: 420 } }}
              title={
                health?.openclawConnected === false ? (
                  <div>
                    <div style={{ fontWeight: 600, marginBottom: 8 }}>
                      {intl.formatMessage({ id: 'gateway.banner.title' })}
                    </div>
                    {health?.gatewayError ? (
                      <div
                        style={{
                          marginBottom: 8,
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                          opacity: 0.95,
                        }}
                      >
                        {health.gatewayError}
                      </div>
                    ) : null}
                    <div style={{ opacity: 0.85 }}>
                      {intl.formatMessage({ id: 'header.gatewayClickToSettings' })}
                    </div>
                  </div>
                ) : (
                  intl.formatMessage(
                    { id: 'header.healthPollHint' },
                    { seconds: HEADER_HEALTH_POLL_INTERVAL_MS / 1000 },
                  )
                )
              }
            >
              <Space size={4}>
                {health?.status && (
                  <Tag
                    color={
                      health.status === 'ok' || health.status === 'healthy' ? 'success' : 'default'
                    }
                  >
                    {String(health.status)}
                  </Tag>
                )}
                {health?.openclawConnected != null && (
                  <Tag
                    color={health.openclawConnected ? 'success' : 'error'}
                    role={health.openclawConnected ? undefined : 'button'}
                    tabIndex={health.openclawConnected ? undefined : 0}
                    onClick={() => {
                      if (!health.openclawConnected) navigate(SETTINGS_GATEWAY_PATH);
                    }}
                    onKeyDown={(e) => {
                      if (!health.openclawConnected && (e.key === 'Enter' || e.key === ' ')) {
                        e.preventDefault();
                        navigate(SETTINGS_GATEWAY_PATH);
                      }
                    }}
                    style={{
                      fontWeight: 600,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      cursor: health.openclawConnected ? 'default' : 'pointer',
                    }}
                  >
                    <ApiOutlined />
                    {health.openclawConnected
                      ? intl.formatMessage({ id: 'gateway.connected' })
                      : intl.formatMessage({ id: 'gateway.disconnected' })}
                  </Tag>
                )}
              </Space>
            </Tooltip>
          ),
          // Watch Session Change 状态指示器
          watchStatus && (
            <Popover
              key="watch-session"
              content={
                <div style={{ maxWidth: 300 }}>
                  <div style={{ fontWeight: 600, marginBottom: 8 }}>
                    {intl.formatMessage({
                      id: 'watchSession.title',
                      defaultMessage: '会话监听状态',
                    })}
                  </div>
                  {watchStatus.activeSessions > 0 ? (
                    <div>
                      <div style={{ marginBottom: 8 }}>
                        {intl.formatMessage(
                          { id: 'watchSession.activeCount', defaultMessage: '活跃会话：{count}' },
                          { count: watchStatus.activeSessions },
                        )}
                      </div>
                      <div style={{ maxHeight: 200, overflow: 'auto' }}>
                        {watchStatus.sessions.slice(0, 5).map((s) => (
                          <div
                            key={s.sessionId}
                            style={{
                              padding: '4px 0',
                              borderBottom: '1px solid #f0f0f0',
                              fontSize: 12,
                            }}
                          >
                            <div style={{ fontWeight: 500 }}>{s.user}</div>
                            <div style={{ opacity: 0.7, fontSize: 11 }}>
                              {s.messageCount} msgs ·{' '}
                              {new Date(s.lastActivity).toLocaleTimeString()}
                            </div>
                          </div>
                        ))}
                        {watchStatus.sessions.length > 5 && (
                          <div style={{ padding: '4px 0', opacity: 0.7, fontSize: 12 }}>
                            + {watchStatus.sessions.length - 5} more...
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div style={{ opacity: 0.7 }}>
                      {intl.formatMessage({
                        id: 'watchSession.noActive',
                        defaultMessage: '暂无活跃会话',
                      })}
                    </div>
                  )}
                </div>
              }
              title={
                <Space>
                  {watchStatus.watching ? (
                    <WifiOutlined style={{ color: '#52c41a' }} />
                  ) : (
                    <DisconnectOutlined style={{ color: '#999' }} />
                  )}
                  {watchStatus.watching
                    ? intl.formatMessage({ id: 'watchSession.watching', defaultMessage: '监听中' })
                    : intl.formatMessage({
                        id: 'watchSession.notWatching',
                        defaultMessage: '未监听',
                      })}
                </Space>
              }
              trigger="hover"
            >
              <Tag color={watchStatus.watching ? 'green' : 'default'} style={{ cursor: 'pointer' }}>
                {watchStatus.watching ? <WifiOutlined /> : <DisconnectOutlined />}
                {watchStatus.watching
                  ? intl.formatMessage({ id: 'watchSession.watching', defaultMessage: '监听中' })
                  : intl.formatMessage({
                      id: 'watchSession.notWatching',
                      defaultMessage: '未监听',
                    })}
              </Tag>
            </Popover>
          ),
          <a
            key="github"
            href="https://github.com/slashhuang/openclaw-traceflow"
            target="_blank"
            rel="noreferrer"
            style={{ color: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 6 }}
            aria-label={intl.formatMessage({ id: 'header.github' })}
          >
            <GithubOutlined />
            <span>{intl.formatMessage({ id: 'header.github' })}</span>
          </a>,
          <Dropdown
            key="lang"
            menu={{
              items: [
                { key: 'zh-CN', label: '中文' },
                { key: 'en-US', label: 'English' },
              ],
              selectedKeys: [locale],
              onClick: ({ key }) => setLocale(key),
            }}
            trigger={['click']}
          >
            <Button type="text" size="small" style={{ color: 'inherit' }}>
              {locale === 'zh-CN' ? '中文' : 'English'} <DownOutlined />
            </Button>
          </Dropdown>,
          <Dropdown
            key="theme"
            menu={{
              items: [
                { key: 'light', label: intl.formatMessage({ id: 'theme.light' }) },
                { key: 'dark', label: intl.formatMessage({ id: 'theme.dark' }) },
                { key: 'system', label: intl.formatMessage({ id: 'theme.system' }) },
              ],
              selectedKeys: [themeMode],
              onClick: ({ key }) => setThemeMode(key),
            }}
            trigger={['click']}
          >
            <Button type="text" size="small" style={{ color: 'inherit' }}>
              {themeMode === 'light'
                ? intl.formatMessage({ id: 'theme.light' })
                : themeMode === 'dark'
                  ? intl.formatMessage({ id: 'theme.dark' })
                  : intl.formatMessage({ id: 'theme.system' })}{' '}
              <DownOutlined />
            </Button>
          </Dropdown>,
          <Tooltip key="build-info" title={APP_GIT_SHA ? `Git SHA: ${APP_GIT_SHA}` : undefined}>
            <Tag style={{ fontSize: 11, cursor: 'default' }}>
              Build: {formatBuildTimeDisplay(APP_BUILD_TIME_ISO) || 'dev'}
            </Tag>
          </Tooltip>,
        ].filter(Boolean)
      }
      onMenuHeaderClick={() => navigate('/sessions')}
    >
      <div
        style={{
          padding: '0 24px 24px',
          minHeight: 360,
          background: token.colorBgLayout,
        }}
      >
        <Outlet />
      </div>
    </ProLayout>
  );
}
