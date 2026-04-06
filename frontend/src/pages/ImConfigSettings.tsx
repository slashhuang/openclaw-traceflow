import React, { useState, useEffect } from 'react';
import {
  Card,
  Form,
  Input,
  Button,
  Space,
  Alert,
  Switch,
  message,
  Tag,
  Spin,
  Divider,
} from 'antd';
import {
  SaveOutlined,
  MessageOutlined,
} from '@ant-design/icons';

interface ImConfig {
  enabled: boolean;
  channels?: {
    feishu?: {
      enabled: boolean;
      appId: string;
      appSecret: string;
      targetUserId: string;
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
  const [imStatus, setImStatus] = useState<ImStatus | null>(null);
  const [feishuEnabled, setFeishuEnabled] = useState(false);

  // 监听飞书开关状态，实时更新输入框禁用状态
  Form.useWatch('feishu_enabled', form, (value) => {
    setFeishuEnabled(!!value);
  });

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

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '200px' }}>
        <Spin size="large" tip="加载配置中..." />
      </div>
    );
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
            <Input placeholder="cli_xxx" disabled={!feishuEnabled} />
          </Form.Item>

          <Form.Item
            label="App Secret"
            name="feishu_appSecret"
            rules={[{ required: true, message: '请输入 App Secret' }]}
            extra="飞书开放平台应用的 App Secret"
          >
            <Input.Password placeholder="xxx" disabled={!feishuEnabled} />
          </Form.Item>

          <Form.Item
            label="目标用户 ID"
            name="feishu_targetUserId"
            rules={[{ required: true, message: '请输入目标用户 ID' }]}
            extra="接收消息的飞书用户 ID（open_id 或 user_id）"
          >
            <Input placeholder="ou_xxx" disabled={!feishuEnabled} />
          </Form.Item>

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
      </Card>
    </div>
  );
};

export default ImConfigSettings;
