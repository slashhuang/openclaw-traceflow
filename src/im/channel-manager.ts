import {
  Injectable,
  Logger,
  Inject,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '../config/config.service';
import {
  ImChannel,
  FormattedMessage,
  SendMessageOptions,
  SendResult,
  HealthStatus,
} from './channel.interface';
import { FeishuChannel } from './channels/feishu/feishu.channel';
import { CircuitBreakerService } from './circuit-breaker.service';

/**
 * IM Channel 管理器
 * 管理所有 Channel 插件，处理消息路由、限流、重试
 */
@Injectable()
export class ChannelManager implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ChannelManager.name);

  // 已加载的 Channel 实例
  private channels = new Map<string, ImChannel>();

  // Channel 配置
  private channelConfigs = new Map<string, any>();

  constructor(
    private configService: ConfigService,
    @Inject('CHANNEL_PLUGINS') private channelPlugins: ImChannel[],
    private circuitBreakerService: CircuitBreakerService,
  ) {}

  async onModuleInit(): Promise<void> {
    const config = this.configService.getConfig();

    // 注册所有 Channel 插件
    for (const plugin of this.channelPlugins) {
      const channelConfig = config.im?.channels?.[plugin.type];

      if (channelConfig?.enabled) {
        try {
          await plugin.initialize(channelConfig);
          this.channels.set(plugin.type, plugin);
          this.channelConfigs.set(plugin.type, channelConfig);
          this.logger.log(`Channel "${plugin.type}" initialized`);
        } catch (error) {
          this.logger.error(
            `Failed to initialize channel "${plugin.type}":`,
            error as Error,
          );
        }
      }
    }

    this.logger.log(
      `ChannelManager initialized with ${this.channels.size} channels`,
    );
  }

  /**
   * 发送消息到指定 Channel
   */
  async sendToChannel(
    channelType: string,
    content: FormattedMessage,
    options?: SendMessageOptions,
  ): Promise<SendResult | null> {
    const channel = this.channels.get(channelType);

    if (!channel) {
      this.logger.warn(`Channel "${channelType}" not found or disabled`);
      return null;
    }

    // 检查 channel 自带的熔断状态（如 FeishuChannel 的连续失败计数）
    if ('isCircuitOpen' in channel && (channel as any).isCircuitOpen()) {
      this.logger.warn(
        `Channel "${channelType}" circuit breaker is OPEN, dropping message`,
      );
      return null;
    }

    const breaker = this.circuitBreakerService.get(`channel:${channelType}`);

    return breaker.execute(async () => {
      const result = await channel.send(content, options);
      this.logger.log(`Message sent to ${channelType}: ${result.message_id}`);
      return result;
    });
  }

  /**
   * 广播消息到所有 Channel
   */
  async broadcast(
    content: FormattedMessage,
    options?: SendMessageOptions,
  ): Promise<Map<string, SendResult | Error>> {
    const results = new Map<string, SendResult | Error>();

    for (const [channelType, channel] of this.channels.entries()) {
      // 检查熔断状态
      if ('isCircuitOpen' in channel && (channel as any).isCircuitOpen()) {
        this.logger.warn(`Channel "${channelType}" circuit OPEN, skipping`);
        results.set(channelType, new Error('Circuit breaker OPEN'));
        continue;
      }

      const breaker = this.circuitBreakerService.get(`channel:${channelType}`);

      try {
        const result = await breaker.execute(() =>
          channel.send(content, options),
        );
        results.set(channelType, result);
      } catch (error) {
        results.set(channelType, error as Error);
      }
    }

    return results;
  }

  /**
   * 获取 Channel 健康状态
   */
  async getHealthStatus(): Promise<Map<string, HealthStatus>> {
    const status = new Map<string, HealthStatus>();

    for (const [channelType, channel] of this.channels.entries()) {
      try {
        const health = await channel.healthCheck();
        status.set(channelType, health);
      } catch (error) {
        status.set(channelType, {
          healthy: false,
          error: (error as Error).message,
          last_check: Date.now(),
        });
      }
    }

    return status;
  }

  /**
   * 获取已启用的 Channel 列表
   */
  getEnabledChannels(): string[] {
    return Array.from(this.channels.keys());
  }

  /**
   * 检查 Channel 是否启用
   */
  isChannelEnabled(channelType: string): boolean {
    return this.channels.has(channelType);
  }

  onModuleDestroy(): void {
    for (const [channelType, channel] of this.channels.entries()) {
      try {
        channel.destroy();
        this.logger.log(`Channel "${channelType}" destroyed`);
      } catch (error) {
        this.logger.error(
          `Error destroying channel "${channelType}":`,
          error as Error,
        );
      }
    }
  }

  /**
   * 从配置重新加载 Channel（热重载）
   */
  async reloadFromConfig(imConfig: any): Promise<void> {
    this.logger.log('Reloading channels from config...');
    this.logger.log(`IM Config: ${JSON.stringify(imConfig)}`);

    // 销毁所有现有 Channel
    for (const [channelType, channel] of this.channels.entries()) {
      try {
        channel.destroy();
        this.logger.log(`Channel "${channelType}" destroyed`);
      } catch (error) {
        this.logger.error(
          `Error destroying channel "${channelType}":`,
          error as Error,
        );
      }
    }
    this.channels.clear();
    this.channelConfigs.clear();

    // 重新初始化启用的 Channel
    this.logger.log(`Checking channels: ${JSON.stringify(imConfig?.channels)}`);
    if (imConfig?.channels) {
      for (const [channelType, channelConfig] of Object.entries(
        imConfig.channels,
      )) {
        const config = channelConfig as any;
        this.logger.log(
          `Processing channel: ${channelType}, enabled: ${config?.enabled}`,
        );
        if (config?.enabled) {
          try {
            // 根据类型创建对应的 Channel 实例
            let channel: ImChannel | null = null;
            if (channelType === 'feishu') {
              channel = new FeishuChannel();
              this.logger.log('FeishuChannel instance created');
            }

            if (channel) {
              await channel.initialize(config);
              this.channels.set(channelType, channel);
              this.channelConfigs.set(channelType, config);
              this.logger.log(`Channel "${channelType}" reloaded`);
            }
          } catch (error) {
            this.logger.error(
              `Failed to reload channel "${channelType}":`,
              error as Error,
            );
          }
        }
      }
    }

    this.logger.log(
      `Channels reloaded: ${Array.from(this.channels.keys()).join(', ')}`,
    );
  }
}
