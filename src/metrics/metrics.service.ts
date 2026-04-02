import { Injectable } from '@nestjs/common';

export interface LatencyMetrics {
  p50: number;
  p95: number;
  p99: number;
  count: number;
}

export interface TokenSummary {
  totalInput: number;
  totalOutput: number;
  totalTokens: number;
  activeInput: number;
  activeOutput: number;
  activeTokens: number;
  archivedInput: number;
  archivedOutput: number;
  archivedTokens: number;
  nearLimitCount: number;
  limitReachedCount: number;
  sessionCount: number;
}

@Injectable()
export class MetricsService {
  async getLatencyMetrics(
    timeRangeMs: number = 3600000,
  ): Promise<LatencyMetrics> {
    return { p50: 0, p95: 0, p99: 0, count: 0 };
  }

  async getTokenSummary(): Promise<TokenSummary> {
    // TODO: 从 OpenClawService 获取真实的 token 统计
    return {
      totalInput: 0,
      totalOutput: 0,
      totalTokens: 0,
      activeInput: 0,
      activeOutput: 0,
      activeTokens: 0,
      archivedInput: 0,
      archivedOutput: 0,
      archivedTokens: 0,
      nearLimitCount: 0,
      limitReachedCount: 0,
      sessionCount: 0,
    };
  }
}
