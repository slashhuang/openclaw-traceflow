/**
 * OpenClaw Audit System - 评估结果展示组件
 * 
 * @see PRD: docs/PRD-openclaw-audit-system.md Section 11.3.2
 */

import React from 'react';
import { useIntl } from 'react-intl';
import { Card, Progress, Typography, Tag, Space, Divider } from 'antd';
import {
  CheckCircleOutlined,
  WarningOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons';

const { Text, Paragraph } = Typography;

interface EvaluationResultProps {
  evaluation: {
    metrics: {
      effectiveness: {
        score: number;
        taskCompleted: boolean;
        hasError: boolean;
        userSatisfaction: string;
        consistency: boolean;
      };
      efficiency: {
        score: number;
        avgLatencyMs: number;
        totalInputTokens: number;
        totalOutputTokens: number;
        tokenEfficiencyRatio: number;
        turnCount: number;
        retryCount: number;
      };
      overall: {
        score: number;
        grade: string;
      };
    };
    aiInsights: {
      summary: string;
      strengths: string[];
      improvements: string[];
      rootCause?: string;
    };
    evaluatedAt: string;
    evaluatorModel: string;
    metadata: {
      promptVersion: string;
      promptTemplateSource?: 'builtin' | 'override';
    };
  };
}

export const EvaluationResult: React.FC<EvaluationResultProps> = ({
  evaluation,
}) => {
  const intl = useIntl();
  const getGradeColor = (grade: string) => {
    switch (grade) {
      case 'S':
        return '#107c10'; // 绿色
      case 'A':
        return '#107c10';
      case 'B':
        return '#ffb900'; // 黄色
      case 'C':
        return '#ffb900';
      case 'D':
        return '#d13438'; // 红色
      default:
        return '#605e5c';
    }
  };

  const getStatusIcon = (score: number) => {
    if (score >= 80)
      return <CheckCircleOutlined style={{ color: '#107c10' }} />;
    if (score >= 60)
      return <WarningOutlined style={{ color: '#ffb900' }} />;
    return <CloseCircleOutlined style={{ color: '#d13438' }} />;
  };

  return (
    <Card styles={{ body: { paddingBlock: 16 } }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '16px 20px',
          flexWrap: 'wrap',
        }}
      >
        {/* 综合评分 */}
        <div style={{ textAlign: 'center', minWidth: '88px', flexShrink: 0 }}>
          <div
            style={{
              fontSize: 'clamp(32px, 8vw, 48px)',
              fontWeight: 'bold',
              lineHeight: 1.1,
              color: getGradeColor(evaluation.metrics.overall.grade),
            }}
          >
            {evaluation.metrics.overall.score}
          </div>
          <div
            style={{
              fontSize: 'clamp(16px, 4vw, 24px)',
              color: getGradeColor(evaluation.metrics.overall.grade),
            }}
          >
            等级 {evaluation.metrics.overall.grade}
          </div>
        </div>

        <Divider type="vertical" style={{ height: 'auto', minHeight: 88, alignSelf: 'stretch' }} />

        {/* 详细指标 */}
        <div style={{ flex: '1 1 200px', minWidth: 0 }}>
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <div>
              <Space>
                {getStatusIcon(evaluation.metrics.effectiveness.score)}
                <Text strong>效果分数</Text>
              </Space>
              <Progress
                percent={evaluation.metrics.effectiveness.score}
                strokeColor={
                  evaluation.metrics.effectiveness.score >= 80
                    ? '#107c10'
                    : '#ffb900'
                }
                showInfo={false}
                size="small"
              />
              <Text type="secondary">
                {evaluation.metrics.effectiveness.score} / 100
              </Text>
            </div>

            <div>
              <Space>
                {getStatusIcon(evaluation.metrics.efficiency.score)}
                <Text strong>效率分数</Text>
              </Space>
              <Progress
                percent={evaluation.metrics.efficiency.score}
                strokeColor={
                  evaluation.metrics.efficiency.score >= 80
                    ? '#107c10'
                    : '#ffb900'
                }
                showInfo={false}
                size="small"
              />
              <Text type="secondary">
                {evaluation.metrics.efficiency.score} / 100
              </Text>
            </div>
          </Space>
        </div>
      </div>

      {/* AI 洞察 */}
      <Divider />
      <div style={{ marginTop: '20px' }}>
        <Paragraph>
          <Text strong>💡 AI 洞察</Text>
        </Paragraph>
        <Paragraph>{evaluation.aiInsights.summary}</Paragraph>

        {evaluation.aiInsights.strengths.length > 0 && (
          <>
            <Paragraph>
              <Text strong>✅ 优势</Text>
            </Paragraph>
            <ul>
              {evaluation.aiInsights.strengths.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </>
        )}

        {evaluation.aiInsights.improvements.length > 0 && (
          <>
            <Paragraph>
              <Text strong>💪 改进建议</Text>
            </Paragraph>
            <ul>
              {evaluation.aiInsights.improvements.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </>
        )}

        {evaluation.aiInsights.rootCause && (
          <>
            <Paragraph>
              <Text strong type="danger">
                ⚠️ 根因分析
              </Text>
            </Paragraph>
            <Paragraph type="danger">{evaluation.aiInsights.rootCause}</Paragraph>
          </>
        )}
      </div>

      {/* 评估元数据：窄栏下逐行展示，避免竖线分列导致标签被拆字 */}
      <Divider style={{ margin: '16px 0' }} />
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          fontSize: 12,
        }}
      >
        <div style={{ lineHeight: 1.55 }}>
          <Text type="secondary">评估时间：</Text>
          <Text style={{ wordBreak: 'break-word' }}>
            {new Date(evaluation.evaluatedAt).toLocaleString()}
          </Text>
        </div>
        <div style={{ lineHeight: 1.55 }}>
          <Text type="secondary">评估模型：</Text>
          <Text style={{ wordBreak: 'break-all' }}>{evaluation.evaluatorModel}</Text>
        </div>
        <div style={{ lineHeight: 1.55 }}>
          <Text type="secondary">Prompt 版本：</Text>
          <Text style={{ wordBreak: 'break-word' }}>{evaluation.metadata.promptVersion}</Text>
        </div>
        {evaluation.metadata.promptTemplateSource && (
          <div style={{ lineHeight: 1.55 }}>
            <Text style={{ wordBreak: 'break-word' }}>
              {evaluation.metadata.promptTemplateSource === 'override'
                ? intl.formatMessage({ id: 'evaluationResult.promptSourceOverride' })
                : intl.formatMessage({ id: 'evaluationResult.promptSourceBuiltin' })}
            </Text>
          </div>
        )}
      </div>
    </Card>
  );
};
