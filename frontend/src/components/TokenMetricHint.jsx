import React from 'react';
import { InfoCircleOutlined } from '@ant-design/icons';
import { Popover, Typography, theme } from 'antd';

/**
 * Token 数字旁说明：hover / 点击展开（数据源、totalTokensFresh、0 与非零均可能不准）
 * @param {object} props
 * @param {import('react-intl').IntlShape} props.intl
 * @param {number|null|undefined} props.value — undefined 表示「通用说明」（如列标题），不强调 0
 */
export default function TokenMetricHint({ intl, value }) {
  const { token } = theme.useToken();

  let mode = 'generic';
  if (value !== undefined) {
    if (value === 0 || value == null || Number.isNaN(value)) {
      mode = 'zeroLike';
    } else {
      mode = 'positive';
    }
  }

  const title = intl.formatMessage({ id: 'tokenMetricHint.popoverTitle' });
  const body = intl.formatMessage({ id: 'metrics.tokenUsageSourceNote' });

  let extra = null;
  if (mode === 'zeroLike') {
    extra = (
      <Typography.Paragraph style={{ marginBottom: 0, fontSize: 12 }} type="warning">
        {intl.formatMessage({ id: 'tokenMetricHint.zeroExtra' })}
      </Typography.Paragraph>
    );
  } else if (mode === 'positive') {
    extra = (
      <Typography.Paragraph style={{ marginBottom: 0, fontSize: 12 }} type="secondary">
        {intl.formatMessage({ id: 'tokenMetricHint.nonZeroAccuracy' })}
      </Typography.Paragraph>
    );
  } else {
    extra = (
      <Typography.Paragraph style={{ marginBottom: 0, fontSize: 12 }} type="secondary">
        {intl.formatMessage({ id: 'tokenMetricHint.genericContext' })}
      </Typography.Paragraph>
    );
  }

  const iconColor =
    mode === 'zeroLike' ? token.colorWarning : token.colorTextSecondary;

  return (
    <Popover
      title={title}
      content={
        <div style={{ maxWidth: 380 }}>
          <Typography.Paragraph style={{ marginBottom: 8, fontSize: 12, whiteSpace: 'pre-line' }}>
            {body}
          </Typography.Paragraph>
          {extra}
        </div>
      }
      trigger={['hover', 'click']}
      overlayStyle={{ maxWidth: 400 }}
    >
      <InfoCircleOutlined
        className="token-metric-hint-icon"
        style={{
          fontSize: 14,
          color: iconColor,
          cursor: 'pointer',
          verticalAlign: 'middle',
          flexShrink: 0,
        }}
        onClick={(e) => e.stopPropagation()}
      />
    </Popover>
  );
}
