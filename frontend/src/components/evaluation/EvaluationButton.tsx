/**
 * OpenClaw Audit System - 评估按钮组件
 * 
 * @see PRD: docs/PRD-openclaw-audit-system.md Section 11.3.1
 */

import React, { useState, useEffect } from 'react';
import { Button, message, Spin } from 'antd';
import { ThunderboltOutlined } from '@ant-design/icons';

interface EvaluationButtonProps {
  resourceId: string;
  resourceType: 'session' | 'prompt';
  onEvaluationComplete?: (evaluationId: string) => void;
}

export const EvaluationButton: React.FC<EvaluationButtonProps> = ({
  resourceId,
  resourceType,
  onEvaluationComplete,
}) => {
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null);

  const handleEvaluate = async () => {
    setIsEvaluating(true);

    try {
      // 1. 提交评估任务
      const response = await fetch(
        `/api/${resourceType}s/${resourceId}/evaluations`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: getCurrentUserId() }),
        },
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || '评估提交失败');
      }

      message.info('评估任务已提交，处理中...');

      // 2. 轮询任务状态
      const pollInterval = setInterval(async () => {
        try {
          const statusResponse = await fetch(
            `/api/${resourceType}s/${resourceId}/evaluations/latest`,
          );
          const statusData = await statusResponse.json();

          if (statusData.success && statusData.data) {
            const { status, evaluationId } = statusData.data;

            if (status === 'completed') {
              clearInterval(pollInterval);
              setIsEvaluating(false);
              message.success('评估完成！');
              if (onEvaluationComplete) {
                onEvaluationComplete(evaluationId);
              }
            } else if (status === 'failed') {
              clearInterval(pollInterval);
              setIsEvaluating(false);
              message.error('评估失败：' + (statusData.data.error || '未知错误'));
            }
          }
        } catch (err) {
          console.error('轮询评估状态失败:', err);
        }
      }, 1000);

      setPollingInterval(pollInterval);
    } catch (error) {
      setIsEvaluating(false);
      message.error('评估提交失败：' + (error as Error).message);
    }
  };

  // 清理轮询
  useEffect(() => {
    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, [pollingInterval]);

  return (
    <Button
      type="primary"
      icon={isEvaluating ? <Spin size="small" /> : <ThunderboltOutlined />}
      onClick={handleEvaluate}
      disabled={isEvaluating}
      loading={isEvaluating}
    >
      {isEvaluating ? '评估中...' : '🔄 评估'}
    </Button>
  );
};

// 获取当前用户 ID（从 localStorage 或默认值）
function getCurrentUserId(): string {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('userId') || 'anonymous';
  }
  return 'anonymous';
}
