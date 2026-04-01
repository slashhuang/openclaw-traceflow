import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useIntl } from 'react-intl';
import {
  Alert,
  Button,
  Card,
  Space,
  Spin,
  Tabs,
  Typography,
  theme,
  message,
} from 'antd';
import { CopyOutlined } from '@ant-design/icons';
import type { TraceflowBundledSkill, TraceflowSkillsApiResponse } from '../types/traceflow-skills';

const { Title, Paragraph, Text } = Typography;

function buildCopyAllPayload(skill: TraceflowBundledSkill): string {
  const header = (rel: string) => `=== ${skill.id}/${rel} ===\n`;
  return skill.files.map((f) => `${header(f.path)}${f.content}\n`).join('\n');
}

export const TraceflowSkills: React.FC = () => {
  const intl = useIntl();
  const { token } = theme.useToken();
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [skills, setSkills] = useState<TraceflowBundledSkill[]>([]);

  const fetchSkills = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/traceflow-skills');
      const data = (await res.json()) as TraceflowSkillsApiResponse;
      if (data.success) {
        setSkills(data.skills);
      } else {
        setError(data.error || intl.formatMessage({ id: 'traceflowSkills.loadError' }));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : intl.formatMessage({ id: 'traceflowSkills.loadError' }));
    } finally {
      setLoading(false);
    }
  }, [intl]);

  useEffect(() => {
    void fetchSkills();
  }, [fetchSkills]);

  useLayoutEffect(() => {
    const raw = location.hash?.replace(/^#/, '').trim();
    if (!raw || !skills.length) return;
    requestAnimationFrame(() => {
      document.getElementById(raw)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, [location.hash, skills]);

  const copyText = async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      message.success(intl.formatMessage({ id: 'traceflowSkills.copySuccess' }, { label }));
    } catch {
      message.error(intl.formatMessage({ id: 'traceflowSkills.copyFailed' }));
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 320 }}>
        <Spin size="large" tip={intl.formatMessage({ id: 'traceflowSkills.loading' })} />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 24 }}>
        <Alert
          type="error"
          message={intl.formatMessage({ id: 'traceflowSkills.loadErrorTitle' })}
          description={error}
          showIcon
          action={
            <Button size="small" onClick={() => void fetchSkills()}>
              {intl.formatMessage({ id: 'common.retry' })}
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div style={{ padding: 24, maxWidth: 1100 }}>
      <Title level={2}>{intl.formatMessage({ id: 'traceflowSkills.pageTitle' })}</Title>
      <Paragraph type="secondary">{intl.formatMessage({ id: 'traceflowSkills.intro' })}</Paragraph>

      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {skills.map((skill) => {
          const titleId = `traceflowSkills.skill.${skill.id.replace(/-/g, '_')}.title`;
          const descId = `traceflowSkills.skill.${skill.id.replace(/-/g, '_')}.desc`;
          const skillTitle = intl.formatMessage({ id: titleId });
          const skillDesc = intl.formatMessage({ id: descId });

          const tabItems = skill.files.map((f) => ({
            key: f.path,
            label: f.path,
            children: (
              <div>
                <div style={{ marginBottom: 8 }}>
                  <Button
                    type="primary"
                    size="small"
                    icon={<CopyOutlined />}
                    onClick={() => void copyText(f.path, f.content)}
                  >
                    {intl.formatMessage({ id: 'traceflowSkills.copyFile' })}
                  </Button>
                </div>
                <pre
                  style={{
                    margin: 0,
                    padding: 12,
                    maxHeight: 480,
                    overflow: 'auto',
                    background: token.colorFillTertiary,
                    borderRadius: token.borderRadius,
                    fontSize: 12,
                    lineHeight: 1.5,
                  }}
                >
                  <code>{f.content}</code>
                </pre>
              </div>
            ),
          }));

          return (
            <div key={skill.id} id={skill.id}>
              <Card
                title={
                  <Space direction="vertical" size={0}>
                    <Text strong>{skillTitle}</Text>
                    <Text type="secondary" style={{ fontWeight: 'normal', fontSize: 13 }}>
                      {skillDesc}
                    </Text>
                  </Space>
                }
                extra={
                  <Button
                    icon={<CopyOutlined />}
                    onClick={() => void copyText(skill.id, buildCopyAllPayload(skill))}
                  >
                    {intl.formatMessage({ id: 'traceflowSkills.copyAll' })}
                  </Button>
                }
              >
                <Tabs items={tabItems} />
              </Card>
            </div>
          );
        })}
      </Space>

      <Paragraph style={{ marginTop: 24 }} type="secondary">
        <Link to="/audit">{intl.formatMessage({ id: 'traceflowSkills.backToAudit' })}</Link>
      </Paragraph>
    </div>
  );
};

export default TraceflowSkills;
