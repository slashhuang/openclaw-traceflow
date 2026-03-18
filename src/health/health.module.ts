import { Module } from '@nestjs/common';
import { HealthController, StatusController } from './health.controller';
import { HealthService } from './health.service';
import { SkillsModule } from '../skills/skills.module';

@Module({
  imports: [SkillsModule],
  controllers: [HealthController, StatusController],
  providers: [HealthService],
  exports: [HealthService],
})
export class HealthModule {}
