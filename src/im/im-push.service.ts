import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '../config/config.service';
import { MessagePersistenceService } from './message-persistence.service';
import { MessageDispatcherService } from './message-dispatcher.service';
import { FeishuMessageFormatter } from './channels/feishu/feishu.formatter';
import { FeishuChannel } from './channels/feishu/feishu.channel';
import type { FormattedMessage } from './channel.interface';

/**
 * IM 推送服务（事件驱动架构）
 *
 * 职责分离：
 * - ImPushService: 事件处理 + 消息持久化
 * - MessageDispatcher: 消息调度 + 发送
 * - MessagePersistence: SQLite 存储（单一事实来源）
 *
 * 并发模型：
 * - 多会话并发：每会话独立 worker，天然隔离
 * - 会话内 FIFO：SQLite seq 序列号保证顺序
 * - 容错：单会话失败不影响其他会话
 */
@Injectable()
export class ImPushService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ImPushService.name);

  private formatter: FeishuMessageFormatter;

  // 事件监听器是否已注册
  private eventListenersRegistered = false;

  constructor(
    private eventEmitter: EventEmitter2,
    private configService: ConfigService,
    private persistence: MessagePersistenceService,
    private dispatcher: MessageDispatcherService,
    private feishuChannel: FeishuChannel,
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

    setTimeout(() => {
      this.logger.log('IM Push Service event listeners registered');

      // 订阅会话开始事件
      this.eventEmitter.on('audit.session.start', (session: unknown) => {
        void this.handleSessionStart(
          session as {
            sessionId: string;
            sessionKey: string;
            user: { id: string; name: string };
            account: string;
            startTime?: number;
            messageCount?: number;
            status?: 'active' | 'completed';
            firstMessage?: string;
          },
        );
      });

      // 订阅会话消息事件
      this.eventEmitter.on('audit.session.message', (data: unknown) => {
        void this.handleSessionMessage(
          data as {
            sessionId: string;
            message: Record<string, unknown>;
            session: unknown;
          },
        );
      });

      // 订阅会话结束事件
      this.eventEmitter.on('audit.session.end', (session: unknown) => {
        void this.handleSessionEnd(session as { sessionId: string });
      });

      // 订阅 watcher 错误事件（发送通知）
      this.eventEmitter.on('audit.watcher.error', (data: unknown) => {
        void this.handleWatcherError(
          data as {
            agentId: string;
            error: string;
            timestamp: number;
          },
        );
      });

      this.eventListenersRegistered = true;
      this.logger.log('IM Push Service initialized');
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
  reloadFromConfig(): void {
    this.logger.log('ImPushService reloading from config...');
    this.initializeEventListeners();
  }

  /**
   * 处理会话开始
   *
   * 流程：
   * 1. 持久化会话信息到 SQLite
   * 2. 通知 dispatcher 启动 worker
   */
  private handleSessionStart(session: {
    sessionId: string;
    sessionKey: string;
    user: { id: string; name: string };
    account: string;
    startTime?: number;
    messageCount?: number;
    status?: 'active' | 'completed';
    firstMessage?: string;
  }): void {
    const sessionId = session.sessionId;
    this.logger.log(`Session started: ${sessionId}`);

    // 提取 agent_id 和 user_id
    const agentId = this.extractAgentId(session.account);
    const userId = session.user.id;

    // 1. 持久化会话信息
    this.persistence.upsertSession({
      session_id: sessionId,
      session_key: session.sessionKey,
      agent_id: agentId,
      user_id: userId,
      user_name: session.user.name,
      status: 'active',
      created_at: session.startTime || Date.now(),
    });

    // 2. 通知 dispatcher 启动 worker
    this.dispatcher.notifyNewMessage(sessionId);
  }

  /**
   * 处理会话消息
   *
   * 流程：
   * 1. 持久化消息到 SQLite
   * 2. 通知 dispatcher
   *
   * 注意：每条用户消息是独立的母消息，AI 回复在发送时会动态查找最后一条已发送消息作为父消息
   */
  private handleSessionMessage(data: {
    sessionId: string;
    message: Record<string, unknown>;
    session: unknown;
  }): void {
    const sessionId = data.sessionId;
    const message = data.message as { type?: string; [key: string]: unknown };
    const messageType = message.type as string;

    // 所有消息入队时都不设置 parent_id，在发送时动态获取
    this.enqueueMessageWithParent(sessionId, message, undefined, messageType);
  }

  /**
   * 持久化消息（辅助方法）- 先格式化再入队
   */
  private enqueueMessageWithParent(
    sessionId: string,
    message: Record<string, unknown>,
    parentId: string | undefined,
    messageType: string,
  ): void {
    const messageId = `${sessionId}-msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // 根据消息类型格式化
    let formattedMessage: FormattedMessage;
    if (messageType === 'user') {
      formattedMessage = this.formatter.formatUserMessage(
        message as {
          type: 'user';
          content: { text: string } | string;
          timestamp: number;
          messageId?: string;
          senderId?: string;
          senderName?: string;
        },
      );
    } else if (messageType === 'assistant') {
      formattedMessage = this.formatter.formatAssistantMessage(
        message as {
          type: 'assistant';
          content: { text: string } | string;
          timestamp: number;
          model?: string;
          tokens?: { input: number; output: number };
          durationMs?: number;
          skillsUsed?: string[];
        },
      );
    } else if (messageType === 'skill:start') {
      formattedMessage = this.formatter.formatSkillStart(
        message as {
          type: 'skill:start';
          skillName: string;
          action: string;
          input: any;
          timestamp: number;
        },
      );
    } else if (messageType === 'skill:end') {
      formattedMessage = this.formatter.formatSkillEnd(
        message as {
          type: 'skill:end';
          skillName: string;
          status: 'success' | 'error';
          output: any;
          durationMs: number;
          timestamp: number;
        },
      );
    } else {
      // 未知类型，使用文本格式
      formattedMessage = {
        msg_type: 'text',
        content: { text: JSON.stringify(message) },
      };
    }

    this.persistence.enqueueMessage({
      id: messageId,
      session_id: sessionId,
      message_type: messageType || 'unknown',
      message_data: JSON.stringify({
        ...formattedMessage,
        _im_meta: { parentId, type: messageType },
      }),
      status: 'pending',
      retry_count: 0,
      parent_id: parentId,
    });

    this.logger.debug(
      `Message enqueued: ${messageId} (session: ${sessionId}, parent: ${parentId || 'none (root message)'})`,
    );

    // 通知 dispatcher
    this.dispatcher.notifyNewMessage(sessionId);
  }

  /**
   * 处理会话结束
   *
   * 流程：
   * 1. 发送会话结束汇总消息（作为独立消息，不回复到任何 thread）
   * 2. 更新会话状态为 completed
   * 3. 停止 worker
   */
  private handleSessionEnd(session: { sessionId: string }): void {
    const sessionId = session.sessionId;
    this.logger.log(`Session ended: ${sessionId}`);

    // 获取会话数据用于格式化结束消息
    const sessionRecord = this.persistence.getSession(sessionId);
    const sessionData = sessionRecord
      ? {
          sessionId: sessionRecord.session_id,
          sessionKey: sessionRecord.session_key,
          user: { id: sessionRecord.user_id, name: sessionRecord.user_name },
          account: sessionRecord.agent_id,
          startTime: sessionRecord.created_at,
          endTime: Date.now(),
          messageCount: 0,
          status: 'completed' as const,
        }
      : {
          sessionId,
          sessionKey: sessionId,
          user: { id: 'unknown', name: 'Unknown User' },
          account: 'unknown',
          startTime: Date.now(),
          endTime: Date.now(),
          messageCount: 0,
          status: 'completed' as const,
        };

    // 创建会话结束消息（作为独立消息发送）
    const endMessage = this.formatter.formatSessionEnd(sessionData);
    const messageId = `${sessionId}-end-${Date.now()}`;

    // 持久化（不设置 parent_id，作为独立消息）
    this.persistence.enqueueMessage({
      id: messageId,
      session_id: sessionId,
      message_type: 'session_end',
      message_data: JSON.stringify({
        ...endMessage,
        _im_meta: { type: 'session_end' },
      }),
      status: 'pending',
      retry_count: 0,
      parent_id: undefined,
    });

    this.logger.debug(`Session end message enqueued: ${messageId}`);

    // 通知 dispatcher 发送
    this.dispatcher.notifyNewMessage(sessionId);

    // 延迟停止 worker（等待消息发送完成）
    setTimeout(() => {
      this.persistence.completeSession(sessionId);
      this.dispatcher.stopWorker(sessionId);
      this.logger.debug(`Session worker stopped: ${sessionId}`);
    }, 3000);
  }

  /**
   * 从 account 字符串提取 agent_id
   *
   * 格式：agent:main:main 或 agent:main:feishu:direct:ou_xxx
   */
  private extractAgentId(account: string): string {
    const parts = account.split(':');
    if (parts.length >= 2) {
      return parts[1]; // main (agent ID)
    }
    return 'default';
  }

  /**
   * 处理 watcher 错误事件，发送通知消息
   */
  private async handleWatcherError(data: {
    agentId: string;
    error: string;
    timestamp: number;
  }): Promise<void> {
    const config = this.configService.getConfig();

    // 检查是否配置了错误通知
    if (!config.im?.enabled || !config.im.channels?.feishu?.enabled) {
      this.logger.warn('IM push disabled, skipping watcher error notification');
      return;
    }

    try {
      // 格式化错误消息
      const errorMessage: FormattedMessage = {
        msg_type: 'text',
        content: {
          text: `[IM Push 告警] SessionManager Watcher 错误

Agent ID: ${data.agentId}
错误信息：${data.error}
发生时间：${new Date(data.timestamp).toISOString()}

Watcher 将尝试自动重启，请检查日志了解详情。`,
        },
      };

      // 直接发送消息（不持久化，避免循环）
      await this.feishuChannel.send(errorMessage);
      this.logger.log('Watcher error notification sent to Feishu');
    } catch (sendError) {
      this.logger.error(
        'Failed to send watcher error notification:',
        sendError as Error,
      );
    }
  }

  /**
   * 获取推送统计
   */
  getStats(): {
    eventListenersRegistered: boolean;
    persistenceStats: {
      activeSessions: number;
      pendingMessages: number;
      sendingMessages: number;
      failedMessages: number;
    };
    dispatcherStatus: {
      activeWorkers: number;
      workerSessionIds: string[];
    };
  } {
    return {
      eventListenersRegistered: this.eventListenersRegistered,
      persistenceStats: this.persistence.getStats(),
      dispatcherStatus: this.dispatcher.getStatus(),
    };
  }

  onModuleDestroy(): void {
    this.removeEventListeners();
    this.logger.log('IM Push Service destroyed');
  }
}
