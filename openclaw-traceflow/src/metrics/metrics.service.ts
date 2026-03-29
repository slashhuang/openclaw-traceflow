import { Injectable } from '@nestjs/common';

export interface LatencyMetrics {
  p50: number;
  p95: number;
  p99: number;
  count: number;
}

@Injectable()
export class MetricsService {
  async getLatencyMetrics(
    timeRangeMs: number = 3600000,
  ): Promise<LatencyMetrics> {
    return { p50: 0, p95: 0, p99: 0, count: 0 };
  }
}
