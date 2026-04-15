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

  // 每会话最新一条 user 消息的 message_id（用于回复链）
  private sessionLatestUserMessage = new Map<string, { message_id: string }>();

  // 每会话发送锁，保证消息串行发送
  private sessionSendingLock = new Map<string, Promise<void>>();

  // 每会话防抖计时器（避免每次 JSONL append 都触发独立发送）
  private sessionDebounceTimers = new Map<string, NodeJS.Timeout>();
  private readonly DEBOUNCE_MS = 3000; // 3 秒无新消息才发送

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
    this.sessionLatestUserMessage.delete(sessionId);
    this.sessionSendingLock.delete(sessionId);

    // 清除防抖计时器
    const existingTimer = this.sessionDebounceTimers.get(sessionId);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.sessionDebounceTimers.delete(sessionId);
    }
  }

  /**
   * 处理会话消息
   * 使用防抖机制：同一会话 3 秒内无新消息才触发发送
   * 避免 OpenClaw 流式写入 JSONL 时每次 append 都触发独立飞书调用
   */
  private async handleSessionMessage(data: {
    sessionId: string;
    message: { type: string; [key: string]: any };
    session: any;
  }): Promise<void> {
    const sessionId = data.sessionId;
    const message = data.message;
    const messageType = message.type;

    this.logger.debug(
      `Queuing message: ${sessionId} (${messageType}), debouncing ${this.DEBOUNCE_MS}ms`,
    );

    // 加入队列
    const queuedMsg = this.queueService.enqueueMessage(sessionId, {
      type: messageType,
      data: message,
    });

    // 立即记录 user 消息的发送结果占位，确保后续 assistant 消息能找到 reply_id
    if (messageType === 'user') {
      this.sessionLatestUserMessage.set(sessionId, {
        message_id: '__pending__',
      });
    }

    // 重置防抖计时器
    const existingTimer = this.sessionDebounceTimers.get(sessionId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      this.sessionDebounceTimers.delete(sessionId);
      this.logger.log(
        `Debounce window expired for ${sessionId}, processing ${this.queueService.getQueue(sessionId)?.size() || 0} queued messages`,
      );
      void this.processQueue(sessionId);
    }, this.DEBOUNCE_MS);

    this.sessionDebounceTimers.set(sessionId, timer);
  }

  /**
   * 处理消息队列（串行发送）
   * 使用 dequeue() 原子性领取消息，防止并发重复消费
   */
  private async processQueue(sessionId: string): Promise<void> {
    const queue = this.queueService.getQueue(sessionId);
    if (!queue || queue.isProcessing()) return;

    this.queueService.setProcessing(sessionId, true);

    try {
      while (true) {
        const dequeuedMsg = queue.dequeue();
        if (!dequeuedMsg) break;

        const lock = this.sessionSendingLock.get(sessionId);
        if (lock) {
          await lock;
        }

        const sendPromise = this.sendMessage(sessionId, dequeuedMsg);
        this.sessionSendingLock.set(sessionId, sendPromise);
        await sendPromise;
        this.sessionSendingLock.delete(sessionId);
      }
    } finally {
      this.queueService.setProcessing(sessionId, false);
    }
  }

  /**
   * 发送单条消息，失败直接丢弃
   */
  private async sendMessage(
    sessionId: string,
    queuedMsg: { id: string; message: { type: string; data: any } },
  ): Promise<void> {
    const messageType = queuedMsg.message.type;
    const messageData = queuedMsg.message.data;

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

    const contentText =
      typeof formattedMessage.content === 'string'
        ? formattedMessage.content
        : (formattedMessage.content as any)?.text || '';
    const contentLength = contentText.length;

    let replyId: string | undefined;
    if (
      messageType === 'assistant' ||
      messageType === 'skill:start' ||
      messageType === 'skill:end'
    ) {
      const latestUserMsg = this.sessionLatestUserMessage.get(sessionId);
      if (!latestUserMsg || latestUserMsg.message_id === '__pending__') {
        this.logger.debug(
          `Skipping ${messageType} for ${sessionId}: no confirmed user message to reply to yet`,
        );
        this.queueService.removeMessage(sessionId, queuedMsg.id);
        return;
      }
      replyId = latestUserMsg.message_id;
    }

    this.logger.log(
      `Sending ${messageType} to Feishu: session=${sessionId.slice(0, 8)}..., type=${formattedMessage.msg_type}, content_length=${contentLength}, reply_to=${replyId?.slice(0, 12) || 'none'}`,
    );

    try {
      const result = await this.channelManager.sendToChannel(
        'feishu',
        formattedMessage,
        { reply_id: replyId },
      );

      if (result?.message_id) {
        if (messageType === 'user') {
          this.sessionLatestUserMessage.set(sessionId, {
            message_id: result.message_id,
          });
        }
        this.queueService.markMessageSent(sessionId, queuedMsg.id);
        this.logger.log(
          `Feishu send OK: ${messageType} -> ${result.message_id.slice(0, 16)}...`,
        );
      } else {
        this.logger.warn(
          `Feishu send failed (no message_id): ${messageType} for ${sessionId.slice(0, 8)}..., dropping`,
        );
        this.queueService.removeMessage(sessionId, queuedMsg.id);
        if (messageType === 'user') {
          this.sessionLatestUserMessage.delete(sessionId);
        }
      }
    } catch (error) {
      this.logger.error(
        `Feishu send error: ${messageType} for ${sessionId.slice(0, 8)}... - ${(error as Error).message}, dropping`,
      );
      this.queueService.removeMessage(sessionId, queuedMsg.id);
      if (messageType === 'user') {
        this.sessionLatestUserMessage.delete(sessionId);
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
    this.sessionLatestUserMessage.delete(sessionId);
    this.sessionSendingLock.delete(sessionId);
    this.queueService.cleanupSession(sessionId);

    // 清除防抖计时器（如果有待处理的消息，立即处理）
    const pendingTimer = this.sessionDebounceTimers.get(sessionId);
    if (pendingTimer) {
      clearTimeout(pendingTimer);
      this.sessionDebounceTimers.delete(sessionId);
      this.logger.log(`Session ended, flushing pending queue for ${sessionId}`);
      void this.processQueue(sessionId);
    }
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
