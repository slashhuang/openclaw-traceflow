import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ConfigProvider, theme as antdTheme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import enUS from 'antd/locale/en_US';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import { IntlProvider } from 'react-intl';
import { palette } from '../theme/colors';
import zhMessages from '../locales/zh-CN';
import enMessages from '../locales/en-US';

const STORAGE_LOCALE = 'openclaw-traceflow-locale';
const STORAGE_THEME = 'openclaw-traceflow-theme';

const LocaleThemeContext = createContext(null);

function getSystemDark() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(prefers-color-scheme: dark)')?.matches ?? false;
}

export function LocaleThemeProvider({ children }) {
  const [locale, setLocaleState] = useState(() => {
    try {
      const v = localStorage.getItem(STORAGE_LOCALE);
      if (v === 'en-US' || v === 'zh-CN') return v;
    } catch (_) {}
    return navigator.language?.startsWith('zh') ? 'zh-CN' : 'en-US';
  });

  const [themeMode, setThemeModeState] = useState(() => {
    try {
      const v = localStorage.getItem(STORAGE_THEME);
      if (v === 'light' || v === 'dark' || v === 'system') return v;
    } catch (_) {}
    return 'dark';
  });

  const [systemDark, setSystemDark] = useState(getSystemDark);

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mq) return;
    const fn = () => setSystemDark(mq.matches);
    mq.addEventListener?.('change', fn);
    return () => mq.removeEventListener?.('change', fn);
  }, []);

  const isDark = themeMode === 'dark' || (themeMode === 'system' && systemDark);

  useEffect(() => {
    const theme = isDark ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', theme);
    document.body.style.background = palette[theme].bodyBg;
  }, [isDark]);

  const setLocale = useCallback((l) => {
    setLocaleState(l);
    try {
      localStorage.setItem(STORAGE_LOCALE, l);
    } catch (_) {}
  }, []);

  const setThemeMode = useCallback((m) => {
    setThemeModeState(m);
    try {
      localStorage.setItem(STORAGE_THEME, m);
    } catch (_) {}
  }, []);

  useEffect(() => {
    dayjs.locale(locale === 'zh-CN' ? 'zh-cn' : 'en');
  }, [locale]);

  const messages = locale === 'zh-CN' ? zhMessages : enMessages;
  const antdLocale = locale === 'zh-CN' ? zhCN : enUS;

  const configTheme = useMemo(() => {
    const c = isDark ? palette.dark : palette.light;
    return {
      algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
      token: {
        colorPrimary: c.primary,
        colorPrimaryHover: c.primaryHover,
        colorSuccess: c.success,
        colorWarning: c.warning,
        colorError: c.error,
        colorInfo: c.info,
        borderRadius: 8,
        colorBgLayout: c.bodyBg,
        colorBgContainer: c.containerBg,
        colorBorderSecondary: c.borderSecondary,
      },
      components: {
        Layout: {
          bodyBg: c.bodyBg,
          headerBg: c.headerBg,
          siderBg: c.siderBg,
        },
      },
    };
  }, [isDark]);

  const value = useMemo(
    () => ({
      locale,
      setLocale,
      themeMode,
      setThemeMode,
      isDark,
    }),
    [locale, setLocale, themeMode, setThemeMode, isDark],
  );

  return (
    <LocaleThemeContext.Provider value={value}>
      <IntlProvider locale={locale} messages={messages} defaultLocale="en-US">
        <ConfigProvider locale={antdLocale} theme={configTheme}>
          {children}
        </ConfigProvider>
      </IntlProvider>
    </LocaleThemeContext.Provider>
  );
}

export function useLocaleTheme() {
  const ctx = useContext(LocaleThemeContext);
  if (!ctx) throw new Error('useLocaleTheme must be used within LocaleThemeProvider');
  return ctx;
}
