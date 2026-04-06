import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '../config/config.service';
import { MessageQueueService } from './message-queue.service';
import { ChannelManager } from './channel-manager';
import { FeishuMessageFormatter } from './channels/feishu/feishu.formatter';
import type { FormattedMessage } from './channel.interface';

/**
 * IM 推送服务（简化版 - 内存队列）
 *
 * 架构：
 * - 使用内存队列，不需要 SQLite
 * - 每会话独立 worker，并行处理
 * - 会话内严格 FIFO
 */
@Injectable()
export class ImPushService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ImPushService.name);

  private formatter: FeishuMessageFormatter;
  private eventListenersRegistered = false;

  // 每会话正在处理的消息（用于回复链）
  private sessionFirstUserMessage = new Map<string, { message_id: string }>();

  constructor(
    private eventEmitter: EventEmitter2,
    private configService: ConfigService,
    private queueService: MessageQueueService,
    private channelManager: ChannelManager,
  ) {
    this.formatter = new FeishuMessageFormatter();
  }

  onModuleInit(): void {
    this.initializeEventListeners();
  }

  private initializeEventListeners(): void {
    const config = this.configService.getConfig();

    if (this.eventListenersRegistered) {
      this.removeEventListeners();
    }

    if (!config.im?.enabled) {
      this.logger.log('IM Push disabled in config, skipping initialization');
      this.eventListenersRegistered = false;
      return;
    }

    setTimeout(() => {
      this.eventEmitter.on('audit.session.start', (session: any) => {
        void this.handleSessionStart(session);
      });

      this.eventEmitter.on('audit.session.message', (data: any) => {
        void this.handleSessionMessage(data);
      });

      this.eventEmitter.on('audit.session.end', (session: any) => {
        void this.handleSessionEnd(session);
      });

      this.eventEmitter.on('audit.watcher.error', (data: any) => {
        void this.handleWatcherError(data);
      });

      this.eventListenersRegistered = true;
      this.logger.log('IM Push Service initialized (memory queue mode)');
    }, 1000);
  }

  private removeEventListeners(): void {
    this.eventEmitter.removeAllListeners('audit.session.start');
    this.eventEmitter.removeAllListeners('audit.session.message');
    this.eventEmitter.removeAllListeners('audit.session.end');
    this.eventListenersRegistered = false;
  }

  /**
   * 处理会话开始
   */
  private handleSessionStart(session: {
    sessionId: string;
    sessionKey: string;
    user: { id: string; name: string };
    account: string;
  }): void {
    const sessionId = session.sessionId;
    this.logger.log(`Session started: ${sessionId}`);

    // 清空该会话的状态
    this.sessionFirstUserMessage.delete(sessionId);
  }

  /**
   * 处理会话消息
   */
  private async handleSessionMessage(data: {
    sessionId: string;
    message: { type: string; [key: string]: any };
    session: any;
  }): Promise<void> {
    const sessionId = data.sessionId;
    const message = data.message;
    const messageType = message.type;

    this.logger.warn(
      `handleSessionMessage: sessionId=${sessionId}, type=${messageType}`,
    );

    // 加入队列
    const queuedMsg = this.queueService.enqueueMessage(sessionId, {
      type: messageType,
      data: message,
    });

    // 启动 worker 处理队列
    void this.processQueue(sessionId);
  }

  /**
   * 处理消息队列
   */
  private async processQueue(sessionId: string): Promise<void> {
    const queue = this.queueService.getQueue(sessionId);
    if (!queue || queue.isProcessing()) return;

    this.queueService.setProcessing(sessionId, true);

    try {
      while (true) {
        const queuedMsg = queue.getOldestMessage();
        if (!queuedMsg) break;

        await this.sendMessage(sessionId, queuedMsg);
      }
    } finally {
      this.queueService.setProcessing(sessionId, false);
    }
  }

  /**
   * 发送单条消息
   */
  private async sendMessage(
    sessionId: string,
    queuedMsg: { id: string; message: { type: string; data: any } },
  ): Promise<void> {
    const messageType = queuedMsg.message.type;
    const messageData = queuedMsg.message.data;

    this.logger.warn(
      `Sending message: sessionId=${sessionId}, type=${messageType}`,
    );

    // 格式化消息
    let formattedMessage: FormattedMessage;
    if (messageType === 'user') {
      formattedMessage = this.formatter.formatUserMessage(messageData);
    } else if (messageType === 'assistant') {
      formattedMessage = this.formatter.formatAssistantMessage(messageData);
    } else if (messageType === 'skill:start') {
      formattedMessage = this.formatter.formatSkillStart(messageData);
    } else if (messageType === 'skill:end') {
      formattedMessage = this.formatter.formatSkillEnd(messageData);
    } else {
      formattedMessage = {
        msg_type: 'text',
        content: { text: JSON.stringify(messageData) },
      };
    }

    // 获取 reply_id
    let replyId: string | undefined;

    if (
      messageType === 'assistant' ||
      messageType === 'skill:start' ||
      messageType === 'skill:end'
    ) {
      // Assistant/Skill 消息需要回复到第一条 user 消息
      const firstUserMsg = this.sessionFirstUserMessage.get(sessionId);
      replyId = firstUserMsg?.message_id;

      if (!replyId) {
        this.logger.warn(
          `Skipping ${messageType} message: no user message found for reply in session ${sessionId}`,
        );
        this.queueService.markMessageSent(sessionId, queuedMsg.id);
        return;
      }
    }

    // 发送消息
    try {
      const result = await this.channelManager.sendToChannel(
        'feishu',
        formattedMessage,
        {
          reply_id: replyId,
        },
      );

      if (result?.message_id) {
        this.logger.warn(
          `Message sent: sessionId=${sessionId}, type=${messageType}, message_id=${result.message_id}`,
        );

        // 如果是 user 消息，保存 message_id 用于后续回复
        if (messageType === 'user') {
          this.sessionFirstUserMessage.set(sessionId, {
            message_id: result.message_id,
          });
        }

        this.queueService.markMessageSent(sessionId, queuedMsg.id);
      } else {
        this.logger.warn(
          `Message sent but no message_id returned: ${sessionId}`,
        );
        this.queueService.markMessageSent(sessionId, queuedMsg.id);
      }
    } catch (error) {
      this.logger.error(`Failed to send message: ${(error as Error).message}`);
      this.queueService.markMessageFailed(
        sessionId,
        queuedMsg.id,
        (error as Error).message,
      );

      // 如果重试次数过多，放弃并删除消息
      const queue = this.queueService.getQueue(sessionId);
      if (queue) {
        const msg = (queue as any).messages?.find(
          (m: any) => m.id === queuedMsg.id,
        );
        if (msg && msg.retryCount >= 10) {
          this.logger.warn(
            `Message ${queuedMsg.id} exceeded max retries, dropping`,
          );
          this.queueService.removeFailedMessage(sessionId, queuedMsg.id);
        }
      }
    }
  }

  /**
   * 处理会话结束
   */
  private handleSessionEnd(session: { sessionId: string }): void {
    const sessionId = session.sessionId;
    this.logger.log(`Session ended: ${sessionId}`);

    // 清理会话状态
    this.sessionFirstUserMessage.delete(sessionId);
    this.queueService.cleanupSession(sessionId);
  }

  /**
   * 处理 watcher 错误
   */
  private async handleWatcherError(data: {
    agentId: string;
    error: string;
    timestamp: number;
  }): Promise<void> {
    const config = this.configService.getConfig();
    if (!config.im?.enabled || !config.im.channels?.feishu?.enabled) {
      return;
    }

    const errorMessage: FormattedMessage = {
      msg_type: 'text',
      content: {
        text: `[IM Push 告警] Watcher 错误\nAgent: ${data.agentId}\n错误：${data.error}`,
      },
    };

    try {
      await this.channelManager.sendToChannel('feishu', errorMessage);
    } catch (error) {
      this.logger.error(
        `Failed to send watcher error: ${(error as Error).message}`,
      );
    }
  }

  onModuleDestroy(): void {
    this.removeEventListeners();
  }

  /**
   * 从配置重新加载（热重载入口）
   */
  reloadFromConfig(): void {
    this.logger.log('ImPushService reloading from config...');
    this.initializeEventListeners();
  }
}
