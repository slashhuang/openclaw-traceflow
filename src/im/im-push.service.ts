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

  constructor(
    private eventEmitter: EventEmitter2,
    private channelManager: ChannelManager,
    private configService: ConfigService,
    private sessionState: SessionStateService,
  ) {
    this.formatter = new FeishuMessageFormatter();
  }

  onModuleInit(): void {
    const config = this.configService.getConfig();

    // 仅当配置了 IM 推送时启动
    if (!config.im?.enabled) {
      this.logger.log('IM Push disabled in config, skipping initialization');
      return;
    }

    // 延迟检查通道，确保 ChannelManager 已完成初始化
    setTimeout(() => {
      // 检查是否有启用的 Channel
      const enabledChannels = this.channelManager.getEnabledChannels();
      if (enabledChannels.length === 0) {
        this.logger.log('No IM channels enabled');
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
    }, 1000);
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
    const config = this.configService.getConfig();
    const pushStrategy = config?.im?.channels?.feishu?.pushStrategy || {};

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

    // 检查推送策略 - 即使不推送通知，也要创建父消息用于后续回复
    if (pushStrategy.sessionStart === false) {
      this.logger.debug(
        'Session start push disabled, creating placeholder parent message',
      );
      // 设置一个特殊的 parentId 标记
      const placeholderId = `placeholder_${session.sessionId}`;
      this.sessionState.setParentId(session.sessionId, placeholderId);
      return;
    }

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
        // 记录父消息 ID 到 SessionStateService
        this.sessionState.setParentId(session.sessionId, result.message_id);
        this.logger.log(
          `Session parent message created: ${session.sessionId} -> ${result.message_id}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to send session start: ${session.sessionId}`,
        error as Error,
      );
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
    // 从 SessionStateService 获取 parentId（持久化存储，不依赖事件顺序）
    let parentId = this.sessionState.getParentId(data.sessionId);

    // 如果没有 parentId，说明 session start 事件还没处理完成，等待一下
    if (!parentId) {
      this.logger.warn(
        `No parent ID for session: ${data.sessionId}, waiting for session start...`,
      );
      await new Promise((resolve) => setTimeout(resolve, 500));
      parentId = this.sessionState.getParentId(data.sessionId);
    }

    // 如果还是没有，说明会话开始时没有触发 start 事件，需要创建父消息
    if (!parentId) {
      this.logger.warn(
        `Still no parent ID for session: ${data.sessionId}, creating parent message now`,
      );
      const sessionState = this.sessionState.getOrCreate(data.sessionId);
      await this.createParentMessage(sessionState);
      parentId = this.sessionState.getParentId(data.sessionId);
      if (!parentId) {
        this.logger.error(`Failed to create parent message for session: ${data.sessionId}`);
        return;
      }
    }

    // 如果是 placeholder ID，说明会话开始推送被禁用了，需要先创建父消息
    if (parentId.startsWith('placeholder_')) {
      this.logger.debug(
        `Creating parent message for session with placeholder: ${data.sessionId}`,
      );
      const sessionState = this.sessionState.getOrCreate(data.sessionId);
      await this.createParentMessage(sessionState);
      parentId = this.sessionState.getParentId(data.sessionId);
    }

    this.logger.debug(`Sending message to thread with reply_id: ${parentId}`);

    try {
      let message;

      // 根据消息类型发送
      switch (data.message.type) {
        case 'user':
          message = this.formatter.formatUserMessage(data.message);
          break;
        case 'assistant':
          message = this.formatter.formatAssistantMessage(data.message);
          break;
        case 'skill:start':
          message = this.formatter.formatSkillStart(data.message);
          break;
        case 'skill:end':
          message = this.formatter.formatSkillEnd(data.message);
          break;
        default:
          this.logger.warn(`Unknown message type: ${data.message.type}`);
          return;
      }

      await this.channelManager.sendToChannel('feishu', message, {
        reply_id: parentId,
      });

      this.logger.log(`Message sent to thread: ${data.sessionId} -> ${parentId}`);
    } catch (error) {
      this.logger.error(
        `Failed to send message: ${data.sessionId}`,
        error as Error,
      );
    }
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
      }
    } catch (error) {
      this.logger.error(
        `Failed to create parent message: ${session.sessionId}`,
        error as Error,
      );
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
    } catch (error) {
      this.logger.error(
        `Failed to end session: ${session.sessionId}`,
        error as Error,
      );
    }
  }

  onModuleDestroy(): void {
    this.logger.log('IM Push Service destroyed');
  }
}
