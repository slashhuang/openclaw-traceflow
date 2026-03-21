import React, { useState, useEffect } from 'react';
import { Card, Form, Input, Button, Typography, message, Modal, Row, Col, Alert } from 'antd';
import { useIntl } from 'react-intl';
import { setupApi, actionsApi, extractApiErrorMessage } from '../api';

export default function Settings() {
  const intl = useIntl();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showPaths, setShowPaths] = useState(false);
  const [sys, setSys] = useState(null);
  const [testResult, setTestResult] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await setupApi.getStatus();
        setSys(data.config);
        form.setFieldsValue({
          openclawGatewayUrl: data.config.openclawGatewayUrl || '',
          openclawStateDir: data.config.openclawStateDir || data.config.openclawPaths?.stateDir || '',
          openclawWorkspaceDir: data.config.openclawWorkspaceDir || data.config.openclawPaths?.workspaceDir || '',
          accessMode: data.config.accessMode || 'none',
          accessToken: '',
        });
      } catch (e) {
        message.error(extractApiErrorMessage(e, 'Error'));
      } finally {
        setLoading(false);
      }
    })();
  }, [form]);

  const onTest = async () => {
    const v = form.getFieldsValue();
    setTesting(true);
    setTestResult(null);
    const toastKey = 'settings-test-connection';
    message.loading({ content: '正在测试连接...', key: toastKey, duration: 0 });
    try {
      const r = await setupApi.testConnection({
        openclawGatewayUrl: v.openclawGatewayUrl,
        openclawGatewayToken: v.openclawGatewayToken || undefined,
        openclawGatewayPassword: v.openclawGatewayPassword || undefined,
      });
      const resultMessage = r.error || r.message || (r.connected ? '连接成功' : '连接失败');
      message.destroy(toastKey);
      if (r.connected) message.success({ content: resultMessage });
      else message.error({ content: resultMessage });
      setTestResult({ ok: !!r.connected, message: resultMessage });
    } catch (e) {
      const errorMessage = extractApiErrorMessage(e, '连接失败');
      message.destroy(toastKey);
      message.error({ content: errorMessage });
      setTestResult({ ok: false, message: errorMessage });
    } finally {
      setTesting(false);
    }
  };

  const onSave = async () => {
    setSaving(true);
    const toastKey = 'settings-save-config';
    message.loading({ content: '正在保存配置...', key: toastKey, duration: 0 });
    try {
      const v = await form.validateFields();
      await setupApi.configure({
        openclawGatewayUrl: v.openclawGatewayUrl,
        openclawGatewayToken: v.openclawGatewayToken || undefined,
        openclawGatewayPassword: v.openclawGatewayPassword || undefined,
        openclawStateDir: (v.openclawStateDir || '').trim() || undefined,
        openclawWorkspaceDir: (v.openclawWorkspaceDir || '').trim() || undefined,
        accessMode: v.accessMode,
        accessToken: v.accessMode === 'token' ? v.accessToken : undefined,
      });
      message.success({ content: intl.formatMessage({ id: 'settings.saveSuccess' }), key: toastKey });
    } catch (e) {
      if (e?.errorFields) {
        message.destroy(toastKey);
        message.error('保存失败：请先完善必填项');
        return;
      }
      message.error({ content: extractApiErrorMessage(e, '保存失败'), key: toastKey });
    } finally {
      setSaving(false);
    }
  };

  const accessMode = Form.useWatch('accessMode', form);

  const modes = [
    { value: 'local-only', label: intl.formatMessage({ id: 'mode.local' }), desc: intl.formatMessage({ id: 'mode.local.desc' }) },
    { value: 'token', label: intl.formatMessage({ id: 'mode.token' }), desc: intl.formatMessage({ id: 'mode.token.desc' }) },
    { value: 'none', label: intl.formatMessage({ id: 'mode.none' }), desc: intl.formatMessage({ id: 'mode.none.desc' }) },
  ];

  if (loading || !sys) {
    return null;
  }

  return (
    <div>
      <Typography.Title level={4}>{intl.formatMessage({ id: 'settings.title' })}</Typography.Title>
      <Form form={form} layout="vertical">
        <Row gutter={[16, 16]}>
          <Col xs={24} lg={12}>
            <Card title={intl.formatMessage({ id: 'settings.gateway' })}>
              <Form.Item name="openclawGatewayUrl" label={intl.formatMessage({ id: 'setup.gatewayUrl' })}>
                <Input placeholder="http://localhost:18789" />
              </Form.Item>
              <Form.Item name="openclawGatewayToken" label={intl.formatMessage({ id: 'setup.gatewayToken' })}>
                <Input.Password />
              </Form.Item>
              <Form.Item name="openclawGatewayPassword" label={intl.formatMessage({ id: 'setup.gatewayPassword' })}>
                <Input.Password />
              </Form.Item>
              <Button onClick={onTest} loading={testing}>{intl.formatMessage({ id: 'settings.testConn' })}</Button>
              {testResult && (
                <Alert
                  style={{ marginTop: 12 }}
                  showIcon
                  type={testResult.ok ? 'success' : 'error'}
                  message={testResult.ok ? '连接测试成功' : '连接测试失败'}
                  description={testResult.message}
                />
              )}
              <div style={{ marginTop: 16 }}>
                <Button type="link" onClick={() => setShowPaths(!showPaths)} style={{ padding: 0 }}>
                  {showPaths ? intl.formatMessage({ id: 'settings.collapse' }) : intl.formatMessage({ id: 'settings.expand' })}{' '}
                  {intl.formatMessage({ id: 'settings.advanced' })}
                </Button>
                {showPaths && (
                  <div style={{ marginTop: 12 }}>
                    <Form.Item name="openclawStateDir" label={intl.formatMessage({ id: 'settings.stateDir' })}>
                      <Input />
                    </Form.Item>
                    <Form.Item name="openclawWorkspaceDir" label={intl.formatMessage({ id: 'settings.workspaceDir' })}>
                      <Input />
                    </Form.Item>
                  </div>
                )}
              </div>
            </Card>
          </Col>
          <Col xs={24} lg={12}>
            <Card title={intl.formatMessage({ id: 'settings.access' })}>
              <Alert
                type="info"
                showIcon
                style={{ marginBottom: 12 }}
                message={intl.formatMessage({ id: 'settings.access.scope' })}
              />
              <Form.Item name="accessMode">
                <Row gutter={[8, 8]}>
                  {modes.map((m) => (
                    <Col span={8} key={m.value}>
                      <Card
                        size="small"
                        hoverable
                        onClick={() => form.setFieldsValue({ accessMode: m.value })}
                        style={{ borderColor: accessMode === m.value ? 'var(--ant-color-primary)' : undefined, cursor: 'pointer' }}
                      >
                        <Typography.Text strong>{m.label}</Typography.Text>
                        <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 0 }}>{m.desc}</Typography.Paragraph>
                      </Card>
                    </Col>
                  ))}
                </Row>
              </Form.Item>
              {accessMode === 'token' && (
                <>
                  <Form.Item name="accessToken" label={intl.formatMessage({ id: 'setup.accessToken' })}>
                    <Input placeholder={intl.formatMessage({ id: 'setup.accessToken.placeholder' })} />
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
              <Button type="primary" onClick={onSave} loading={saving}>{intl.formatMessage({ id: 'settings.saveCfg' })}</Button>
            </Card>
          </Col>
        </Row>
      </Form>

      <Card title={intl.formatMessage({ id: 'settings.quick' })} style={{ marginTop: 16 }}>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
          {intl.formatMessage({ id: 'settings.restartHint' })}
        </Typography.Paragraph>
        <Button
          danger
          onClick={() => {
            Modal.confirm({
              title: intl.formatMessage({ id: 'confirm.restart' }),
              content: intl.formatMessage({ id: 'settings.restartHint' }),
              onOk: async () => {
                const toastKey = 'settings-restart';
                message.loading({ content: '正在重启服务...', key: toastKey, duration: 0 });
                try {
                  await actionsApi.restart();
                  message.success({ content: '重启成功', key: toastKey });
                } catch (e) {
                  message.error({ content: extractApiErrorMessage(e, '重启失败'), key: toastKey });
                  throw e;
                }
              },
            });
          }}
        >
          {intl.formatMessage({ id: 'settings.restart' })}
        </Button>
      </Card>

      <Card title={intl.formatMessage({ id: 'settings.contact' })} style={{ marginTop: 16 }}>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
          Author:{' '}
          <a href="https://github.com/slashhuang" target="_blank" rel="noreferrer" style={{ marginLeft: 6, fontWeight: 600 }}>
            slashhuang
          </a>
        </Typography.Paragraph>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
          GitHub:{" "}
          <a href="https://github.com/slashhuang/openclaw-traceflow" target="_blank" rel="noreferrer">
            https://github.com/slashhuang/openclaw-traceflow
          </a>
        </Typography.Paragraph>
      </Card>
    </div>
  );
}
