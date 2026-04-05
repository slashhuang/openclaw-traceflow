import React, { useState, useEffect } from 'react';
import {
  Card,
  Form,
  Input,
  Button,
  Space,
  Alert,
  Divider,
  Typography,
  Switch,
  message,
  Tag,
  Spin,
  Row,
  Col,
} from 'antd';
import {
  SaveOutlined,
  MessageOutlined,
  PlayCircleOutlined,
} from '@ant-design/icons';

const { Title, Paragraph } = Typography;
const { TextArea } = Input;

interface ImConfig {
  enabled: boolean;
  channels?: {
    feishu?: {
      enabled: boolean;
      appId: string;
      appSecret: string;
      targetUserId: string;
      pushStrategy?: {
        sessionStart?: boolean;
        sessionMessages?: boolean;
        sessionEnd?: boolean;
        errorLogs?: boolean;
        warnLogs?: boolean;
      };
    };
  };
}

interface ImStatus {
  enabled: boolean;
  channels: Array<{
    type: string;
    enabled: boolean;
    healthy: boolean;
    error?: string;
  }>;
}

const ImConfigSettings: React.FC = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [imStatus, setImStatus] = useState<ImStatus | null>(null);
  const [testMessage, setTestMessage] = useState('');
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // 加载配置
  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      setLoading(true);
      const configResponse = await fetch('/api/settings/im');
      const statusResponse = await fetch('/api/settings/im/status');

      const config = await configResponse.json();
      const status = await statusResponse.json();

      setImStatus(status);
      form.setFieldsValue({
        enabled: config.enabled,
        feishu_enabled: config.channels?.feishu?.enabled,
        feishu_appId: config.channels?.feishu?.appId,
        feishu_appSecret: config.channels?.feishu?.appSecret,
        feishu_targetUserId: config.channels?.feishu?.targetUserId,
        feishu_sessionStart: config.channels?.feishu?.pushStrategy?.sessionStart,
        feishu_sessionMessages: config.channels?.feishu?.pushStrategy?.sessionMessages,
        feishu_sessionEnd: config.channels?.feishu?.pushStrategy?.sessionEnd,
        feishu_errorLogs: config.channels?.feishu?.pushStrategy?.errorLogs,
        feishu_warnLogs: config.channels?.feishu?.pushStrategy?.warnLogs,
      });
    } catch (error) {
      message.error('加载配置失败');
    } finally {
      setLoading(false);
    }
  };

  // 保存配置
  const handleSave = async (values: any) => {
    try {
      setSaving(true);
      const config: ImConfig = {
        enabled: values.enabled,
        channels: {
          feishu: values.feishu_enabled ? {
            enabled: values.feishu_enabled,
            appId: values.feishu_appId,
            appSecret: values.feishu_appSecret,
            targetUserId: values.feishu_targetUserId,
            pushStrategy: {
              sessionStart: values.feishu_sessionStart,
              sessionMessages: values.feishu_sessionMessages,
              sessionEnd: values.feishu_sessionEnd,
              errorLogs: values.feishu_errorLogs,
              warnLogs: values.feishu_warnLogs,
            },
          } : undefined,
        },
      };

      const response = await fetch('/api/settings/im', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      
      const result = await response.json();
      
      if (result.success) {
        message.success(result.message);
        loadConfig();
      } else {
        message.error('保存失败');
      }
    } catch (error) {
      message.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  // 测试推送
  const handleTest = async () => {
    if (!testMessage.trim()) {
      message.warning('请输入测试消息');
      return;
    }

    try {
      setTesting(true);
      setTestResult(null);
      
      const response = await fetch('/api/settings/im/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: 'feishu',
          message: testMessage,
        }),
      });
      
      const result = await response.json();
      setTestResult(result);
      
      if (result.success) {
        message.success('推送成功');
      } else {
        message.error(result.message);
      }
    } catch (error) {
      message.error('测试失败');
      setTestResult({
        success: false,
        message: (error as Error).message,
      });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return <Spin tip="加载配置中..." />;
  }

  return (
    <div>
      {/* IM 状态 */}
      {imStatus && (
        <Alert
          message={
            imStatus.enabled
              ? 'IM 推送已启用'
              : 'IM 推送已禁用'
          }
          type={imStatus.enabled ? 'success' : 'warning'}
          showIcon
          style={{ marginBottom: 16 }}
          description={
            imStatus.channels.length > 0 ? (
              <Space>
                <span>已配置渠道：</span>
                {imStatus.channels.map((ch) => (
                  <Tag
                    key={ch.type}
                    color={ch.enabled ? (ch.healthy ? 'green' : 'orange') : 'default'}
                  >
                    {ch.type} {ch.enabled ? (ch.healthy ? '✓' : '⚠') : '✗'}
                  </Tag>
                ))}
              </Space>
            ) : null
          }
        />
      )}

      <Card title={<><MessageOutlined /> IM 推送配置</>}>
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSave}
        >
          <Form.Item
            label="启用 IM 推送"
            name="enabled"
            valuePropName="checked"
            extra="开启后将通过 IM 推送会话记录和告警消息"
          >
            <Switch />
          </Form.Item>

          <Divider orientation="left">飞书配置</Divider>

          <Form.Item
            label="启用飞书"
            name="feishu_enabled"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>

          <Form.Item
            label="App ID"
            name="feishu_appId"
            rules={[{ required: true, message: '请输入 App ID' }]}
            extra="飞书开放平台应用的 App ID"
          >
            <Input placeholder="cli_xxx" disabled={!form.getFieldValue('feishu_enabled')} />
          </Form.Item>

          <Form.Item
            label="App Secret"
            name="feishu_appSecret"
            rules={[{ required: true, message: '请输入 App Secret' }]}
            extra="飞书开放平台应用的 App Secret"
          >
            <Input.Password placeholder="xxx" disabled={!form.getFieldValue('feishu_enabled')} />
          </Form.Item>

          <Form.Item
            label="目标用户 ID"
            name="feishu_targetUserId"
            rules={[{ required: true, message: '请输入目标用户 ID' }]}
            extra="接收消息的飞书用户 ID（open_id 或 user_id）"
          >
            <Input placeholder="ou_xxx" disabled={!form.getFieldValue('feishu_enabled')} />
          </Form.Item>

          <Divider orientation="left">推送策略</Divider>

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item
                label="会话开始"
                name="feishu_sessionStart"
                valuePropName="checked"
              >
                <Switch />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                label="会话消息"
                name="feishu_sessionMessages"
                valuePropName="checked"
              >
                <Switch />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                label="会话结束"
                name="feishu_sessionEnd"
                valuePropName="checked"
              >
                <Switch />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item
                label="ERROR 日志"
                name="feishu_errorLogs"
                valuePropName="checked"
                extra="预留：用于接收 OpenClaw 推送的自身错误日志（待实现）"
              >
                <Switch />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                label="WARN 日志"
                name="feishu_warnLogs"
                valuePropName="checked"
                extra="预留：用于接收 OpenClaw 推送的自身警告日志（待实现）"
              >
                <Switch />
              </Form.Item>
            </Col>
          </Row>

          <Divider />

          <Form.Item>
            <Space>
              <Button
                type="primary"
                htmlType="submit"
                loading={saving}
                icon={<SaveOutlined />}
              >
                保存配置
              </Button>
              <Button onClick={loadConfig} disabled={saving}>
                重置
              </Button>
            </Space>
          </Form.Item>
        </Form>

        <Divider />

        {/* 测试推送 */}
        <Card
          size="small"
          title={<><PlayCircleOutlined /> 测试推送</>}
          type="inner"
        >
          <Space direction="vertical" style={{ width: '100%' }}>
            <TextArea
              rows={2}
              placeholder="输入测试消息..."
              value={testMessage}
              onChange={(e) => setTestMessage(e.target.value)}
            />
            <Space>
              <Button
                onClick={handleTest}
                loading={testing}
                type="primary"
                icon={<MessageOutlined />}
              >
                发送测试消息
              </Button>
            </Space>
            {testResult && (
              <Alert
                message={testResult.message}
                type={testResult.success ? 'success' : 'error'}
                showIcon
              />
            )}
          </Space>
        </Card>
      </Card>

      <Card
        title="帮助"
        size="small"
        style={{ marginTop: 16 }}
      >
        <Paragraph>
          <Title level={5}>如何配置飞书推送？</Title>
          <ol>
            <li>在飞书开放平台创建企业自建应用</li>
            <li>获取 App ID 和 App Secret</li>
            <li>添加机器人功能并配置权限</li>
            <li>获取目标用户的 open_id 或 user_id</li>
            <li>在上方填写配置并保存</li>
            <li>发送测试消息验证配置</li>
          </ol>
        </Paragraph>

        <Alert
          message="注意"
          description="配置保存后需要重启 TraceFlow 服务才能生效"
          type="info"
          showIcon
        />
      </Card>
    </div>
  );
};

export default ImConfigSettings;
