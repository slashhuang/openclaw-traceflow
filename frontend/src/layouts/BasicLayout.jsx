import React, { useEffect, useRef, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ProLayout } from '@ant-design/pro-layout';
import {
  DashboardOutlined,
  MessageOutlined,
  ToolOutlined,
  FileTextOutlined,
  DollarOutlined,
  UnorderedListOutlined,
  SettingOutlined,
  ApiOutlined,
  GithubOutlined,
} from '@ant-design/icons';
import { Alert, Button, Dropdown, message, Space, Tag, Tooltip, theme } from 'antd';
import { DownOutlined } from '@ant-design/icons';
import { useIntl } from 'react-intl';
import { useLocaleTheme } from '../providers/LocaleThemeProvider';
import { healthApi } from '../api';

const HEADER_HEALTH_POLL_INTERVAL_MS = 10000;

export default function BasicLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const intl = useIntl();
  const { token } = theme.useToken();
  const { locale, setLocale, themeMode, setThemeMode, isDark } = useLocaleTheme();
  const [health, setHealth] = useState(null);
  const didNotifyHealthErrorRef = useRef(false);

  useEffect(() => {
    const fetchHealth = async () => {
      try {
        const data = await healthApi.getHealth();
        setHealth(data);
      } catch {
        setHealth(null);
        if (!didNotifyHealthErrorRef.current) {
          didNotifyHealthErrorRef.current = true;
          message.error(intl.formatMessage({ id: 'gateway.healthError' }));
        }
      }
    };
    fetchHealth();
    const t = setInterval(fetchHealth, HEADER_HEALTH_POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, []);

  const gatewayDisconnected = health && !health.openclawConnected;
  const gatewayError = health?.gatewayError;

  const menuData = [
    { path: '/', key: '/', name: intl.formatMessage({ id: 'menu.dashboard' }), icon: <DashboardOutlined /> },
    { path: '/sessions', key: '/sessions', name: intl.formatMessage({ id: 'menu.sessions' }), icon: <MessageOutlined /> },
    { path: '/skills', key: '/skills', name: intl.formatMessage({ id: 'menu.skills' }), icon: <ToolOutlined /> },
    { path: '/system-prompt', key: '/system-prompt', name: intl.formatMessage({ id: 'menu.systemPrompt' }), icon: <FileTextOutlined /> },
    { path: '/tokens', key: '/tokens', name: intl.formatMessage({ id: 'menu.tokens' }), icon: <DollarOutlined /> },
    { path: '/pricing', key: '/pricing', name: intl.formatMessage({ id: 'menu.pricing' }), icon: <DollarOutlined /> },
    { path: '/logs', key: '/logs', name: intl.formatMessage({ id: 'menu.logs' }), icon: <UnorderedListOutlined /> },
    { path: '/settings', key: '/settings', name: intl.formatMessage({ id: 'menu.settings' }), icon: <SettingOutlined /> },
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
        item.path && !String(item.path).includes(':') ? (
          <Link to={item.path}>{dom}</Link>
        ) : (
          dom
        )
      }
      actionsRender={() =>
        [
          (health?.status || health?.openclawConnected != null) && (
            <Tooltip
              key="health-poll"
              title={intl.formatMessage({ id: 'header.healthPollHint' }, { seconds: HEADER_HEALTH_POLL_INTERVAL_MS / 1000 })}
            >
              <Space size={4}>
                {health?.status && (
                  <Tag color={health.status === 'ok' || health.status === 'healthy' ? 'success' : 'default'}>
                    {String(health.status)}
                  </Tag>
                )}
                {health?.openclawConnected != null && (
                  <Tag
                    color={health.openclawConnected ? 'success' : 'error'}
                    style={{
                      fontWeight: 600,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
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
        ].filter(Boolean)
      }
      onMenuHeaderClick={() => navigate('/')}
    >
      {gatewayDisconnected && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          message={
            <Space wrap>
              <strong>{intl.formatMessage({ id: 'gateway.banner.title' })}</strong>
              {gatewayError && <span>{gatewayError}</span>}
              <a onClick={() => navigate('/settings')} style={{ cursor: 'pointer' }}>
                {intl.formatMessage({ id: 'gateway.banner.settings' })} →
              </a>
            </Space>
          }
        />
      )}
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
