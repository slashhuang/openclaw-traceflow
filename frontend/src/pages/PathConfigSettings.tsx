import React, { useState, useEffect } from 'react';
import {
  Card,
  Form,
  Input,
  Button,
  Space,
  Alert,
  Tag,
  message,
  List,
  Spin,
} from 'antd';
import {
  SaveOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  SyncOutlined,
} from '@ant-design/icons';

interface PathConfig {
  openclawStateDir?: string;
  openclawWorkspaceDir?: string;
  resolved?: {
    configPath?: string | null;
    stateDir?: string | null;
    workspaceDir?: string | null;
    source?: any;
  };
}

interface ValidationErrors {
  valid: boolean;
  errors: string[];
  warnings: string[];
  suggestions: string[];
}

/**
 * 路径配置页面 - OpenClaw 核心路径配置
 * 这是整个系统的基石
 */
const PathConfigSettings: React.FC = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const [config, setConfig] = useState<PathConfig | null>(null);
  const [validation, setValidation] = useState<ValidationErrors | null>(null);

  // 加载配置
  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/settings/paths');
      const data = await response.json();
      setConfig(data);
      form.setFieldsValue({
        openclawStateDir: data.openclawStateDir,
        openclawWorkspaceDir: data.openclawWorkspaceDir,
      });
    } catch (error) {
      message.error('加载配置失败');
    } finally {
      setLoading(false);
    }
  };

  // 保存配置
  const handleSave = async (values: any) => {
    console.log('[PathConfigSettings] Saving config:', values);
    try {
      setSaving(true);
      const response = await fetch('/api/settings/paths', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      
      console.log('[PathConfigSettings] Response status:', response.status);
      const result = await response.json();
      console.log('[PathConfigSettings] Response data:', result);
      
      if (result.success) {
        // 不重新加载配置，直接显示成功提示
        message.success('配置已保存！');
        // 更新本地状态，保持表单值不变
        setConfig(prev => prev ? { ...prev, ...values } : values);
      } else {
        message.error('保存失败：' + result.message);
      }
    } catch (error) {
      console.error('[PathConfigSettings] Save error:', error);
      message.error('保存失败：' + (error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  // 验证路径
  const handleValidate = async () => {
    try {
      setValidating(true);
      const response = await fetch('/api/settings/paths/validate');
      const data = await response.json();
      setValidation(data);
      
      if (data.valid) {
        message.success('路径验证通过');
      } else {
        message.warning('路径验证发现问题，请查看详细信息');
      }
    } catch (error) {
      message.error('验证失败');
    } finally {
      setValidating(false);
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
      <Card
        title={
          <Space>
            <SyncOutlined spin={saving} />
            OpenClaw 路径配置
          </Space>
        }
        extra={
          <Button
            onClick={handleValidate}
            loading={validating}
            icon={<CheckCircleOutlined />}
          >
            验证路径
          </Button>
        }
      >
        {/* 验证结果 */}
        {validation && (
          <Alert
            message={
              validation.valid
                ? '路径验证通过'
                : `发现 ${validation.errors.length} 个问题`
            }
            type={validation.valid ? 'success' : 'error'}
            showIcon
            style={{ marginBottom: 16 }}
            description={
              <Space direction="vertical" style={{ width: '100%' }}>
                {validation.errors.length > 0 && (
                  <List
                    size="small"
                    header={<strong>错误：</strong>}
                    dataSource={validation.errors}
                    renderItem={(item) => (
                      <List.Item>
                        <ExclamationCircleOutlined style={{ color: 'red' }} />{' '}
                        {item}
                      </List.Item>
                    )}
                  />
                )}
                {validation.warnings.length > 0 && (
                  <List
                    size="small"
                    header={<strong>警告：</strong>}
                    dataSource={validation.warnings}
                    renderItem={(item) => (
                      <List.Item>
                        <ExclamationCircleOutlined style={{ color: 'orange' }} />{' '}
                        {item}
                      </List.Item>
                    )}
                  />
                )}
                {validation.suggestions.length > 0 && (
                  <List
                    size="small"
                    header={<strong>建议：</strong>}
                    dataSource={validation.suggestions}
                    renderItem={(item) => (
                      <List.Item>• {item}</List.Item>
                    )}
                  />
                )}
              </Space>
            }
          />
        )}

        {/* 当前解析状态 */}
        {config?.resolved && (
          <Alert
            message="当前解析状态"
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            description={
              <Space direction="vertical" style={{ width: '100%' }}>
                <div>
                  <strong>State Dir:</strong>{' '}
                  <Tag color={config.resolved.stateDir ? 'green' : 'red'}>
                    {config.resolved.stateDir || '未解析'}
                  </Tag>
                </div>
                <div>
                  <strong>Workspace Dir:</strong>{' '}
                  <Tag
                    color={config.resolved.workspaceDir ? 'green' : 'orange'}
                  >
                    {config.resolved.workspaceDir || '未解析'}
                  </Tag>
                </div>
                {config.resolved.cliHint && (
                  <div>
                    <strong>提示:</strong> {config.resolved.cliHint}
                  </div>
                )}
              </Space>
            }
          />
        )}

        <Form
          form={form}
          layout="vertical"
          onFinish={handleSave}
          initialValues={config || {}}
        >
          <Form.Item
            label="OpenClaw State 目录"
            name="openclawStateDir"
            rules={[
              {
                required: true,
                message: '请输入 State 目录路径',
              },
            ]}
          >
            <Input placeholder="~/.openclaw/state" />
          </Form.Item>

          <Form.Item
            label="OpenClaw Workspace 目录"
            name="openclawWorkspaceDir"
            rules={[
              {
                required: true,
                message: '请输入 Workspace 目录路径',
              },
            ]}
          >
            <Input placeholder="~/.openclaw/workspace" />
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

export default PathConfigSettings;
