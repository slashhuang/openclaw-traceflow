import { Module, OnModuleInit } from '@nestjs/common';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';
import { OpenClawModule } from '../openclaw/openclaw.module';
import { OpenClawService } from '../openclaw/openclaw.service';

@Module({
  controllers: [MetricsController],
  providers: [MetricsService],
  exports: [MetricsService],
  imports: [OpenClawModule],
})
export class MetricsModule implements OnModuleInit {
  constructor(
    private readonly metricsService: MetricsService,
    private readonly openclawService: OpenClawService,
  ) {}

  async onModuleInit() {
    // 启动后台任务，每 30 秒采集一次 token 用量
    this.startTokenCollection();
  }

  private startTokenCollection() {
    const NEAR_LIMIT_THRESHOLD = 80; // 使用率 ≥ 80% 记预警
    const collect = async () => {
      try {
        const sessions = await this.openclawService.listSessions();
        const now = Date.now();
        for (const session of sessions) {
          if (session.tokenUsage) {
            const utilization = session.tokenUsage.utilization ?? (session.tokenUsage.limit && session.tokenUsage.total
              ? Math.round((session.tokenUsage.total / session.tokenUsage.limit) * 100)
              : 0);
            await this.metricsService.recordTokenUsage({
              id: `token-${session.sessionId}-${now}`,
              timestamp: now,
              sessionKey: session.sessionKey,
              sessionId: session.sessionId,
              inputTokens: session.tokenUsage.input || 0,
              outputTokens: session.tokenUsage.output || 0,
              totalTokens: session.tokenUsage.total || 0,
              tokenLimit: session.tokenUsage.limit,
              utilization,
            });
            if (utilization >= 100) {
              await this.metricsService.recordTokenEvent({
                id: `event-limit-${session.sessionId}-${now}`,
                timestamp: now,
                sessionKey: session.sessionKey,
                sessionId: session.sessionId,
                eventType: 'token:limit_reached',
                threshold: 100,
                currentUsage: session.tokenUsage.total,
                limit: session.tokenUsage.limit,
              });
            } else if (utilization >= NEAR_LIMIT_THRESHOLD) {
              await this.metricsService.recordTokenEvent({
                id: `event-near-${session.sessionId}-${now}`,
                timestamp: now,
                sessionKey: session.sessionKey,
                sessionId: session.sessionId,
                eventType: 'token:near_limit',
                threshold: NEAR_LIMIT_THRESHOLD,
                currentUsage: session.tokenUsage.total,
                limit: session.tokenUsage.limit,
              });
            }
          }
        }
        console.log(`Token usage collected for ${sessions.length} sessions`);
      } catch (error) {
        console.error('Failed to collect token usage:', error);
      }
    };

    // 立即执行一次
    collect();
    // 每 30 秒采集一次
    setInterval(collect, 30000);
  }
}
