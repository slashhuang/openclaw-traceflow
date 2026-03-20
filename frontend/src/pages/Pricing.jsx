import React, { useState, useEffect } from 'react';
import {
  Card,
  Table,
  Typography,
  Button,
  Input,
  InputNumber,
  Modal,
  Form,
  Space,
  Tag,
  Popconfirm,
  message,
  Switch,
  theme,
  Tabs,
} from 'antd';
import { EditOutlined, DeleteOutlined, ReloadOutlined, PlusOutlined, FireOutlined } from '@ant-design/icons';
import { useIntl } from 'react-intl';
import { pricingApi, sessionsApi } from '../api';

const { Title, Text } = Typography;

// 厂商分类（精简版）
const CATEGORY_MAP = {
  'claude': { name: { zh: 'Anthropic', en: 'Anthropic' }, color: 'orange', group: 'foreign' },
  'gpt': { name: { zh: 'OpenAI', en: 'OpenAI' }, color: 'blue', group: 'foreign' },
  'gemini': { name: { zh: 'Google', en: 'Google' }, color: 'green', group: 'foreign' },
  'deepseek': { name: { zh: 'DeepSeek', en: 'DeepSeek' }, color: 'geekblue', group: 'domestic' },
  'qwen': { name: { zh: '通义千问', en: 'Qwen' }, color: 'purple', group: 'domestic' },
  'qwen3': { name: { zh: '通义千问', en: 'Qwen' }, color: 'purple', group: 'domestic' },
  'kimi': { name: { zh: 'Kimi', en: 'Kimi' }, color: 'cyan', group: 'domestic' },
  'moonshot': { name: { zh: 'Kimi', en: 'Kimi' }, color: 'cyan', group: 'domestic' },
};

// 默认分类
const DEFAULT_CATEGORY = { name: { zh: '其他', en: 'Other' }, color: 'default', group: 'other' };

export default function Pricing() {
  const intl = useIntl();
  const { token } = theme.useToken();
  const [prices, setPrices] = useState({});
  const [config, setConfig] = useState(null);
  const [usedModels, setUsedModels] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [editingModel, setEditingModel] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [form] = Form.useForm();
  const [addForm] = Form.useForm();
  const [searchText, setSearchText] = useState('');
  const [showCustomOnly, setShowCustomOnly] = useState(false);
  const [activeTab, setActiveTab] = useState('used');
  const [savingEdit, setSavingEdit] = useState(false);
  const [savingAdd, setSavingAdd] = useState(false);
  const [deletingModel, setDeletingModel] = useState('');
  const [resetting, setResetting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // 获取用户实际使用的模型列表（从 sessions + 配置文件）
  const fetchUsedModels = async () => {
    try {
      const [sessions, configuredModelsRes] = await Promise.all([
        sessionsApi.list(),
        sessionsApi.getConfiguredModels().catch(() => null),
      ]);

      const models = new Set();

      // 从 sessions 中提取模型
      sessions.forEach(s => {
        if (s.model && typeof s.model === 'string') {
          const modelName = s.model.includes('/') ? s.model.split('/').pop() : s.model;
          models.add(modelName);
        }
      });

      // 从配置文件中提取模型
      if (configuredModelsRes?.models && Array.isArray(configuredModelsRes.models)) {
        configuredModelsRes.models.forEach(model => {
          if (model && typeof model === 'string') {
            const modelName = model.includes('/') ? model.split('/').pop() : model;
            models.add(modelName);
          }
        });
      }

      setUsedModels(models);
    } catch (error) {
      console.error('Failed to fetch used models:', error);
    }
  };

  const fetchData = async (showToast = false) => {
    if (showToast) {
      setRefreshing(true);
      message.loading({ content: '正在刷新价格配置...', key: 'pricing-refresh', duration: 0 });
    }
    try {
      const [pricesRes, configRes] = await Promise.all([
        pricingApi.getAll(),
        pricingApi.getConfig(),
      ]);
      setPrices(pricesRes);
      setConfig(configRes);
      await fetchUsedModels();
      if (showToast) {
        message.success({ content: '价格配置已刷新', key: 'pricing-refresh' });
      }
    } catch (error) {
      console.error('Failed to fetch pricing:', error);
      if (showToast) {
        message.error({ content: intl.formatMessage({ id: 'pricing.message.loadError' }), key: 'pricing-refresh' });
      } else {
        message.error(intl.formatMessage({ id: 'pricing.message.loadError' }));
      }
    } finally {
      setLoading(false);
      if (showToast) {
        setRefreshing(false);
      }
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleEdit = (modelName) => {
    setEditingModel(modelName);
    const pricing = prices[modelName];
    form.setFieldsValue({
      input: pricing?.input || 0,
      output: pricing?.output || 0,
      cacheRead: pricing?.cacheRead || 0,
      cacheWrite: pricing?.cacheWrite || 0,
    });
    setModalVisible(true);
  };

  const handleAdd = () => {
    addForm.resetFields();
    setAddModalVisible(true);
  };

  const handleSave = async () => {
    setSavingEdit(true);
    const toastKey = 'pricing-update-model';
    message.loading({ content: '正在保存模型价格...', key: toastKey, duration: 0 });
    try {
      const values = await form.validateFields();
      await pricingApi.updateModelPrice(editingModel, {
        input: values.input,
        output: values.output,
        cacheRead: values.cacheRead,
        cacheWrite: values.cacheWrite,
      });
      message.success({ content: intl.formatMessage({ id: 'pricing.message.updateSuccess' }), key: toastKey });
      setModalVisible(false);
      await fetchData();
    } catch (error) {
      console.error('Failed to update price:', error);
      if (!error?.errorFields) {
        message.error({ content: intl.formatMessage({ id: 'pricing.message.loadError' }), key: toastKey });
      } else {
        message.destroy(toastKey);
      }
    } finally {
      setSavingEdit(false);
    }
  };

  const handleAddSubmit = async () => {
    setSavingAdd(true);
    const toastKey = 'pricing-add-model';
    message.loading({ content: '正在新增模型价格...', key: toastKey, duration: 0 });
    try {
      const values = await addForm.validateFields();
      await pricingApi.updateModelPrice(values.modelName, {
        input: values.input,
        output: values.output,
        cacheRead: values.cacheRead,
        cacheWrite: values.cacheWrite,
      });
      message.success({ content: intl.formatMessage({ id: 'pricing.message.addSuccess' }), key: toastKey });
      setAddModalVisible(false);
      await fetchData();
    } catch (error) {
      console.error('Failed to add model:', error);
      if (!error?.errorFields) {
        message.error({ content: intl.formatMessage({ id: 'pricing.message.loadError' }), key: toastKey });
      } else {
        message.destroy(toastKey);
      }
    } finally {
      setSavingAdd(false);
    }
  };

  const handleDelete = async (modelName) => {
    setDeletingModel(modelName);
    const toastKey = 'pricing-delete-model';
    message.loading({ content: '正在删除模型价格...', key: toastKey, duration: 0 });
    try {
      await pricingApi.removeModelPrice(modelName);
      message.success({ content: intl.formatMessage({ id: 'pricing.message.deleteSuccess' }), key: toastKey });
      await fetchData();
    } catch (error) {
      console.error('Failed to delete:', error);
      message.error({ content: intl.formatMessage({ id: 'pricing.message.loadError' }), key: toastKey });
    } finally {
      setDeletingModel('');
    }
  };

  const handleReset = async () => {
    setResetting(true);
    const toastKey = 'pricing-reset-defaults';
    message.loading({ content: '正在恢复默认价格...', key: toastKey, duration: 0 });
    try {
      await pricingApi.resetToDefaults();
      message.success({ content: intl.formatMessage({ id: 'pricing.message.resetSuccess' }), key: toastKey });
      await fetchData();
    } catch (error) {
      console.error('Failed to reset:', error);
      message.error({ content: intl.formatMessage({ id: 'pricing.message.loadError' }), key: toastKey });
    } finally {
      setResetting(false);
    }
  };

  // 获取模型分类信息
  const getModelCategory = (modelName) => {
    if (!modelName || typeof modelName !== 'string') {
      return DEFAULT_CATEGORY;
    }
    const lower = modelName.toLowerCase();
    for (const [key, category] of Object.entries(CATEGORY_MAP)) {
      if (lower.includes(key)) {
        return category;
      }
    }
    return DEFAULT_CATEGORY;
  };

  // 获取翻译后的分类名称
  const getCategoryName = (category) => {
    const locale = intl.locale || 'en-US';
    return category.name[locale] || category.name.en;
  };

  // 过滤并排序模型列表
  const getSortedModels = () => {
    let entries = Object.entries(prices);

    // 搜索过滤
    if (searchText) {
      entries = entries.filter(([modelName]) =>
        modelName && typeof modelName === 'string' &&
        modelName.toLowerCase().includes(searchText.toLowerCase())
      );
    }

    // 自定义过滤
    if (showCustomOnly && config?.models) {
      entries = entries.filter(([modelName]) => config.models[modelName]);
    }

    // 按 Tab 过滤和排序
    if (activeTab === 'used') {
      // 使用中的模型排在前面
      entries.sort((a, b) => {
        const aUsed = usedModels.has(a[0]);
        const bUsed = usedModels.has(b[0]);
        if (aUsed && !bUsed) return -1;
        if (!aUsed && bUsed) return 1;
        return 0;
      });
    } else if (activeTab === 'domestic') {
      // 中国模型
      entries = entries.filter(([modelName]) => {
        return getModelCategory(modelName).group === 'domestic';
      });
    } else if (activeTab === 'foreign') {
      // 海外模型
      entries = entries.filter(([modelName]) => {
        return getModelCategory(modelName).group === 'foreign';
      });
    }

    return entries;
  };

  const sortedModels = getSortedModels();
  const customModels = config?.models ? Object.keys(config.models) : [];

  const columns = [
    {
      title: intl.formatMessage({ id: 'pricing.table.model' }),
      dataIndex: 'model',
      key: 'model',
      width: 280,
      sorter: (a, b) => a.model.localeCompare(b.model),
      render: (modelName) => {
        const category = getModelCategory(modelName);
        const isUsed = usedModels.has(modelName);
        return (
          <Space direction="vertical" size={0}>
            <Space>
              <Text code style={{ fontSize: 13 }}>{modelName}</Text>
              {isUsed && (
                <Tag color="red" icon={<FireOutlined />}>
                  {intl.formatMessage({ id: 'pricing.table.inUse' })}
                </Tag>
              )}
            </Space>
            <Tag color={category.color} style={{ fontSize: 10, marginTop: 2 }}>
              {getCategoryName(category)}
            </Tag>
          </Space>
        );
      },
    },
    {
      title: intl.formatMessage({ id: 'pricing.table.input' }),
      dataIndex: 'input',
      key: 'input',
      width: 100,
      sorter: (a, b) => a.input - b.input,
      render: (value) => `$${value?.toFixed(4) || '0.0000'}`,
    },
    {
      title: intl.formatMessage({ id: 'pricing.table.output' }),
      dataIndex: 'output',
      key: 'output',
      width: 100,
      sorter: (a, b) => a.output - b.output,
      render: (value) => `$${value?.toFixed(4) || '0.0000'}`,
    },
    {
      title: intl.formatMessage({ id: 'pricing.table.cacheRead' }),
      dataIndex: 'cacheRead',
      key: 'cacheRead',
      width: 110,
      sorter: (a, b) => (a.cacheRead || 0) - (b.cacheRead || 0),
      render: (value) => value != null ? `$${value.toFixed(4)}` : '-',
    },
    {
      title: intl.formatMessage({ id: 'pricing.table.cacheWrite' }),
      dataIndex: 'cacheWrite',
      key: 'cacheWrite',
      width: 110,
      sorter: (a, b) => (a.cacheWrite || 0) - (b.cacheWrite || 0),
      render: (value) => value != null ? `$${value.toFixed(4)}` : '-',
    },
    {
      title: intl.formatMessage({ id: 'pricing.table.custom' }),
      key: 'isCustom',
      width: 80,
      render: (_, record) => {
        const isCustom = customModels.includes(record.model);
        return isCustom ? (
          <Tag color="green">{intl.formatMessage({ id: 'pricing.table.customYes' })}</Tag>
        ) : (
          <Tag>{intl.formatMessage({ id: 'pricing.table.customNo' })}</Tag>
        );
      },
    },
    {
      title: intl.formatMessage({ id: 'pricing.table.actions' }),
      key: 'actions',
      width: 120,
      render: (_, record) => (
        <Space size="small">
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record.model)}
          />
          {customModels.includes(record.model) && (
            <Popconfirm
              title={intl.formatMessage({ id: 'pricing.confirm.deleteTitle' })}
              onConfirm={() => handleDelete(record.model)}
              okText={intl.formatMessage({ id: 'common.yes' })}
              cancelText={intl.formatMessage({ id: 'common.cancel' })}
            >
              <Button type="link" size="small" danger icon={<DeleteOutlined />} loading={deletingModel === record.model} />
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  const dataSource = sortedModels.map(([model, pricing]) => ({
    key: model,
    model,
    ...pricing,
  }));

  const tabItems = [
    {
      key: 'used',
      label: intl.formatMessage({ id: 'pricing.tab.used' }),
      children: null,
    },
    {
      key: 'domestic',
      label: intl.formatMessage({ id: 'pricing.tab.domestic' }),
      children: null,
    },
    {
      key: 'foreign',
      label: intl.formatMessage({ id: 'pricing.tab.foreign' }),
      children: null,
    },
    {
      key: 'all',
      label: intl.formatMessage({ id: 'pricing.tab.all' }),
      children: null,
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>
            {intl.formatMessage({ id: 'pricing.title' })}
          </Title>
          <Text type="secondary">
            {intl.formatMessage({ id: 'pricing.subtitle' })}
          </Text>
          {config?.lastUpdated && (
            <div style={{ fontSize: 12, color: token.colorTextSecondary, marginTop: 4 }}>
              {intl.formatMessage({ id: 'pricing.lastUpdated' })}: {new Date(config.lastUpdated).toLocaleString(intl.locale)}
            </div>
          )}
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => fetchData(true)} loading={refreshing}>
            {intl.formatMessage({ id: 'common.refresh' })}
          </Button>
          <Button icon={<PlusOutlined />} onClick={handleAdd}>
            {intl.formatMessage({ id: 'pricing.addModel' })}
          </Button>
          <Popconfirm
            title={intl.formatMessage({ id: 'pricing.confirm.resetTitle' })}
            description={intl.formatMessage({ id: 'pricing.confirm.resetDesc' })}
            onConfirm={handleReset}
            okText={intl.formatMessage({ id: 'common.yes' })}
            cancelText={intl.formatMessage({ id: 'common.cancel' })}
          >
            <Button danger loading={resetting}>{intl.formatMessage({ id: 'pricing.resetDefaults' })}</Button>
          </Popconfirm>
        </Space>
      </div>

      <Card style={{ marginBottom: 16 }}>
        <Space style={{ marginBottom: 12 }} wrap>
          <Input
            placeholder={intl.formatMessage({ id: 'pricing.searchPlaceholder' })}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 200 }}
            allowClear
          />
          <Space align="center">
            <Text>{intl.formatMessage({ id: 'pricing.customOnly' })}:</Text>
            <Switch checked={showCustomOnly} onChange={setShowCustomOnly} />
          </Space>
          <Text type="secondary">
            {sortedModels.length} / {Object.keys(prices).length} {intl.formatMessage({ id: 'pricing.modelsShown' })}
          </Text>
        </Space>
      </Card>

      <Card>
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={tabItems}
          size="small"
          style={{ marginBottom: 16 }}
        />
        <Table
          columns={columns}
          dataSource={dataSource}
          loading={loading}
          size="small"
          scroll={{ x: 1200 }}
          pagination={{
            pageSize: 20,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => intl.formatMessage({ id: 'pricing.pagination.total' }, { total }),
          }}
        />
      </Card>

      {/* Edit Modal */}
      <Modal
        title={intl.formatMessage({ id: 'pricing.modal.editTitle' }, { model: editingModel })}
        open={modalVisible}
        onOk={handleSave}
        okButtonProps={{ loading: savingEdit }}
        onCancel={() => setModalVisible(false)}
        width={450}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="input"
            label={intl.formatMessage({ id: 'pricing.form.inputLabel' })}
            rules={[{ required: true, message: intl.formatMessage({ id: 'pricing.form.inputRequired' }) }]}
          >
            <InputNumber
              min={0}
              step={0.01}
              precision={4}
              style={{ width: '100%' }}
              addonBefore="$"
            />
          </Form.Item>
          <Form.Item
            name="output"
            label={intl.formatMessage({ id: 'pricing.form.outputLabel' })}
            rules={[{ required: true, message: intl.formatMessage({ id: 'pricing.form.outputRequired' }) }]}
          >
            <InputNumber
              min={0}
              step={0.01}
              precision={4}
              style={{ width: '100%' }}
              addonBefore="$"
            />
          </Form.Item>
          <Form.Item
            name="cacheRead"
            label={intl.formatMessage({ id: 'pricing.form.cacheReadLabel' })}
          >
            <InputNumber
              min={0}
              step={0.01}
              precision={4}
              style={{ width: '100%' }}
              addonBefore="$"
              placeholder={intl.formatMessage({ id: 'pricing.form.optional' })}
            />
          </Form.Item>
          <Form.Item
            name="cacheWrite"
            label={intl.formatMessage({ id: 'pricing.form.cacheWriteLabel' })}
          >
            <InputNumber
              min={0}
              step={0.01}
              precision={4}
              style={{ width: '100%' }}
              addonBefore="$"
              placeholder={intl.formatMessage({ id: 'pricing.form.optional' })}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* Add Model Modal */}
      <Modal
        title={intl.formatMessage({ id: 'pricing.modal.addTitle' })}
        open={addModalVisible}
        onOk={handleAddSubmit}
        okButtonProps={{ loading: savingAdd }}
        onCancel={() => setAddModalVisible(false)}
        width={450}
      >
        <Form form={addForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="modelName"
            label={intl.formatMessage({ id: 'pricing.form.modelNameLabel' })}
            rules={[{ required: true, message: intl.formatMessage({ id: 'pricing.form.modelNameRequired' }) }]}
            extra={intl.formatMessage({ id: 'pricing.form.modelNameExtra' })}
          >
            <Input placeholder={intl.formatMessage({ id: 'pricing.form.modelNamePlaceholder' })} />
          </Form.Item>
          <Form.Item
            name="input"
            label={intl.formatMessage({ id: 'pricing.form.inputLabel' })}
            rules={[{ required: true, message: intl.formatMessage({ id: 'pricing.form.inputRequired' }) }]}
          >
            <InputNumber
              min={0}
              step={0.01}
              precision={4}
              style={{ width: '100%' }}
              addonBefore="$"
            />
          </Form.Item>
          <Form.Item
            name="output"
            label={intl.formatMessage({ id: 'pricing.form.outputLabel' })}
            rules={[{ required: true, message: intl.formatMessage({ id: 'pricing.form.outputRequired' }) }]}
          >
            <InputNumber
              min={0}
              step={0.01}
              precision={4}
              style={{ width: '100%' }}
              addonBefore="$"
            />
          </Form.Item>
          <Form.Item
            name="cacheRead"
            label={intl.formatMessage({ id: 'pricing.form.cacheReadLabel' })}
          >
            <InputNumber
              min={0}
              step={0.01}
              precision={4}
              style={{ width: '100%' }}
              addonBefore="$"
              placeholder={intl.formatMessage({ id: 'pricing.form.optional' })}
            />
          </Form.Item>
          <Form.Item
            name="cacheWrite"
            label={intl.formatMessage({ id: 'pricing.form.cacheWriteLabel' })}
          >
            <InputNumber
              min={0}
              step={0.01}
              precision={4}
              style={{ width: '100%' }}
              addonBefore="$"
              placeholder={intl.formatMessage({ id: 'pricing.form.optional' })}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
