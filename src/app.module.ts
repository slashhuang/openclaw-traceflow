import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from './config/config.module';
import { OpenClawModule } from './openclaw/openclaw.module';
import { HealthModule } from './health/health.module';
import { SessionsModule } from './sessions/sessions.module';
import { LogsModule } from './logs/logs.module';
import { MetricsModule } from './metrics/metrics.module';
import { ActionsModule } from './actions/actions.module';
import { SetupModule } from './setup/setup.module';
import { SkillsModule } from './skills/skills.module';

@Module({
  imports: [
    ConfigModule,
    OpenClawModule,
    HealthModule,
    SessionsModule,
    LogsModule,
    MetricsModule,
    ActionsModule,
    SetupModule,
    SkillsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
