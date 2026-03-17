import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthModule } from './health/health.module';
import { SessionsModule } from './sessions/sessions.module';
import { LogsModule } from './logs/logs.module';
import { MetricsModule } from './metrics/metrics.module';
import { ActionsModule } from './actions/actions.module';

@Module({
  imports: [
    HealthModule,
    SessionsModule,
    LogsModule,
    MetricsModule,
    ActionsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
