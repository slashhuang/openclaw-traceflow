import { Module } from '@nestjs/common';
import { OnboardingStorageService } from './onboarding-storage.service';
import { ConfigMigrationService } from './config-migration.service';

/**
 * OnBoarding 模块
 *
 * 提供配置存储、迁移等服务
 * 对应 PRD §3.1.1
 */
@Module({
  providers: [OnboardingStorageService, ConfigMigrationService],
  exports: [OnboardingStorageService, ConfigMigrationService],
})
export class OnboardingModule {}
