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
import { PricingConfigModule } from './config/pricing-config.module';
import { StorageModule } from './storage/storage.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { EvaluationController } from './evaluators/evaluation.controller';
import { PromptEvaluationController } from './evaluators/prompt-evaluation.controller';
import { EvaluationPromptController } from './evaluators/evaluation-prompt.controller';
import { WorkspaceBootstrapEvaluationPromptController } from './evaluators/workspace-bootstrap-evaluation-prompt.controller';
import { EvaluationPromptConfigService } from './evaluators/evaluation-prompt-config.service';

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
    PricingConfigModule,
    StorageModule,
    DashboardModule,
  ],
  controllers: [
    AppController,
    EvaluationController,
    PromptEvaluationController,
    EvaluationPromptController,
    WorkspaceBootstrapEvaluationPromptController,
  ],
  providers: [AppService, EvaluationPromptConfigService],
})
export class AppModule {}
