import { Injectable, Logger } from '@nestjs/common';
import {
  ImChannel,
  FormattedMessage,
  SendMessageOptions,
  SendResult,
  HealthStatus,
} from '../../channel.interface';

/**
 * 钉钉 Channel 实现
 *
 * API 文档：https://open.dingtalk.com/document/orgapp
 */
@Injectable()
export class DingTalkChannel implements ImChannel {
  readonly type = 'dingtalk';
  private readonly logger = new Logger(DingTalkChannel.name);

  private config?: DingTalkConfig;
  private accessToken?: string;
  private tokenExpiresAt = 0;

  async initialize(config: Record<string, any>): Promise<void> {
    this.config = config as DingTalkConfig;
    this.logger.log('DingTalk channel initialized');
    await this.refreshAccessToken();
  }

  async send(
    content: FormattedMessage,
    options?: SendMessageOptions,
  ): Promise<SendResult> {
    if (!this.config) {
      throw new Error('DingTalk channel not initialized');
    }

    const accessToken = await this.getAccessToken();
    const receiveId = options?.receive_id || this.config.targetUserId;

    // 钉钉消息 API
    const url =
      'https://oapi.dingtalk.com/topapi/message/corpconversation/asyncsend_v2';

    const body: any = {
      agent_id: this.config.agentId,
      userid_list: receiveId === '@all' ? '@all' : receiveId,
      msgtype: content.msg_type,
    };

    // 钉钉消息格式转换
    if (content.msg_type === 'text') {
      body.text = { content: content.content.text };
    } else if (content.msg_type === 'markdown') {
      body.markdown = { title: 'TraceFlow', text: content.content.text };
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    if (data.errcode !== 0) {
      throw new Error(
        `DingTalk API error: ${data.errmsg} (code: ${data.errcode})`,
      );
    }

    return {
      message_id: data.message_id?.toString() || 'unknown',
      sent_at: Date.now(),
    };
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

  destroy(): void {
    this.logger.log('DingTalk channel destroyed');
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt) {
      return this.accessToken;
    }
    return this.refreshAccessToken();
  }

  private async refreshAccessToken(): Promise<string> {
    if (!this.config) {
      throw new Error('DingTalk channel not initialized');
    }

    const response = await fetch(
      `https://oapi.dingtalk.com/gettoken?appkey=${this.config.appKey}&appsecret=${this.config.appSecret}`,
      {
        method: 'GET',
      },
    );

    const data = await response.json();
    if (data.errcode !== 0) {
      throw new Error(`Failed to get DingTalk access token: ${data.errmsg}`);
    }

    this.accessToken = data.access_token;
    // 钉钉 token 有效期 7200 秒
    this.tokenExpiresAt = Date.now() + (data.expires_in - 300) * 1000;

    this.logger.debug('DingTalk access token refreshed');
    return this.accessToken!;
  }
}

interface DingTalkConfig {
  appKey: string;
  appSecret: string;
  agentId: number;
  targetUserId: string;
}
