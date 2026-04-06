import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '../config/config.service';
import { ChannelManager } from './channel-manager';
import { FeishuMessageFormatter } from './channels/feishu/feishu.formatter';
import { SessionStateService } from './session-state.service';

/**
 * IM 推送服务
 * 协调 SessionManager、Formatter、Channel，处理推送逻辑
 * 使用 SessionStateService 存储会话状态，解耦事件时序
 */
@Injectable()
export class ImPushService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ImPushService.name);

  private formatter: FeishuMessageFormatter;

  // 事件监听器是否已注册
  private eventListenersRegistered = false;

  constructor(
    private eventEmitter: EventEmitter2,
    private channelManager: ChannelManager,
    private configService: ConfigService,
    private sessionState: SessionStateService,
  ) {
    this.formatter = new FeishuMessageFormatter();
  }

  onModuleInit(): void {
    this.initializeEventListeners();
  }

  /**
   * 初始化事件监听器（支持热重载）
   */
  initializeEventListeners(): void {
    const config = this.configService.getConfig();

    // 如果已经注册过监听器，先清理
    if (this.eventListenersRegistered) {
      this.removeEventListeners();
    }

    // 仅当配置了 IM 推送时启动
    if (!config.im?.enabled) {
      this.logger.log('IM Push disabled in config, skipping initialization');
      this.eventListenersRegistered = false;
      return;
    }

    // 延迟检查通道，确保 ChannelManager 已完成初始化
    setTimeout(() => {
      // 检查是否有启用的 Channel
      const enabledChannels = this.channelManager.getEnabledChannels();
      if (enabledChannels.length === 0) {
        this.logger.log('No IM channels enabled');
        this.eventListenersRegistered = false;
        return;
      }

      this.logger.log(
        `IM Push Service initialized with channels: ${enabledChannels.join(', ')}`,
      );

      // 订阅会话事件
      this.eventEmitter.on('audit.session.start', (session) => {
        void this.handleSessionStart(session);
      });
      this.eventEmitter.on('audit.session.message', (data) => {
        void this.handleSessionMessage(data);
      });
      this.eventEmitter.on('audit.session.end', (session) => {
        void this.handleSessionEnd(session);
      });

      this.logger.log('IM Push Service event listeners registered');
      this.eventListenersRegistered = true;
    }, 1000);
  }

  /**
   * 移除事件监听器（用于热重载）
   */
  private removeEventListeners(): void {
    this.eventEmitter.removeAllListeners('audit.session.start');
    this.eventEmitter.removeAllListeners('audit.session.message');
    this.eventEmitter.removeAllListeners('audit.session.end');
    this.eventListenersRegistered = false;
    this.logger.log('IM Push Service event listeners removed');
  }

  /**
   * 从配置重新加载（热重载入口）
   */
  async reloadFromConfig(imConfig: any): Promise<void> {
    this.logger.log('ImPushService reloading from config...');
    // 重新初始化事件监听器
    this.initializeEventListeners();
  }

  /**
   * 处理会话开始
   * 创建父消息并将 parentId 存储到 SessionStateService
   */
  private async handleSessionStart(session: {
    sessionId: string;
    sessionKey: string;
    user: { id: string; name: string };
    account: string;
    startTime?: number;
    messageCount?: number;
    status?: 'active' | 'completed';
    firstMessage?: string;
  }): Promise<void> {
    // 先将会话状态存储到 SessionStateService
    const sessionState = this.sessionState.upsert(session.sessionId, {
      sessionId: session.sessionId,
      sessionKey: session.sessionKey,
      user: session.user,
      account: session.account,
      startTime: session.startTime || Date.now(),
      messageCount: session.messageCount || 0,
      status: session.status || 'active',
      firstMessage: session.firstMessage,
    });

    this.logger.debug(`Session state stored: ${session.sessionId}`);

    try {
      // 发送父消息到默认 Channel（飞书）
      const parentMessage = this.formatter.formatSessionParent(
        sessionState,
        'active',
      );
      const result = await this.channelManager.sendToChannel(
        'feishu',
        parentMessage,
      );

      if (result) {
        // 记录父消息 ID 到 SessionStateService，并标记会话准备好
        this.sessionState.setParentId(session.sessionId, result.message_id);
        this.logger.log(
          `Session parent message created: ${session.sessionId} -> ${result.message_id}`,
        );

        // 发送事件到 LogsService
        this.eventEmitter.emit('im.push.session.parent.created', {
          sessionId: session.sessionId,
          messageId: result.message_id,
        });

        // 处理队列中的消息
        await this.flushQueuedMessages(session.sessionId);
      }
    } catch (error) {
      this.logger.error(
        `Failed to send session start: ${session.sessionId}`,
        error as Error,
      );
      // 发送错误事件到 LogsService
      this.eventEmitter.emit('im.push.error', {
        sessionId: session.sessionId,
        error: (error as Error).message,
        phase: 'session_start',
      });
    }
  }

  /**
   * 处理队列中的消息
   */
  private async flushQueuedMessages(sessionId: string): Promise<void> {
    const queuedMessages = this.sessionState.dequeueAll(sessionId);
    if (queuedMessages.length === 0) return;

    this.logger.log(
      `Flushing ${queuedMessages.length} queued messages for session ${sessionId}`,
    );

    // 按顺序发送队列中的消息
    for (const { message } of queuedMessages) {
      await this.sendMessageWithParentId(sessionId, message);
    }
  }

  /**
   * 发送单条消息（使用 parentId）
   */
  private async sendMessageWithParentId(
    sessionId: string,
    message: any,
  ): Promise<void> {
    const parentId = this.sessionState.getParentId(sessionId);
    if (!parentId) {
      this.logger.warn(`No parent ID for session: ${sessionId}`);
      return;
    }

    try {
      let formattedMessage;

      // 根据消息类型发送
      switch (message.type) {
        case 'user':
          formattedMessage = this.formatter.formatUserMessage(message);
          break;
        case 'assistant':
          formattedMessage = this.formatter.formatAssistantMessage(message);
          break;
        case 'skill:start':
          formattedMessage = this.formatter.formatSkillStart(message);
          break;
        case 'skill:end':
          formattedMessage = this.formatter.formatSkillEnd(message);
          break;
        default:
          this.logger.warn(`Unknown message type: ${message.type}`);
          return;
      }

      await this.channelManager.sendToChannel('feishu', formattedMessage, {
        reply_id: parentId,
      });

      this.logger.log(
        `Queued message sent to thread: ${sessionId} -> ${parentId}`,
      );
      this.eventEmitter.emit('im.push.message.sent', {
        sessionId,
        messageId: parentId,
        type: message.type,
      });
    } catch (error) {
      this.logger.error(
        `Failed to send queued message: ${sessionId}`,
        error as Error,
      );
      this.eventEmitter.emit('im.push.error', {
        sessionId,
        error: (error as Error).message,
        phase: 'message_send',
      });
    }
  }

  /**
   * 处理会话消息
   * 从 SessionStateService 获取 parentId，确保时序正确
   */
  private async handleSessionMessage(data: {
    sessionId: string;
    message: any;
    session: any;
  }): Promise<void> {
    // 检查会话是否准备好（parent message 已创建）
    if (!this.sessionState.isSessionReady(data.sessionId)) {
      // 会话还没准备好，将消息加入队列
      this.sessionState.queueMessage(data.sessionId, data.message);
      this.logger.warn(`Session not ready, message queued: ${data.sessionId}`);
      return;
    }

    // 会话已准备好，直接发送
    await this.sendMessageWithParentId(data.sessionId, data.message);
  }

  /**
   * 创建父消息（用于会话开始推送被禁用时的延迟创建）
   */
  private async createParentMessage(session: any): Promise<void> {
    try {
      const parentMessage = this.formatter.formatSessionParent(
        session,
        'active',
      );
      const result = await this.channelManager.sendToChannel(
        'feishu',
        parentMessage,
      );

      if (result) {
        this.sessionState.setParentId(session.sessionId, result.message_id);
        this.logger.log(
          `Session parent message created: ${session.sessionId} -> ${result.message_id}`,
        );
        // 发送事件到 LogsService
        this.eventEmitter.emit('im.push.session.parent.created', {
          sessionId: session.sessionId,
          messageId: result.message_id,
        });
      }
    } catch (error) {
      this.logger.error(
        `Failed to create parent message: ${session.sessionId}`,
        error as Error,
      );
      // 发送错误事件到 LogsService
      this.eventEmitter.emit('im.push.error', {
        sessionId: session.sessionId,
        error: (error as Error).message,
        phase: 'create_parent',
      });
    }
  }

  /**
   * 处理会话结束
   */
  private async handleSessionEnd(session: any): Promise<void> {
    const parentId = this.sessionState.getParentId(session.sessionId);
    if (!parentId) {
      this.logger.warn(`No parent ID for session: ${session.sessionId}`);
      return;
    }

    try {
      // 发送会话结束消息到 Thread
      const endMessage = this.formatter.formatSessionEnd(session);
      await this.channelManager.sendToChannel('feishu', endMessage, {
        reply_id: parentId,
      });

      // 更新父消息为完成状态
      const updatedParent = this.formatter.formatSessionParent(
        session,
        'completed',
      );
      await this.channelManager.sendToChannel('feishu', updatedParent);

      this.logger.log(`Session completed: ${session.sessionId}`);
      // 发送事件到 LogsService
      this.eventEmitter.emit('im.push.session.completed', {
        sessionId: session.sessionId,
      });
    } catch (error) {
      this.logger.error(
        `Failed to end session: ${session.sessionId}`,
        error as Error,
      );
      // 发送错误事件到 LogsService
      this.eventEmitter.emit('im.push.error', {
        sessionId: session.sessionId,
        error: (error as Error).message,
        phase: 'session_end',
      });
    }
  }

  onModuleDestroy(): void {
    this.logger.log('IM Push Service destroyed');
  }
}
