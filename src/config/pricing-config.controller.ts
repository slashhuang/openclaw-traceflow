import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { PricingConfigService } from './pricing-config.service';
import type { ModelPricingConfig, ModelPricing } from './model-pricing.config';

@Controller('api/pricing')
export class PricingConfigController {
  constructor(private readonly pricingService: PricingConfigService) {}

  /**
   * 获取所有模型价格配置
   */
  @Get()
  getAllPrices(): Record<string, ModelPricing> {
    return this.pricingService.getAllPrices();
  }

  /**
   * 获取当前配置（含元数据）
   */
  @Get('config')
  getConfig(): ModelPricingConfig {
    return this.pricingService.getConfig();
  }

  /**
   * 更新价格配置
   */
  @Post('config')
  updateConfig(@Body() config: ModelPricingConfig): { success: boolean } {
    const success = this.pricingService.updateConfig(config);
    return { success };
  }

  /**
   * 更新单个模型价格
   */
  @Post('model/:name')
  updateModelPrice(
    @Param('name') modelName: string,
    @Body() pricing: ModelPricing,
  ): { success: boolean } {
    const success = this.pricingService.updateModelPrice(modelName, pricing);
    return { success };
  }

  /**
   * 删除模型价格
   */
  @Delete('model/:name')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeModelPrice(@Param('name') modelName: string): void {
    this.pricingService.removeModelPrice(modelName);
  }

  /**
   * 重置为默认配置
   */
  @Post('reset')
  resetToDefaults(): { success: boolean } {
    const success = this.pricingService.resetToDefaults();
    return { success };
  }
}
