import React, { useState, useEffect } from 'react';
import { Card, Form, Input, Button, Space, Typography, message, Modal, Row, Col, Alert } from 'antd';
import { useIntl } from 'react-intl';
import { setupApi, actionsApi } from '../api';

export default function Settings() {
  const intl = useIntl();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showPaths, setShowPaths] = useState(false);
  const [sys, setSys] = useState(null);

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
        message.error(e?.message || e?.response?.data || 'Error');
      } finally {
        setLoading(false);
      }
    })();
  }, [form]);

  const onTest = async () => {
    const v = form.getFieldsValue();
    setTesting(true);
    const toastKey = 'settings-test-connection';
    message.loading({ content: '正在测试连接...', key: toastKey, duration: 0 });
    try {
      const r = await setupApi.testConnection({
        openclawGatewayUrl: v.openclawGatewayUrl,
        openclawGatewayToken: v.openclawGatewayToken || undefined,
        openclawGatewayPassword: v.openclawGatewayPassword || undefined,
      });
      if (r.connected) message.success({ content: r.message || '连接成功', key: toastKey });
      else message.error({ content: r.error || r.message || '连接失败', key: toastKey });
    } catch (e) {
      message.error({ content: e?.message || e?.response?.data || '连接失败', key: toastKey });
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
      message.error({ content: e?.message || e?.response?.data || '保存失败', key: toastKey });
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
        <Space>
          <Button
            danger
            onClick={() => {
              Modal.confirm({
                title: intl.formatMessage({ id: 'confirm.restart' }),
                onOk: async () => {
                  const toastKey = 'settings-restart';
                  message.loading({ content: '正在重启服务...', key: toastKey, duration: 0 });
                  try {
                    await actionsApi.restart();
                    message.success({ content: '重启成功', key: toastKey });
                  } catch (e) {
                    message.error({ content: e?.message || '重启失败', key: toastKey });
                    throw e;
                  }
                },
              });
            }}
          >
            {intl.formatMessage({ id: 'settings.restart' })}
          </Button>
          <Button
            onClick={() => {
              Modal.confirm({
                title: intl.formatMessage({ id: 'confirm.cleanup' }),
                onOk: async () => {
                  const toastKey = 'settings-cleanup-logs';
                  message.loading({ content: '正在清理日志...', key: toastKey, duration: 0 });
                  try {
                    await actionsApi.cleanupLogs();
                    message.success({ content: '日志清理完成', key: toastKey });
                  } catch (e) {
                    message.error({ content: e?.message || '清理日志失败', key: toastKey });
                    throw e;
                  }
                },
              });
            }}
          >
            {intl.formatMessage({ id: 'settings.cleanup' })}
          </Button>
        </Space>
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
