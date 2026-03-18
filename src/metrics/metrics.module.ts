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
    const collect = async () => {
      try {
        const sessions = await this.openclawService.listSessions();
        for (const session of sessions) {
          if (session.tokenUsage) {
            await this.metricsService.recordTokenUsage({
              id: `token-${session.sessionId}-${Date.now()}`,
              timestamp: Date.now(),
              sessionKey: session.sessionKey,
              sessionId: session.sessionId,
              inputTokens: session.tokenUsage.input || 0,
              outputTokens: session.tokenUsage.output || 0,
              totalTokens: session.tokenUsage.total || 0,
              tokenLimit: session.tokenUsage.limit,
              utilization: session.tokenUsage.utilization,
            });
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
