import { Module } from '@nestjs/common';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';
import { OpenClawModule } from '../openclaw/openclaw.module';

@Module({
  controllers: [MetricsController],
  providers: [MetricsService],
  exports: [MetricsService],
  imports: [OpenClawModule],
})
export class MetricsModule {}
