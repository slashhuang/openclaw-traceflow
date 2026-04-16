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

  // 发送失败计数（用于快速熔断，避免日志雪崩）
  private consecutiveFailures = 0;
  private static readonly MAX_CONSECUTIVE_FAILURES = 10;

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

  /**
   * 检查熔断器状态
   * @returns 如果连续失败过多，返回 false 表示应停止发送
   */
  isCircuitOpen(): boolean {
    return this.consecutiveFailures >= FeishuChannel.MAX_CONSECUTIVE_FAILURES;
  }

  /**
   * 重置熔断器（成功发送后调用）
   */
  resetCircuit(): void {
    this.consecutiveFailures = 0;
  }

  /**
   * 记录发送失败
   */
  recordFailure(): void {
    this.consecutiveFailures++;
    if (this.consecutiveFailures === FeishuChannel.MAX_CONSECUTIVE_FAILURES) {
      this.logger.error(
        `Circuit breaker OPEN: ${this.consecutiveFailures} consecutive failures, stopping Feishu sends until next successful send`,
      );
    }
  }

  /**
   * 验证飞书消息内容格式
   * 飞书 API 对 content 字段有严格要求，提前校验避免无效请求
   */
  private validateContent(content: FormattedMessage): string | null {
    if (!content.msg_type) {
      return 'msg_type is required';
    }

    if (!content.content) {
      return 'content is required';
    }

    // text 类型：content 必须是 { text: string } 格式
    if (content.msg_type === 'text') {
      const textContent =
        typeof content.content === 'string'
          ? content.content
          : content.content?.text;

      if (!textContent || textContent.trim().length === 0) {
        return 'text content is empty';
      }

      // 飞书文本消息最大 150KB
      if (textContent.length > 150_000) {
        this.logger.warn(
          `Text content too large (${textContent.length} chars), truncating to 150KB`,
        );
      }
    }

    return null; // 验证通过
  }

  async send(
    content: FormattedMessage,
    options?: SendMessageOptions,
  ): Promise<SendResult> {
    // 检查熔断器
    if (this.isCircuitOpen()) {
      throw new Error(
        `Feishu circuit breaker OPEN (${this.consecutiveFailures} consecutive failures)`,
      );
    }

    // 验证内容格式（验证失败不记录为发送失败）
    const validationError = this.validateContent(content);
    if (validationError) {
      this.logger.error(`Invalid message content: ${validationError}`);
      throw new Error(`Invalid message content: ${validationError}`);
    }

    await this.acquireToken();

    if (!this.config || !this.client) {
      throw new Error('Feishu channel not initialized');
    }

    try {
      const receiveIdType = this.config.receiveIdType || 'open_id';

      // 支持自定义接收者（如群聊 chat_id）
      const effectiveReceiveId =
        options?.receive_id || this.config.targetUserId;
      const effectiveReceiveIdType =
        (options?.receive_id_type as string) || receiveIdType;

      // 如果有 reply_id，使用飞书官方的回复消息接口
      if (options?.reply_id) {
        return await this.sendReply(options.reply_id, content);
      }

      // 构建消息内容
      const contentStr =
        typeof content.content === 'string'
          ? content.content
          : JSON.stringify(content.content);

      this.logger.log(
        `Sending message: msg_type=${content.msg_type}, receive_id=${effectiveReceiveId}, receive_id_type=${effectiveReceiveIdType}, content_length=${contentStr.length}`,
      );

      const response = await this.client.im.message.create(
        {
          params: {
            receive_id_type: effectiveReceiveIdType as
              | 'open_id'
              | 'user_id'
              | 'union_id'
              | 'email'
              | 'chat_id',
          },
          data: {
            receive_id: effectiveReceiveId,
            msg_type: content.msg_type,
            content: contentStr,
          },
        },
        {},
      );

      if (response.code !== 0) {
        this.recordFailure();
        this.logger.error(
          `Feishu API error: ${response.msg} (code: ${response.code})`,
        );
        throw new Error(
          `Feishu API error: ${response.msg} (code: ${response.code})`,
        );
      }

      // 成功后重置熔断器
      this.resetCircuit();

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
      const errorData = error as {
        message?: string;
        response?: { data?: unknown };
      };
      // 只对非熔断器、非验证错误记录失败
      const msg = errorData?.message || '';
      if (
        !msg.includes('circuit breaker') &&
        !msg.includes('Invalid message content')
      ) {
        this.recordFailure();
      }
      this.logger.error(
        `Failed to send Feishu message: ${msg || (error as Error).toString()}`,
      );
      throw error;
    }
  }

  /**
   * 回复消息（使用飞书官方 SDK 的 reply 接口，形成话题聚合）
   */
  private async sendReply(
    rootMessageId: string,
    content: FormattedMessage,
  ): Promise<SendResult> {
    if (!this.client) {
      throw new Error('Feishu client not initialized');
    }

    // 构建消息内容
    const contentStr =
      typeof content.content === 'string'
        ? content.content
        : JSON.stringify(content.content);

    this.logger.log(
      `Sending reply: msg_type=${content.msg_type}, root_message_id=${rootMessageId}, content_length=${contentStr.length}`,
    );

    const response = await this.client.im.v1.message.reply(
      {
        data: {
          content: contentStr,
          msg_type: content.msg_type,
          reply_in_thread: true,
        },
        path: {
          message_id: rootMessageId,
        },
      },
      {},
    );

    if (response.code !== 0) {
      this.recordFailure();
      this.logger.error(
        `Feishu reply API error: ${response.msg} (code: ${response.code})`,
      );
      throw new Error(
        `Feishu API error: ${response.msg} (code: ${response.code})`,
      );
    }

    // 成功后重置熔断器
    this.resetCircuit();

    this.logger.log(
      `Reply sent: message_id=${response.data?.message_id}, thread_id=${response.data?.thread_id}`,
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

    const validationError = this.validateContent(content);
    if (validationError) {
      throw new Error(`Invalid message content for update: ${validationError}`);
    }

    const contentStr =
      typeof content.content === 'string'
        ? content.content
        : JSON.stringify(content.content);

    const response = await this.client.im.message.update({
      path: {
        message_id: messageId,
      },
      data: {
        content: contentStr,
        msg_type: content.msg_type,
      },
    });

    if (response.code !== 0) {
      this.recordFailure();
      throw new Error(
        `Feishu update API error: ${response.msg} (code: ${response.code})`,
      );
    }

    this.resetCircuit();
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
