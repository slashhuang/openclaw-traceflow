import { Module } from '@nestjs/common';
import { PricingConfigController } from './pricing-config.controller';
import { PricingConfigService } from './pricing-config.service';

@Module({
  controllers: [PricingConfigController],
  providers: [PricingConfigService],
  exports: [PricingConfigService],
})
export class PricingConfigModule {}
