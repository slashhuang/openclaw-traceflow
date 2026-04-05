import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '../config/config.service';
import { SessionManager, SessionEvent } from './session-manager';
import { FeishuChannel } from './channels/feishu/feishu.channel';
import { FeishuMessageFormatter } from './channels/feishu/feishu.formatter';

/**
 * IM 推送服务
 * 协调 SessionManager、Formatter、Channel，处理推送逻辑
 */
@Injectable()
export class ImPushService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ImPushService.name);

  private feishuChannel?: FeishuChannel;
  private formatter?: FeishuMessageFormatter;

  constructor(
    private eventEmitter: EventEmitter2,
    private sessionManager: SessionManager,
    private configService: ConfigService,
  ) {}

  onModuleInit(): void {
    const config = this.configService.getConfig();

    // 仅当配置了 IM 推送时启动
    if (!config.im?.enabled || !config.im.channels?.feishu?.enabled) {
      this.logger.log('IM Push disabled in config, skipping initialization');
      return;
    }

    // 初始化飞书通道
    const feishuConfig = config.im.channels.feishu.config;
    this.feishuChannel = new FeishuChannel(feishuConfig);
    this.formatter = new FeishuMessageFormatter();

    this.feishuChannel.initialize().then(() => {
      this.logger.log('Feishu channel initialized');
    });

    // 订阅会话事件
    this.eventEmitter.on('audit.session.start', (session) =>
      this.handleSessionStart(session),
    );
    this.eventEmitter.on('audit.session.message', (data) =>
      this.handleSessionMessage(data),
    );
    this.eventEmitter.on('audit.session.end', (session) =>
      this.handleSessionEnd(session),
    );
    this.eventEmitter.on('audit.log.error', (log) => this.handleErrorLog(log));

    this.logger.log('IM Push Service initialized');
  }

  /**
   * 处理会话开始
   */
  private async handleSessionStart(session: SessionEvent): Promise<void> {
    if (!this.feishuChannel || !this.formatter) {
      this.logger.warn('IM Push not initialized');
      return;
    }

    const config = this.configService.getConfig();
    const pushStrategy = config.im.channels?.feishu?.pushStrategy || {};

    // 检查推送策略
    if (pushStrategy.sessionStart === false) {
      this.logger.debug('Session start push disabled');
      return;
    }

    try {
      // 发送父消息
      const parentMessage = this.formatter.formatSessionParent(
        session,
        'active',
      );
      const response = await this.feishuChannel.send(parentMessage);

      // 记录父消息 ID 到会话
      session.parentId = response.message_id;

      this.logger.log(
        `Session parent message created: ${session.sessionId} -> ${response.message_id}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send session start: ${session.sessionId}`,
        error as Error,
      );
    }
  }

  /**
   * 处理会话消息
   */
  private async handleSessionMessage(data: {
    sessionId: string;
    message: any;
    session: SessionEvent;
  }): Promise<void> {
    if (!this.feishuChannel || !this.formatter) {
      this.logger.warn('IM Push not initialized');
      return;
    }

    const parentId = data.session.parentId;
    if (!parentId) {
      this.logger.warn(`No parent ID for session: ${data.sessionId}`);
      return;
    }

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

      await this.feishuChannel.send(message, { reply_id: parentId });
    } catch (error) {
      this.logger.error(
        `Failed to send message: ${data.sessionId}`,
        error as Error,
      );
    }
  }

  /**
   * 处理会话结束
   */
  private async handleSessionEnd(session: SessionEvent): Promise<void> {
    if (!this.feishuChannel || !this.formatter) {
      this.logger.warn('IM Push not initialized');
      return;
    }

    const parentId = session.parentId;
    if (!parentId) {
      this.logger.warn(`No parent ID for session: ${session.sessionId}`);
      return;
    }

    try {
      // 发送会话结束消息到 Thread
      const endMessage = this.formatter.formatSessionEnd(session);
      await this.feishuChannel.send(endMessage, { reply_id: parentId });

      // 更新父消息为完成状态
      const updatedParent = this.formatter.formatSessionParent(
        session,
        'completed',
      );
      await this.feishuChannel.update(parentId, updatedParent);

      this.logger.log(`Session completed: ${session.sessionId}`);
    } catch (error) {
      this.logger.error(
        `Failed to end session: ${session.sessionId}`,
        error as Error,
      );
    }
  }

  /**
   * 处理 ERROR 日志
   */
  private async handleErrorLog(log: any): Promise<void> {
    if (!this.feishuChannel || !this.formatter) {
      this.logger.warn('IM Push not initialized');
      return;
    }

    const config = this.configService.getConfig();
    const pushStrategy = config.im.channels?.feishu?.pushStrategy || {};

    // 检查推送策略
    if (pushStrategy.errorLogs === false) {
      return;
    }

    try {
      const message = this.formatter.formatErrorLog(log);
      await this.feishuChannel.send(message);

      this.logger.log(`Error log pushed: ${log.component} - ${log.message}`);
    } catch (error) {
      this.logger.error('Failed to send error log:', error as Error);
    }
  }

  onModuleDestroy(): void {
    if (this.feishuChannel) {
      this.feishuChannel.destroy();
    }
    this.logger.log('IM Push Service destroyed');
  }
}
