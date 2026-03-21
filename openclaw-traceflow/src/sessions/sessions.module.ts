import { Module } from '@nestjs/common';
import { SessionsController } from './sessions.controller';
import { SessionsService } from './sessions.service';
import { TokenMonitorService } from './token-monitor.service';
import { TokenMonitorController } from './token-monitor.controller';
import { OpenClawModule } from '../openclaw/openclaw.module';
import { MetricsModule } from '../metrics/metrics.module';

@Module({
  imports: [OpenClawModule, MetricsModule],
  // TokenMonitorController 必须在 SessionsController 之前，否则 /token-usage 会被 :id 匹配
  controllers: [TokenMonitorController, SessionsController],
  providers: [SessionsService, TokenMonitorService],
  exports: [SessionsService, TokenMonitorService],
})
export class SessionsModule {}
