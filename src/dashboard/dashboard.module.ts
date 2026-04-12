import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { OpenClawModule } from '../openclaw/openclaw.module';
import { SessionsModule } from '../sessions/sessions.module';
import { LogsModule } from '../logs/logs.module';
import { MetricsModule } from '../metrics/metrics.module';

@Module({
  imports: [OpenClawModule, SessionsModule, LogsModule, MetricsModule],
  controllers: [DashboardController],
})
export class DashboardModule {}
