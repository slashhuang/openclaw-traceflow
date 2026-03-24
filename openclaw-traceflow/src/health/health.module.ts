import { Module } from '@nestjs/common';
import { HealthController, StatusController } from './health.controller';
import { HealthService } from './health.service';

@Module({
  controllers: [HealthController, StatusController],
  providers: [HealthService],
  exports: [HealthService],
})
export class HealthModule {}
