import { Injectable, Logger } from '@nestjs/common';
import {
  loadModelPricing,
  saveModelPricing,
  getCurrentPricingConfig,
  type ModelPricingConfig,
  type ModelPricing,
} from './model-pricing.config';

@Injectable()
export class PricingConfigService {
  private readonly logger = new Logger(PricingConfigService.name);

  /**
   * 获取当前价格配置
   */
  getConfig(): ModelPricingConfig {
    return getCurrentPricingConfig();
  }

  /**
   * 获取所有模型价格
   */
  getAllPrices(): Record<string, ModelPricing> {
    return loadModelPricing();
  }

  /**
   * 更新价格配置
   */
  updateConfig(config: ModelPricingConfig): boolean {
    const success = saveModelPricing(config);
    if (success) {
      this.logger.log('Model pricing config updated');
    } else {
      this.logger.error('Failed to update model pricing config');
    }
    return success;
  }

  /**
   * 更新单个模型价格
   */
  updateModelPrice(modelName: string, pricing: ModelPricing): boolean {
    const config = getCurrentPricingConfig();
    config.models[modelName] = pricing;
    config.lastUpdated = Date.now();
    return this.updateConfig(config);
  }

  /**
   * 删除模型价格
   */
  removeModelPrice(modelName: string): boolean {
    const config = getCurrentPricingConfig();
    delete config.models[modelName];
    config.lastUpdated = Date.now();
    return this.updateConfig(config);
  }

  /**
   * 重置为默认配置
   */
  resetToDefaults(): boolean {
    const config: ModelPricingConfig = {
      models: {},
      lastUpdated: Date.now(),
      version: 1,
    };
    return saveModelPricing(config);
  }
}
