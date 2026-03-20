import * as fs from 'fs';
import * as path from 'path';

/** 模型价格配置（USD per million tokens） */
export interface ModelPricing {
  input: number;
  output: number;
  cacheRead?: number;
  cacheWrite?: number;
}

/**
 * 2026 年主流模型价格表（USD per million tokens）
 * 只保留最常用的中国/海外大模型
 *
 * 中国：通义千问、DeepSeek、Kimi
 * 海外：Anthropic Claude、OpenAI GPT、Google Gemini
 */
export const DEFAULT_MODEL_PRICING: Record<string, ModelPricing> = {
  // ========== Anthropic Claude 系列 ==========
  'claude-opus-4-6': { input: 15.0, output: 75.0, cacheRead: 1.875, cacheWrite: 18.75 },
  'claude-opus-4-5': { input: 15.0, output: 75.0, cacheRead: 1.875, cacheWrite: 18.75 },
  'claude-opus-4': { input: 15.0, output: 75.0, cacheRead: 1.875, cacheWrite: 18.75 },
  'claude-opus-3-5': { input: 15.0, output: 75.0, cacheRead: 1.875, cacheWrite: 18.75 },
  'claude-sonnet-4-6': { input: 3.0, output: 15.0, cacheRead: 0.3, cacheWrite: 3.75 },
  'claude-sonnet-4-5': { input: 3.0, output: 15.0, cacheRead: 0.3, cacheWrite: 3.75 },
  'claude-sonnet-4': { input: 3.0, output: 15.0, cacheRead: 0.3, cacheWrite: 3.75 },
  'claude-sonnet-3-7': { input: 3.0, output: 15.0, cacheRead: 0.3, cacheWrite: 3.75 },
  'claude-sonnet-3-5': { input: 3.0, output: 15.0, cacheRead: 0.3, cacheWrite: 3.75 },
  'claude-3-5-haiku-latest': { input: 0.8, output: 4.0, cacheRead: 0.08, cacheWrite: 1.0 },
  'claude-3-5-haiku-20241022': { input: 0.8, output: 4.0, cacheRead: 0.08, cacheWrite: 1.0 },
  'claude-3-haiku-20240307': { input: 0.25, output: 1.25, cacheRead: 0.025, cacheWrite: 0.125 },

  // ========== OpenAI GPT 系列 ==========
  'gpt-4o': { input: 2.5, output: 10.0, cacheRead: 0.25, cacheWrite: 2.5 },
  'gpt-4o-2024-11-20': { input: 2.5, output: 10.0, cacheRead: 0.25, cacheWrite: 2.5 },
  'gpt-4o-2024-08-06': { input: 2.5, output: 10.0, cacheRead: 0.25, cacheWrite: 2.5 },
  'gpt-4o-mini': { input: 0.15, output: 0.6, cacheRead: 0.075, cacheWrite: 0.3 },
  'gpt-4o-mini-2024-07-18': { input: 0.15, output: 0.6, cacheRead: 0.075, cacheWrite: 0.3 },
  'gpt-4.1': { input: 2.0, output: 8.0, cacheRead: 0.2, cacheWrite: 2.0 },
  'gpt-4.1-mini': { input: 0.4, output: 1.6, cacheRead: 0.2, cacheWrite: 0.8 },
  'gpt-4.1-nano': { input: 0.1, output: 0.4, cacheRead: 0.01, cacheWrite: 0.1 },
  'gpt-4-turbo': { input: 10.0, output: 30.0 },
  'gpt-3.5-turbo': { input: 0.5, output: 1.5 },

  // ========== Google Gemini 系列 ==========
  'gemini-2.5-pro': { input: 1.25, output: 10.0, cacheRead: 0.31, cacheWrite: 4.5 },
  'gemini-2.5-pro-preview': { input: 1.25, output: 10.0, cacheRead: 0.31, cacheWrite: 4.5 },
  'gemini-2.5-pro-preview-03-25': { input: 1.25, output: 10.0, cacheRead: 0.31, cacheWrite: 4.5 },
  'gemini-2.0-flash': { input: 0.1, output: 0.4 },
  'gemini-2.0-flash-exp': { input: 0.1, output: 0.4 },
  'gemini-2.0-flash-lite': { input: 0.075, output: 0.3 },
  'gemini-1.5-pro': { input: 1.25, output: 5.0 },
  'gemini-1.5-flash': { input: 0.075, output: 0.3 },
  'gemini-1.5-flash-8b': { input: 0.0375, output: 0.15 },

  // ========== DeepSeek 深度求索 ==========
  'deepseek-v3': { input: 0.27, output: 1.1 },
  'deepseek-v3-0324': { input: 0.27, output: 1.1 },
  'deepseek-r1': { input: 0.55, output: 2.19 },
  'deepseek-r1-0528': { input: 0.55, output: 2.19 },
  'deepseek-chat': { input: 0.27, output: 1.1 },
  'deepseek-v2.5': { input: 0.14, output: 0.28 },

  // ========== 通义千问 Qwen (Alibaba) ==========
  'qwen-max': { input: 2.5, output: 7.5 },
  'qwen-max-latest': { input: 2.5, output: 7.5 },
  'qwen-plus': { input: 0.5, output: 1.5 },
  'qwen-plus-latest': { input: 0.5, output: 1.5 },
  'qwen3.5-plus': { input: 0.5, output: 1.5 },
  'qwen-turbo': { input: 0.15, output: 0.6 },
  'qwen-turbo-latest': { input: 0.15, output: 0.6 },
  'qwen-long': { input: 0.5, output: 1.5 },
  'qwen2.5-72b-instruct': { input: 0.5, output: 1.5 },
  'qwen2.5-32b-instruct': { input: 0.25, output: 0.75 },
  'qwen2.5-coder': { input: 0.1, output: 0.3 },

  // ========== Kimi 月之暗面 ==========
  'kimi-latest': { input: 1.0, output: 3.0 },
  'kimi-plus': { input: 1.0, output: 3.0 },
  'kimi-base': { input: 0.5, output: 1.5 },
  'kimi-moonshot-v1-8k': { input: 1.0, output: 3.0 },
  'kimi-moonshot-v1-32k': { input: 1.0, output: 3.0 },
  'kimi-moonshot-v1-128k': { input: 3.0, output: 9.0 },

  // ========== 带 provider 前缀的格式（兼容不同 API 来源）==========
  // Anthropic
  'anthropic/claude-opus-4-6': { input: 15.0, output: 75.0, cacheRead: 1.875, cacheWrite: 18.75 },
  'anthropic/claude-opus-4-5': { input: 15.0, output: 75.0, cacheRead: 1.875, cacheWrite: 18.75 },
  'anthropic/claude-sonnet-4-6': { input: 3.0, output: 15.0, cacheRead: 0.3, cacheWrite: 3.75 },
  'anthropic/claude-sonnet-4-5': { input: 3.0, output: 15.0, cacheRead: 0.3, cacheWrite: 3.75 },
  'anthropic/claude-3-5-haiku-latest': { input: 0.8, output: 4.0, cacheRead: 0.08, cacheWrite: 1.0 },

  // OpenAI
  'openai/gpt-4o': { input: 2.5, output: 10.0 },
  'openai/gpt-4o-mini': { input: 0.15, output: 0.6 },
  'openai/gpt-4.1-mini': { input: 0.4, output: 1.6 },
  'openai/gpt-4-turbo': { input: 10.0, output: 30.0 },
  'openai/gpt-3.5-turbo': { input: 0.5, output: 1.5 },

  // Google
  'google/gemini-2.5-pro': { input: 1.25, output: 10.0 },
  'google/gemini-2.0-flash': { input: 0.1, output: 0.4 },
  'google/gemini-1.5-pro': { input: 1.25, output: 5.0 },
  'google/gemini-1.5-flash': { input: 0.075, output: 0.3 },
};

const CONFIG_FILE_PATH = path.join(process.cwd(), 'config', 'model-pricing.json');

/**
 * 加载模型价格配置
 * 优先级：配置文件 > 默认配置
 */
export function loadModelPricing(): Record<string, ModelPricing> {
  try {
    if (!fs.existsSync(CONFIG_FILE_PATH)) {
      return { ...DEFAULT_MODEL_PRICING };
    }
    const content = fs.readFileSync(CONFIG_FILE_PATH, 'utf8');
    const config: ModelPricingConfig = JSON.parse(content);
    if (!config.models || typeof config.models !== 'object') {
      return { ...DEFAULT_MODEL_PRICING };
    }
    // 合并配置：用户配置覆盖默认配置
    return { ...DEFAULT_MODEL_PRICING, ...config.models };
  } catch (error) {
    console.error('Failed to load model pricing config:', error);
    return { ...DEFAULT_MODEL_PRICING };
  }
}

/**
 * 保存模型价格配置
 */
export function saveModelPricing(config: ModelPricingConfig): boolean {
  try {
    const configDir = path.dirname(CONFIG_FILE_PATH);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    const configToSave: ModelPricingConfig = {
      ...config,
      lastUpdated: Date.now(),
      version: config.version || 1,
    };
    fs.writeFileSync(CONFIG_FILE_PATH, JSON.stringify(configToSave, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('Failed to save model pricing config:', error);
    return false;
  }
}

/**
 * 获取当前配置（含最后更新时间）
 */
export function getCurrentPricingConfig(): ModelPricingConfig {
  try {
    if (!fs.existsSync(CONFIG_FILE_PATH)) {
      return {
        models: DEFAULT_MODEL_PRICING,
        lastUpdated: undefined,
        version: 1,
      };
    }
    return JSON.parse(fs.readFileSync(CONFIG_FILE_PATH, 'utf8'));
  } catch {
    return {
      models: DEFAULT_MODEL_PRICING,
      lastUpdated: undefined,
      version: 1,
    };
  }
}

export interface ModelPricingConfig {
  models: Record<string, ModelPricing>;
  lastUpdated?: number;
  version?: number;
}
