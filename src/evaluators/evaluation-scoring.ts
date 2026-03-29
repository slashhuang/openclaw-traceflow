import type { EvaluationGrade } from '../types/evaluation';
import type { LLMAnalysisResult } from './evaluation-llm-parse';

export function calculateEffectivenessScore(llmAnalysis: LLMAnalysisResult): number {
  const weights = {
    taskCompletion: 0.4,
    accuracy: 0.3,
    satisfaction: 0.2,
    consistency: 0.1,
  };

  const taskScore = llmAnalysis.effectiveness.taskCompleted ? 100 : 40;

  let accuracyScore: number;
  if (
    llmAnalysis.effectiveness.hasHallucination ||
    llmAnalysis.effectiveness.hasContradiction
  ) {
    accuracyScore = 40;
  } else {
    switch (llmAnalysis.effectiveness.accuracyLevel) {
      case 'high':
        accuracyScore = 100;
        break;
      case 'medium':
        accuracyScore = 70;
        break;
      case 'low':
        accuracyScore = 40;
        break;
      default:
        accuracyScore = 70;
    }
  }

  const satisfactionScores: Record<string, number> = {
    positive: 100,
    neutral: 70,
    negative: 30,
  };
  const satisfactionScore =
    satisfactionScores[llmAnalysis.effectiveness.userSatisfaction] ?? 70;

  const consistencyScore = llmAnalysis.effectiveness.isConsistent ? 100 : 40;

  const score =
    taskScore * weights.taskCompletion +
    accuracyScore * weights.accuracy +
    satisfactionScore * weights.satisfaction +
    consistencyScore * weights.consistency;

  return Math.round(score);
}

export function calculateEfficiencyScore(llmAnalysis: LLMAnalysisResult): number {
  const weights = {
    latency: 0.4,
    tokenEfficiency: 0.3,
    turnEfficiency: 0.2,
    retry: 0.1,
  };

  const score =
    llmAnalysis.efficiency.latencyScore * weights.latency +
    llmAnalysis.efficiency.tokenEfficiencyScore * weights.tokenEfficiency +
    llmAnalysis.efficiency.turnEfficiencyScore * weights.turnEfficiency +
    llmAnalysis.efficiency.retryScore * weights.retry;

  return Math.round(score);
}

export function calculateGrade(score: number): EvaluationGrade {
  if (score >= 90) return 'S';
  if (score >= 80) return 'A';
  if (score >= 70) return 'B';
  if (score >= 60) return 'C';
  return 'D';
}
