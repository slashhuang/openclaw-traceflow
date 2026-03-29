/**
 * OpenClaw Audit System - 评估结果展示组件
 * 
 * @see PRD: docs/PRD-openclaw-audit-system.md Section 11.3.2
 */

import React from 'react';
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
    };
  };
}

export const EvaluationResult: React.FC<EvaluationResultProps> = ({
  evaluation,
}) => {
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
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
        {/* 综合评分 */}
        <div style={{ textAlign: 'center', minWidth: '100px' }}>
          <div
            style={{
              fontSize: '48px',
              fontWeight: 'bold',
              color: getGradeColor(evaluation.metrics.overall.grade),
            }}
          >
            {evaluation.metrics.overall.score}
          </div>
          <div
            style={{
              fontSize: '24px',
              color: getGradeColor(evaluation.metrics.overall.grade),
            }}
          >
            等级 {evaluation.metrics.overall.grade}
          </div>
        </div>

        <Divider type="vertical" style={{ height: '100px' }} />

        {/* 详细指标 */}
        <div style={{ flex: 1 }}>
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

      {/* 评估元数据 */}
      <Divider />
      <div style={{ marginTop: '20px', fontSize: '12px', color: '#666' }}>
        <Space split={<Divider type="vertical" />}>
          <span>
            评估时间：{new Date(evaluation.evaluatedAt).toLocaleString()}
          </span>
          <span>评估模型：{evaluation.evaluatorModel}</span>
          <span>Prompt 版本：{evaluation.metadata.promptVersion}</span>
        </Space>
      </div>
    </Card>
  );
};
