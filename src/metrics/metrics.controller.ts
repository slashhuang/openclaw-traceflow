import { Controller, Get, Query } from '@nestjs/common';
import { MetricsService, LatencyMetrics } from './metrics.service';

@Controller('api/metrics')
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get('latency')
  async getLatencyMetrics(
    @Query('timeRangeMs') timeRangeMs?: number,
  ): Promise<LatencyMetrics> {
    return this.metricsService.getLatencyMetrics(
      timeRangeMs ? parseInt(timeRangeMs.toString(), 10) : 3600000,
    );
  }
}
