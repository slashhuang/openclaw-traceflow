import React from 'react';
import { Alert, Button, Space } from 'antd';
import { RocketOutlined, CheckCircleOutlined } from '@ant-design/icons';

interface SelfImprovementHintProps {
  enabled: boolean;
  onEnable: () => void;
}

/**
 * Self-Improvement Skill 提示组件
 * 引导用户开启 AI 自我反思与优化能力
 */
export const SelfImprovementHint: React.FC<SelfImprovementHintProps> = ({
  enabled,
  onEnable,
}) => {
  if (enabled) {
    return (
      <Alert
        type="success"
        showIcon
        icon={<CheckCircleOutlined />}
        message="🔄 Self-Improvement 已启用"
        description="AI 将自动反思并生成优化建议，Wakeup 时会主动告知"
        style={{ marginBottom: 16 }}
      />
    );
  }

  return (
    <Alert
      type="info"
      showIcon
      icon={<RocketOutlined />}
      message="🔄 开启 AI 自我优化能力"
      description={
        <Space direction="vertical" style={{ width: '100%' }}>
          <span>
            启用 Self-Improvement Skill 后，AI 将：
          </span>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            <li>自动分析会话质量，识别改进机会</li>
            <li>Wakeup 时主动告知优化建议</li>
            <li>自动生成配置/代码优化 PR</li>
          </ul>
        </Space>
      }
      action={
        <Button type="primary" size="small" onClick={onEnable}>
          立即启用
        </Button>
      }
      style={{ marginBottom: 16 }}
    />
  );
};

export default SelfImprovementHint;
