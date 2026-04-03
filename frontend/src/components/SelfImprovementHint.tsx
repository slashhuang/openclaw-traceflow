import React from 'react';
import { Alert, Button } from 'antd';
import { RocketOutlined, CheckCircleOutlined } from '@ant-design/icons';

interface SelfImprovementHintProps {
  enabled: boolean;
  onEnable: () => void;
}

/** Self-Improvement Skill 开关旁的简要提示 */
export const SelfImprovementHint: React.FC<SelfImprovementHintProps> = ({ enabled, onEnable }) => {
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
