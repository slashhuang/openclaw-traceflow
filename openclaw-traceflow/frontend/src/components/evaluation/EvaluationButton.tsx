/**
 * OpenClaw Audit System - 评估按钮组件
 *
 * 仅提交异步任务（202），不轮询、不长等；由页面在切回标签或手动刷新时拉取结果。
 *
 * @see PRD: docs/PRD-openclaw-audit-system.md Section 11.3.1
 */

import React, { useState } from 'react';
import { Button, message, Popconfirm } from 'antd';
import { ThunderboltOutlined } from '@ant-design/icons';
import { useIntl } from 'react-intl';

interface EvaluationButtonProps {
  resourceId: string;
  resourceType: 'session' | 'prompt';
  /**
   * session：会话详情「会话质量」评估；prompt：System Prompt 页「工作区规范」评估（文案不同）。
   */
  evaluationUi?: 'session' | 'prompt';
  /** 默认 large；System Prompt 页可设为 middle 以节省纵向空间 */
  buttonSize?: 'large' | 'middle' | 'small';
  /** POST 成功接受任务后回调（用于标记「待拉取结果」） */
  onEvaluationSubmitted?: () => void;
}

export const EvaluationButton: React.FC<EvaluationButtonProps> = ({
  resourceId,
  resourceType,
  evaluationUi = 'prompt',
  buttonSize = 'large',
  onEvaluationSubmitted,
}) => {
  const intl = useIntl();
  const [submitting, setSubmitting] = useState(false);

  const handleEvaluate = async () => {
    setSubmitting(true);
    try {
      const idSeg = encodeURIComponent(resourceId);
      const response = await fetch(`/api/${resourceType}s/${idSeg}/evaluations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: getCurrentUserId() }),
      });

      const data = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
      };

      if (!response.ok || !data.success) {
        throw new Error(
          data.error ||
            intl.formatMessage({
              id:
                evaluationUi === 'session'
                  ? 'sessionEvaluation.submitFailed'
                  : 'systemPrompt.evaluationSubmitFailed',
            }),
        );
      }

      message.success({
        content: intl.formatMessage({
          id:
            evaluationUi === 'session'
              ? 'sessionEvaluation.submittedAsync'
              : 'systemPrompt.evaluationSubmittedAsync',
        }),
        duration: 8,
        key:
          evaluationUi === 'session'
            ? 'session-eval-submitted-async'
            : 'prompt-eval-submitted-async',
      });
      onEvaluationSubmitted?.();
    } catch (error) {
      message.error((error as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Popconfirm
      title={intl.formatMessage({
        id:
          evaluationUi === 'session'
            ? 'sessionEvaluation.confirmTitle'
            : 'systemPrompt.evaluationConfirmTitle',
      })}
      description={intl.formatMessage({
        id:
          evaluationUi === 'session'
            ? 'sessionEvaluation.confirmDesc'
            : 'systemPrompt.evaluationConfirmDesc',
      })}
      onConfirm={handleEvaluate}
      okText={intl.formatMessage({ id: 'common.yes' })}
      cancelText={intl.formatMessage({ id: 'common.cancel' })}
      disabled={submitting}
    >
      <Button
        type="primary"
        size={buttonSize}
        icon={!submitting ? <ThunderboltOutlined /> : undefined}
        disabled={submitting}
        loading={submitting}
      >
        {submitting
          ? intl.formatMessage({
              id:
                evaluationUi === 'session'
                  ? 'sessionEvaluation.buttonSubmitting'
                  : 'systemPrompt.evaluationButtonSubmitting',
            })
          : intl.formatMessage({
              id:
                evaluationUi === 'session'
                  ? 'sessionEvaluation.buttonRun'
                  : 'systemPrompt.evaluationButtonRun',
            })}
      </Button>
    </Popconfirm>
  );
};

function getCurrentUserId(): string {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('userId') || 'anonymous';
  }
  return 'anonymous';
}
