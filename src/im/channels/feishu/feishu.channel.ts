import { Injectable, Logger } from '@nestjs/common';
import * as lark from '@larksuiteoapi/node-sdk';
import {
  ImChannel,
  FormattedMessage,
  SendMessageOptions,
  SendResult,
  HealthStatus,
} from '../../channel.interface';

export interface FeishuConfig {
  appId: string;
  appSecret: string;
  targetUserId: string;
  /** receive_id 类型：open_id | user_id | union_id | chat_id */
  receiveIdType?: string;
  rateLimit?: number;
  /** 可选的 chat_id，用于回复消息 */
  chatId?: string;
}

/**
 * 飞书 IM 通道实现（使用官方 SDK）
 */
@Injectable()
export class FeishuChannel implements ImChannel {
  readonly type = 'feishu';
  private readonly logger = new Logger(FeishuChannel.name);

  private client?: lark.Client;
  private config?: FeishuConfig;

  // 令牌桶限流
  private tokenBucket: number;
  private maxTokens: number;
  private refillRate: number;
  private lastRefill = Date.now();

  constructor() {
    // 默认配置，实际配置在 initialize 时传入
    this.maxTokens = 20;
    this.refillRate = 10;
    this.tokenBucket = this.maxTokens;
  }

  async initialize(config: Record<string, any>): Promise<void> {
    const feishuConfig = config as FeishuConfig;

    if (feishuConfig) {
      this.config = feishuConfig;
      this.maxTokens = (feishuConfig.rateLimit || 10) * 2;
      this.refillRate = feishuConfig.rateLimit || 10;
      this.tokenBucket = this.maxTokens;

      // 使用官方 SDK 初始化客户端
      this.client = new lark.Client({
        appId: feishuConfig.appId,
        appSecret: feishuConfig.appSecret,
      });

      this.logger.log('Feishu channel initialized with official SDK');
    }
  }

  async send(
    content: FormattedMessage,
    options?: SendMessageOptions,
  ): Promise<SendResult> {
    await this.acquireToken();

    if (!this.config || !this.client) {
      throw new Error('Feishu channel not initialized');
    }

    try {
      const receiveIdType = this.config.receiveIdType || 'open_id';

      // 如果有 reply_id，使用飞书官方的回复消息接口
      if (options?.reply_id) {
        return await this.sendReply(options.reply_id, content);
      }

      // 使用官方 SDK 发送消息
      this.logger.debug(
        `Sending message: msg_type=${content.msg_type}, receive_id=${this.config.targetUserId}`,
      );

      const response = await this.client.im.message.create(
        {
          params: {
            receive_id_type: receiveIdType as
              | 'open_id'
              | 'user_id'
              | 'union_id'
              | 'email'
              | 'chat_id',
          },
          data: {
            receive_id: this.config.targetUserId,
            msg_type: content.msg_type,
            content:
              typeof content.content === 'string'
                ? content.content
                : JSON.stringify(content.content),
          },
        },
        {},
      );

      if (response.code !== 0) {
        this.logger.error(
          `Feishu API error: ${response.msg} (code: ${response.code}), data: ${JSON.stringify(response.data)}`,
        );
        throw new Error(
          `Feishu API error: ${response.msg} (code: ${response.code})`,
        );
      }

      this.logger.warn(
        `Feishu API returned: message_id=${response.data?.message_id}, chat_id=${response.data?.chat_id}, code=${response.code}`,
      );

      // 保存 chat_id 用于后续回复消息
      if (response.data?.chat_id && !this.config.chatId) {
        this.config.chatId = response.data.chat_id;
        this.logger.debug(`Chat ID saved: ${this.config.chatId}`);
      }

      return {
        message_id: response.data?.message_id || '',
        chat_id: response.data?.chat_id,
      };
    } catch (error) {
      const errorData = error;
      this.logger.error(
        `Failed to send message: ${errorData?.message || errorData?.toString()}`,
      );
      if (errorData?.response?.data) {
        this.logger.error(
          `Feishu API response: ${JSON.stringify(errorData.response.data)}`,
        );
      }
      throw error;
    }
  }

  /**
   * 回复消息（使用飞书官方 SDK 的 reply 接口，形成话题聚合）
   *
   * 飞书 Thread 机制说明：
   * - 使用 reply API 并设置 reply_in_thread: true 即可形成 thread
   * - path.message_id 指定被回复的消息，SDK 会自动处理 thread 关系
   * - thread_id: 响应中返回的线程标识
   *
   * 要将多条消息聚合到同一个 thread 下，所有消息都必须回复同一条 root 消息
   */
  private async sendReply(
    rootMessageId: string, // 根消息 ID（第一条 user 消息）
    content: FormattedMessage,
  ): Promise<SendResult> {
    if (!this.client) {
      throw new Error('Feishu client not initialized');
    }

    this.logger.warn(
      `Sending reply to thread with root message: ${rootMessageId}`,
    );

    // 使用 im.v1.message.reply API
    // 关键：reply_in_thread=true 形成 thread，所有消息都回复同一条 root 消息即可聚合
    const response = await this.client.im.v1.message.reply(
      {
        data: {
          content:
            typeof content.content === 'string'
              ? content.content
              : JSON.stringify(content.content),
          msg_type: content.msg_type,
          reply_in_thread: true, // 以话题形式回复
        },
        path: {
          message_id: rootMessageId, // 指定被回复的消息（根消息）
        },
      },
      {},
    );

    if (response.code !== 0) {
      throw new Error(
        `Feishu API error: ${response.msg} (code: ${response.code})`,
      );
    }

    this.logger.warn(
      `Reply sent: ${response.data?.message_id}, thread_id: ${response.data?.thread_id}`,
    );

    return {
      message_id: response.data?.message_id || '',
      thread_id: response.data?.thread_id,
    };
  }

  async update(messageId: string, content: FormattedMessage): Promise<void> {
    await this.acquireToken();

    if (!this.client) {
      throw new Error('Feishu client not initialized');
    }

    const response = await this.client.im.message.update({
      path: {
        message_id: messageId,
      },
      data: {
        content:
          typeof content.content === 'string'
            ? content.content
            : JSON.stringify(content.content),
        msg_type: content.msg_type,
      },
    });

    if (response.code !== 0) {
      throw new Error(
        `Feishu API error: ${response.msg} (code: ${response.code})`,
      );
    }

    this.logger.debug(`Message updated: ${messageId}`);
  }

  destroy(): void {
    this.logger.log('Feishu channel destroyed');
    this.client = undefined;
    this.config = undefined;
  }

  async healthCheck(): Promise<HealthStatus> {
    try {
      // 简单检查：客户端是否已初始化
      if (!this.client || !this.config) {
        return {
          healthy: false,
          error: 'Client not initialized',
          last_check: Date.now(),
        };
      }

      // SDK 内部会自动管理 token，只要能发起请求就说明健康
      // 这里我们尝试获取一个部门的用户列表来验证
      await this.client.contact.user.get({
        path: {
          user_id: this.config.targetUserId,
        },
        params: {
          user_id_type: 'open_id',
        },
      });

      return {
        healthy: true,
        last_check: Date.now(),
      };
    } catch (error) {
      return {
        healthy: false,
        error: (error as Error).message,
        last_check: Date.now(),
      };
    }
  }

  /**
   * 获取令牌（限流）
   */
  private async acquireToken(): Promise<void> {
    while (true) {
      this.refill();
      if (this.tokenBucket >= 1) {
        this.tokenBucket--;
        return;
      }
      // 等待 100ms
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  /**
   * 补充令牌
   */
  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    const newTokens = Math.floor(elapsed * this.refillRate);

    if (newTokens > 0) {
      this.tokenBucket = Math.min(this.maxTokens, this.tokenBucket + newTokens);
      this.lastRefill = now;
    }
  }
}
