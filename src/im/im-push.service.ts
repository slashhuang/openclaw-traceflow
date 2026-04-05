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
import { SessionEvent } from './session-manager';

/**
 * IM 推送服务
 * 协调 SessionManager、Formatter、Channel，处理推送逻辑
 */
@Injectable()
export class ImPushService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ImPushService.name);

  private formatter: FeishuMessageFormatter;

  constructor(
    private eventEmitter: EventEmitter2,
    private channelManager: ChannelManager,
    private configService: ConfigService,
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

    // 检查是否有启用的 Channel
    const enabledChannels = this.channelManager.getEnabledChannels();
    if (enabledChannels.length === 0) {
      this.logger.log('No IM channels enabled');
      return;
    }

    this.logger.log(`IM Push Service initialized with channels: ${enabledChannels.join(', ')}`);

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
    this.eventEmitter.on('audit.log.error', (log) => {
      void this.handleErrorLog(log);
    });

    this.logger.log('IM Push Service event listeners registered');
  }

  /**
   * 处理会话开始
   */
  private async handleSessionStart(session: SessionEvent): Promise<void> {
    const config = this.configService.getConfig();
    const pushStrategy = config?.im?.channels?.feishu?.pushStrategy || {};

    // 检查推送策略
    if (pushStrategy.sessionStart === false) {
      this.logger.debug('Session start push disabled');
      return;
    }

    try {
      // 发送父消息到默认 Channel（飞书）
      const parentMessage = this.formatter.formatSessionParent(
        session,
        'active',
      );
      const result = await this.channelManager.sendToChannel('feishu', parentMessage);

      if (result) {
        // 记录父消息 ID 到会话（用于后续 Thread 回复）
        (session as any).parentId = result.message_id;
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
   */
  private async handleSessionMessage(data: {
    sessionId: string;
    message: any;
    session: SessionEvent;
  }): Promise<void> {
    const parentId = (data.session as any).parentId;
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

      await this.channelManager.sendToChannel('feishu', message, { reply_id: parentId });
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
    const parentId = (session as any).parentId;
    if (!parentId) {
      this.logger.warn(`No parent ID for session: ${session.sessionId}`);
      return;
    }

    try {
      // 发送会话结束消息到 Thread
      const endMessage = this.formatter.formatSessionEnd(session);
      await this.channelManager.sendToChannel('feishu', endMessage, { reply_id: parentId });

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

  /**
   * 处理 ERROR 日志
   */
  private async handleErrorLog(log: any): Promise<void> {
    const config = this.configService.getConfig();
    const pushStrategy = config?.im?.channels?.feishu?.pushStrategy || {};

    // 检查推送策略
    if (pushStrategy.errorLogs === false) {
      return;
    }

    try {
      const message = this.formatter.formatErrorLog(log);
      await this.channelManager.sendToChannel('feishu', message);

      this.logger.log(`Error log pushed: ${log.component} - ${log.message}`);
    } catch (error) {
      this.logger.error('Failed to send error log:', error as Error);
    }
  }

  onModuleDestroy(): void {
    this.logger.log('IM Push Service destroyed');
  }
}
