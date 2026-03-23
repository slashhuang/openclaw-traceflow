import React from 'react';
import { Tooltip, theme } from 'antd';
import { InfoCircleOutlined } from '@ant-design/icons';

/**
 * 区块标题旁 ℹ：悬停查看该区块统计口径（与仪表盘一致）
 * @param {number} [overlayMaxWidth=440] 长说明时可加大，避免换行过碎
 */
export default function SectionScopeHint({ intl, messageId, overlayMaxWidth = 440 }) {
  const { token } = theme.useToken();
  return (
    <Tooltip
      title={intl.formatMessage({ id: messageId })}
      overlayInnerStyle={{ maxWidth: overlayMaxWidth, whiteSpace: 'pre-line', padding: '12px 16px' }}
    >
      <InfoCircleOutlined
        style={{ color: token.colorTextSecondary, fontSize: 14, cursor: 'help', flexShrink: 0 }}
        aria-label={intl.formatMessage({ id: 'common.statsScopeHint' })}
      />
    </Tooltip>
  );
}
