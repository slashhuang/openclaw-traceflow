import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from './config/config.module';
import { OnboardingModule } from './onboarding/onboarding.module';
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
import { StatesController } from './states/states.controller';
import { FileTreeService } from './common/file-tree.service';
import { WorkspaceController } from './workspace/workspace.controller';
import { AuditController } from './audit/audit.controller';
// IM Push 模块
import { ImModule } from './im/im.module';
// 设置模块
import { SettingsModule } from './settings/settings.module';
// Logger 模块
import { LoggerModule } from './logger/logger.module';

@Module({
  imports: [
    // ========== 核心模块（按依赖顺序）==========
    EventEmitterModule.forRoot({
      // 配置事件通配符支持
      wildcard: true,
      // 事件名称分隔符
      delimiter: '.',
      // 最大监听器数量
      maxListeners: 20,
      // 是否显示事件追踪日志
      verboseMemoryLeak: true,
    }),
    // Logger 模块（使用 winston，支持日志轮转和自动清理）
    LoggerModule.forRoot({
      dataDir: './data',
      maxFiles: '7d', // 保留 7 天的日志
      level: 'info', // 日志级别：error, warn, info, http, verbose, debug, silly
      enableConsole: true, // 是否输出到控制台
    }),
    OnboardingModule,
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
    // IM Push 相关（使用 Channel 插件架构）
    ImModule,
    // 设置模块
    SettingsModule,
  ],
  controllers: [
    AppController,
    EvaluationController,
    PromptEvaluationController,
    EvaluationPromptController,
    WorkspaceBootstrapEvaluationPromptController,
    StatesController,
    WorkspaceController,
    AuditController,
  ],
  providers: [AppService, EvaluationPromptConfigService, FileTreeService],
})
export class AppModule {}
