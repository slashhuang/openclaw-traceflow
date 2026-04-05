import { Injectable, Logger } from '@nestjs/common';
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
}

/**
 * 飞书 IM 通道实现
 */
@Injectable()
export class FeishuChannel implements ImChannel {
  readonly type = 'feishu';
  private readonly logger = new Logger(FeishuChannel.name);

  private accessToken?: string;
  private tokenExpiresAt = 0;
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
      // 更新配置
      this.config = feishuConfig;
      this.maxTokens = (feishuConfig.rateLimit || 10) * 2;
      this.refillRate = feishuConfig.rateLimit || 10;
      this.tokenBucket = this.maxTokens;
    }

    this.logger.log('Feishu channel initialized');
    // 预取 access_token
    await this.getAccessToken();
  }

  async send(
    content: FormattedMessage,
    options?: SendMessageOptions,
  ): Promise<SendResult> {
    await this.acquireToken();

    try {
      const accessToken = await this.getAccessToken();

      if (!this.config) {
        throw new Error('Feishu config not initialized');
      }

      // 如果有 reply_id，使用飞书官方的 /reply 端点（参考 demos/feishu.ts）
      if (options?.reply_id) {
        return await this.sendReply(accessToken, options.reply_id, content);
      }

      // 普通消息发送
      const receiveIdType = this.config.receiveIdType || 'open_id';
      const url = `https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=${receiveIdType}`;

      const body = {
        receive_id: this.config.targetUserId,
        msg_type: content.msg_type,
        content: JSON.stringify(content.content),
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();
      if (data.code !== 0) {
        throw new Error(`Feishu API error: ${data.msg} (code: ${data.code})`);
      }

      this.logger.debug(`Message sent: ${data.data.message_id}`);
      return {
        message_id: data.data.message_id,
        chat_id: data.data.chat_id,
      };
    } catch (error) {
      this.logger.error('Failed to send message:', error);
      throw error;
    }
  }

  /**
   * 回复消息（使用飞书官方 /reply 端点）
   * 参考：demos/feishu.ts 第 47-79 行
   */
  private async sendReply(
    accessToken: string,
    messageId: string,
    content: FormattedMessage,
  ): Promise<SendResult> {
    const url = `https://open.feishu.cn/open-apis/im/v1/messages/${encodeURIComponent(messageId)}/reply`;

    const body = {
      content: JSON.stringify(content.content),
      msg_type: content.msg_type,
      reply_in_thread: true,
    };

    this.logger.warn(
      `Sending reply to message: ${messageId}, reply_in_thread: true`,
    );

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    if (data.code !== 0) {
      throw new Error(`Feishu API error: ${data.msg} (code: ${data.code})`);
    }

    this.logger.warn(
      `Reply sent: ${data.data.message_id}, thread_id: ${data.data.thread_id}`,
    );
    return {
      message_id: data.data.message_id,
      thread_id: data.data.thread_id,
    };
  }

  async update(messageId: string, content: FormattedMessage): Promise<void> {
    await this.acquireToken();

    const accessToken = await this.getAccessToken();

    const response = await fetch(
      `https://open.feishu.cn/open-apis/im/v1/messages/${messageId}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          msg_type: content.msg_type,
          content: JSON.stringify(content.content),
        }),
      },
    );

    const data = await response.json();
    if (data.code !== 0) {
      throw new Error(`Feishu API error: ${data.msg} (code: ${data.code})`);
    }

    this.logger.debug(`Message updated: ${messageId}`);
  }

  destroy(): void {
    this.logger.log('Feishu channel destroyed');
  }

  async healthCheck(): Promise<HealthStatus> {
    try {
      await this.getAccessToken();
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
   * 获取 Access Token（带缓存）
   */
  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt) {
      return this.accessToken;
    }

    if (!this.config) {
      throw new Error('Feishu config not initialized');
    }

    const response = await fetch(
      'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          app_id: this.config.appId,
          app_secret: this.config.appSecret,
        }),
      },
    );

    const data = await response.json();
    if (data.code !== 0) {
      throw new Error(`Failed to get access token: ${data.msg}`);
    }

    this.accessToken = data.tenant_access_token;
    // 提前 5 分钟刷新
    this.tokenExpiresAt = Date.now() + (data.expire - 300) * 1000;

    this.logger.debug('Access token refreshed');
    return this.accessToken!;
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
