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
        await this.metricsService.refreshToolStatsSnapshot();
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

        // 采集 /new 重置前的归档 token（.reset. 文件）
        const archived = await this.openclawService.getArchivedTokenUsageFromResetFiles();
        for (const a of archived) {
          const id = `archived-${a.sessionId}-${a.resetTimestamp}`;
          const timestamp = this.parseResetTimestamp(a.resetTimestamp);
          const sessionKey = this.metricsService.getSessionKeyForSessionId(a.sessionId) || a.sessionId;
          await this.metricsService.recordTokenUsage({
            id,
            timestamp,
            sessionKey,
            sessionId: a.sessionId,
            inputTokens: a.inputTokens,
            outputTokens: a.outputTokens,
            totalTokens: a.totalTokens,
          });
        }

        console.log(`Token usage collected for ${sessions.length} sessions, ${archived.length} archived`);
        await this.metricsService.flushDatabase();
      } catch (error) {
        console.error('Failed to collect token usage:', error);
      }
    };

    // 立即执行一次
    collect();
    // 每 30 秒采集一次
    setInterval(collect, 30000);
  }

  private parseResetTimestamp(ts: string): number {
    try {
      // 格式如 2026-03-19T05-07-54.210Z，时间部分用 - 分隔，需转为 :
      const normalized = ts.replace(/T(\d{2})-(\d{2})-(\d{2})/, 'T$1:$2:$3');
      const parsed = new Date(normalized).getTime();
      return Number.isNaN(parsed) ? Date.now() : parsed;
    } catch {
      return Date.now();
    }
  }
}
