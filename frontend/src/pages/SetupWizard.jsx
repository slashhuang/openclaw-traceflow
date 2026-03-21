import React, { useState } from 'react';
import { Card, Steps, Form, Input, Button, Space, Row, Col, Typography, message, Tag, Alert } from 'antd';
import { useIntl } from 'react-intl';
import { setupApi, extractApiErrorMessage } from '../api';
import SectionScopeHint from '../components/SectionScopeHint';

export default function SetupWizard({ onComplete }) {
  const intl = useIntl();
  const [step, setStep] = useState(0);
  const [form] = Form.useForm();
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generatingToken, setGeneratingToken] = useState(false);
  const [connected, setConnected] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const gatewayUrl = Form.useWatch('openclawGatewayUrl', form) || 'http://localhost:18789';
  const accessMode = Form.useWatch('accessMode', form) || 'none';
  const accessToken = Form.useWatch('accessToken', form);

  const handleTest = async () => {
    const v = await form.validateFields(['openclawGatewayUrl']).catch(() => null);
    if (!v) {
      message.warning('请先填写 Gateway URL');
      return;
    }
    setTesting(true);
    setTestResult(null);
    const toastKey = 'setup-test-connection';
    message.loading({ content: '正在测试连接...', key: toastKey, duration: 0 });
    try {
      const vals = form.getFieldsValue();
      const result = await setupApi.testConnection({
        openclawGatewayUrl: vals.openclawGatewayUrl,
        openclawGatewayToken: vals.openclawGatewayToken || undefined,
        openclawGatewayPassword: vals.openclawGatewayPassword || undefined,
      });
      setConnected(!!result.connected);
      const resultMessage = result.error || result.message || (result.connected ? '连接成功' : '连接失败');
      message.destroy(toastKey);
      if (result.connected) {
        message.success({ content: resultMessage });
      } else {
        message.error({ content: resultMessage });
      }
      setTestResult({ ok: !!result.connected, message: resultMessage });
    } catch (e) {
      const errorMessage = extractApiErrorMessage(e, '连接失败');
      message.destroy(toastKey);
      message.error({ content: errorMessage });
      setConnected(false);
      setTestResult({ ok: false, message: errorMessage });
    } finally {
      setTesting(false);
    }
  };

  const handleGenerate = async () => {
    setGeneratingToken(true);
    const toastKey = 'setup-generate-token';
    message.loading({ content: '正在生成 Token...', key: toastKey, duration: 0 });
    try {
      const r = await setupApi.generateToken();
      form.setFieldsValue({ accessToken: r.token });
      message.success({ content: 'Token 已生成', key: toastKey });
    } catch (e) {
      message.error({ content: extractApiErrorMessage(e, '生成 Token 失败'), key: toastKey });
    } finally {
      setGeneratingToken(false);
    }
  };

  const handleFinish = async () => {
    setSaving(true);
    const toastKey = 'setup-save-config';
    message.loading({ content: '正在保存配置...', key: toastKey, duration: 0 });
    try {
      const vals = form.getFieldsValue();
      await setupApi.configure({
        openclawGatewayUrl: vals.openclawGatewayUrl,
        openclawGatewayToken: vals.openclawGatewayToken || undefined,
        openclawGatewayPassword: vals.openclawGatewayPassword || undefined,
        accessMode: vals.accessMode,
        accessToken: vals.accessMode === 'token' ? vals.accessToken : undefined,
      });
      message.success({ content: intl.formatMessage({ id: 'settings.saveSuccess' }), key: toastKey });
      setTimeout(() => onComplete(), 300);
    } catch (e) {
      message.error({ content: extractApiErrorMessage(e, '保存失败'), key: toastKey });
    } finally {
      setSaving(false);
    }
  };

  const modes = [
    { value: 'local-only', label: intl.formatMessage({ id: 'mode.local' }), desc: intl.formatMessage({ id: 'mode.local.desc' }) },
    { value: 'token', label: intl.formatMessage({ id: 'mode.token' }), desc: intl.formatMessage({ id: 'mode.token.desc' }) },
    { value: 'none', label: intl.formatMessage({ id: 'mode.none' }), desc: intl.formatMessage({ id: 'mode.none.desc' }) },
  ];

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
        <Steps
          current={step}
          style={{ marginBottom: 24 }}
          items={[
            { title: intl.formatMessage({ id: 'setup.step1.title' }).split('：')[0] || '1' },
            { title: intl.formatMessage({ id: 'setup.step2.title' }).split('：')[0] || '2' },
            { title: intl.formatMessage({ id: 'setup.step3.title' }).split('：')[0] || '3' },
          ]}
        />
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            openclawGatewayUrl: 'http://localhost:18789',
            accessMode: 'none',
          }}
        >
          {step === 0 && (
            <>
              <Typography.Title level={5}>{intl.formatMessage({ id: 'setup.step1.title' })}</Typography.Title>
              <Typography.Paragraph type="secondary">{intl.formatMessage({ id: 'setup.step1.desc' })}</Typography.Paragraph>
              <Form.Item name="openclawGatewayUrl" label={intl.formatMessage({ id: 'setup.gatewayUrl' })} rules={[{ required: true }]}>
                <Input placeholder="http://localhost:18789" />
              </Form.Item>
              <Form.Item name="openclawGatewayToken" label={intl.formatMessage({ id: 'setup.gatewayToken' })}>
                <Input.Password />
              </Form.Item>
              <Form.Item name="openclawGatewayPassword" label={intl.formatMessage({ id: 'setup.gatewayPassword' })}>
                <Input.Password />
              </Form.Item>
              <Space>
                <Button onClick={handleTest} loading={testing}>
                  {testing ? intl.formatMessage({ id: 'setup.testing' }) : intl.formatMessage({ id: 'setup.test' })}
                </Button>
                <Button type="primary" disabled={!connected} onClick={() => setStep(1)}>
                  {intl.formatMessage({ id: 'setup.next' })}
                </Button>
              </Space>
              {testResult && (
                <Alert
                  style={{ marginTop: 12 }}
                  showIcon
                  type={testResult.ok ? 'success' : 'error'}
                  message={testResult.ok ? '连接测试成功' : '连接测试失败'}
                  description={testResult.message}
                />
              )}
            </>
          )}
          {step === 1 && (
            <>
              <Typography.Title level={5}>{intl.formatMessage({ id: 'setup.step2.title' })}</Typography.Title>
              <Typography.Paragraph type="secondary">{intl.formatMessage({ id: 'setup.step2.desc' })}</Typography.Paragraph>
              <Alert
                type="info"
                showIcon
                style={{ marginBottom: 12 }}
                message={intl.formatMessage({ id: 'settings.access.scope' })}
              />
              <Form.Item name="accessMode" label={intl.formatMessage({ id: 'settings.access' })}>
                <Row gutter={[12, 12]}>
                  {modes.map((m) => (
                    <Col span={8} key={m.value}>
                      <Card
                        size="small"
                        hoverable
                        onClick={() => form.setFieldsValue({ accessMode: m.value })}
                        style={{
                          borderColor: accessMode === m.value ? 'var(--ant-color-primary)' : undefined,
                          cursor: 'pointer',
                        }}
                      >
                        <Typography.Text strong>{m.label}</Typography.Text>
                        <div><Typography.Text type="secondary" style={{ fontSize: 12 }}>{m.desc}</Typography.Text></div>
                      </Card>
                    </Col>
                  ))}
                </Row>
              </Form.Item>
              {accessMode === 'token' && (
                <>
                  <Form.Item
                    name="accessToken"
                    label={intl.formatMessage({ id: 'setup.accessToken' })}
                    rules={[{ required: true, message: 'Required' }]}
                  >
                    <Input
                      placeholder={intl.formatMessage({ id: 'setup.accessToken.placeholder' })}
                      addonAfter={
                        <Button type="link" size="small" onClick={handleGenerate} style={{ padding: 0 }} loading={generatingToken}>
                          {intl.formatMessage({ id: 'setup.generate' })}
                        </Button>
                      }
                    />
                  </Form.Item>
                  <Alert
                    type="warning"
                    showIcon
                    style={{ marginBottom: 12 }}
                    message={intl.formatMessage({ id: 'settings.access.tokenHelpTitle' })}
                    description={
                      <div>
                        <Typography.Paragraph style={{ marginBottom: 8 }}>
                          {intl.formatMessage({ id: 'settings.access.tokenHelpDesc' })}
                        </Typography.Paragraph>
                        <Typography.Text code>Authorization: Bearer YOUR_TOKEN</Typography.Text>
                      </div>
                    }
                  />
                </>
              )}
              <Space>
                <Button onClick={() => setStep(0)}>{intl.formatMessage({ id: 'setup.prev' })}</Button>
                <Button
                  type="primary"
                  disabled={accessMode === 'token' && !accessToken}
                  onClick={() => setStep(2)}
                >
                  {intl.formatMessage({ id: 'setup.next' })}
                </Button>
              </Space>
            </>
          )}
          {step === 2 && (
            <>
              <Typography.Title level={5}>{intl.formatMessage({ id: 'setup.step3.title' })}</Typography.Title>
              <Typography.Paragraph type="secondary">{intl.formatMessage({ id: 'setup.step3.desc' })}</Typography.Paragraph>
              <Card size="small" style={{ marginBottom: 16 }}>
                <div><Typography.Text type="secondary">Gateway URL</Typography.Text> <span>{gatewayUrl}</span></div>
                <div><Typography.Text type="secondary">{intl.formatMessage({ id: 'settings.access' })}</Typography.Text> <Tag style={{ marginLeft: 8 }}>{accessMode}</Tag></div>
              </Card>
              <Space>
                <Button onClick={() => setStep(1)}>{intl.formatMessage({ id: 'setup.prev' })}</Button>
                <Button type="primary" loading={saving} onClick={handleFinish}>
                  {saving ? intl.formatMessage({ id: 'setup.saving' }) : intl.formatMessage({ id: 'setup.complete' })}
                </Button>
              </Space>
            </>
          )}
        </Form>
      </Card>
    </div>
  );
}
