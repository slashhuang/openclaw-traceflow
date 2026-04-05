import { Injectable, Logger } from '@nestjs/common';
import {
  ImChannel,
  FormattedMessage,
  SendMessageOptions,
  SendResult,
} from '../base.channel';

export interface FeishuConfig {
  appId: string;
  appSecret: string;
  targetUserId: string;
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

  // 令牌桶限流
  private tokenBucket: number;
  private readonly maxTokens: number;
  private readonly refillRate: number;
  private lastRefill = Date.now();

  constructor(private config: FeishuConfig) {
    this.maxTokens = config.rateLimit || 10;
    this.refillRate = config.rateLimit || 10;
    this.tokenBucket = this.maxTokens * 2; // 突发容量
  }

  async initialize(): Promise<void> {
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

      const body: any = {
        receive_id: this.config.targetUserId,
        msg_type: content.msg_type,
        content: JSON.stringify(content.content),
      };

      // 如果是 Thread 回复，添加 reply_id
      if (options?.reply_id) {
        body.reply_id = options.reply_id;
      }

      const response = await fetch(
        'https://open.feishu.cn/open-apis/im/v1/messages',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(body),
        },
      );

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

  /**
   * 获取 Access Token（带缓存）
   */
  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt) {
      return this.accessToken;
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
    return this.accessToken;
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
