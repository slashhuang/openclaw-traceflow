import React, { useState } from 'react';
import { Card, Steps, Form, Input, Button, Space, Typography, message, Alert } from 'antd';
import { useIntl } from 'react-intl';
import { setupApi, extractApiErrorMessage } from '../api';
import SectionScopeHint from '../components/SectionScopeHint';

export default function SetupWizard({ onComplete }) {
  const intl = useIntl();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const handleFinish = async () => {
    setSaving(true);
    const toastKey = 'setup-save-config';
    message.loading({ content: '正在保存配置...', key: toastKey, duration: 0 });
    try {
      const vals = form.getFieldsValue();
      await setupApi.configure({
        openclawStateDir: (vals.openclawStateDir || '').trim() || undefined,
        openclawWorkspaceDir: (vals.openclawWorkspaceDir || '').trim() || undefined,
        openclawConfigPath: (vals.openclawConfigPath || '').trim() || undefined,
      });
      message.success({ content: intl.formatMessage({ id: 'settings.saveSuccess' }), key: toastKey });
      setTimeout(() => onComplete(), 300);
    } catch (e) {
      message.error({ content: extractApiErrorMessage(e, '保存失败'), key: toastKey });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: 'var(--ant-color-bg-layout)',
      }}
    >
      <Card
        style={{ maxWidth: 640, width: '100%' }}
        title={<Typography.Title level={3} style={{ margin: 0 }}>🦞 {intl.formatMessage({ id: 'setup.wizard.title' })}</Typography.Title>}
        extra={<SectionScopeHint intl={intl} messageId="setup.wizardScopeDesc" />}
      >
        <Typography.Paragraph type="secondary">{intl.formatMessage({ id: 'setup.wizard.subtitle' })}</Typography.Paragraph>

        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 24 }}
          message={intl.formatMessage({ id: 'setup.simple.desc' })}
        />

        <Form
          form={form}
          layout="vertical"
          initialValues={{
            openclawStateDir: '',
            openclawWorkspaceDir: '',
            openclawConfigPath: '',
          }}
          onFinish={handleFinish}
        >
          <Form.Item
            name="openclawStateDir"
            label={intl.formatMessage({ id: 'settings.stateDir' })}
            rules={[{ required: true, message: '请输入 State 目录路径' }]}
            extra="OpenClaw Agent 的状态数据目录，如：~/.openclaw/state"
          >
            <Input placeholder="~/.openclaw/state" />
          </Form.Item>

          <Form.Item
            name="openclawWorkspaceDir"
            label={intl.formatMessage({ id: 'settings.workspaceDir' })}
            extra="OpenClaw Agent 的工作区目录，如：~/.openclaw/workspace"
          >
            <Input placeholder="~/.openclaw/workspace" />
          </Form.Item>

          <Form.Item
            name="openclawConfigPath"
            label={intl.formatMessage({ id: 'setup.paths.configPath' })}
            extra="OpenClaw 配置文件路径"
          >
            <Input placeholder="~/.openclaw/openclaw.json" />
          </Form.Item>

          <Space>
            <Button type="primary" htmlType="submit" loading={saving}>
              {saving ? intl.formatMessage({ id: 'setup.saving' }) : intl.formatMessage({ id: 'setup.complete' })}
            </Button>
          </Space>
        </Form>
      </Card>
    </div>
  );
}
