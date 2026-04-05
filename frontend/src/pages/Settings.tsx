import React, { useState } from 'react';
import { Tabs } from 'antd';
import PathConfigSettings from './PathConfigSettings';
import ImConfigSettings from './ImConfigSettings';
import { useIntl } from 'react-intl';

/**
 * 设置页面 - 整合所有设置项
 * - 路径配置（基石）
 * - IM 推送配置（新功能）
 */
const Settings: React.FC = () => {
  const intl = useIntl();
  const [activeTab, setActiveTab] = useState('paths');

  const items = [
    {
      key: 'paths',
      label: intl.formatMessage({ id: 'settings.paths', defaultMessage: '路径配置' }),
      children: <PathConfigSettings />,
    },
    {
      key: 'im',
      label: intl.formatMessage({ id: 'settings.im', defaultMessage: 'IM 推送配置' }),
      children: <ImConfigSettings />,
    },
  ];

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={items}
        size="large"
      />
    </div>
  );
};

export default Settings;
