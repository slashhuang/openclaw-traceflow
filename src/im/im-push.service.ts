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
import { MessageQueueService } from './message-queue.service';
import { CircuitBreakerService } from './circuit-breaker.service';
import { MessagePersistenceService } from './message-persistence.service';

/**
 * IM 推送服务（增强版）
 *
 * 架构特性：
 * 1. 每会话独立队列 - 保证消息顺序，互不阻塞
 * 2. 熔断器保护 - API 失败时快速失败，不阻塞后续流程
 * 3. 持久化存储 - 服务重启后恢复未完成消息
 * 4. 指数退避重试 - 失败消息自动重试
 */
@Injectable()
export class ImPushService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ImPushService.name);

  private formatter: FeishuMessageFormatter;

  // 事件监听器是否已注册
  private eventListenersRegistered = false;

  // 会话队列处理器（每会话独立）
  private sessionProcessors = new Map<string, NodeJS.Timeout>();

  // 重试间隔配置（毫秒）
  private readonly RETRY_DELAYS = [1000, 2000, 4000, 8000, 16000]; // 指数退避

  constructor(
    private eventEmitter: EventEmitter2,
    private channelManager: ChannelManager,
    private configService: ConfigService,
    private sessionState: SessionStateService,
    private messageQueue: MessageQueueService,
    private circuitBreakerService: CircuitBreakerService,
    private persistence: MessagePersistenceService,
  ) {
    this.formatter = new FeishuMessageFormatter();
  }

  onModuleInit(): void {
    // 恢复未完成的消息
    this.recoverPendingMessages();

    this.initializeEventListeners();
  }

  /**
   * 恢复服务重启前的待发送消息
   */
  private async recoverPendingMessages(): Promise<void> {
    const pendingMessages = this.persistence.recoverPendingMessages();

    if (pendingMessages.length === 0) return;

    this.logger.log(`Recovering ${pendingMessages.length} pending messages...`);

    // 按会话分组恢复
    const sessions = new Map<string, typeof pendingMessages>();
    for (const msg of pendingMessages) {
      if (!sessions.has(msg.session_id)) {
        sessions.set(msg.session_id, []);
      }
      sessions.get(msg.session_id)!.push(msg);
    }

    // 为每个会话恢复队列
    for (const [sessionId, messages] of sessions.entries()) {
      // 恢复会话状态
      this.sessionState.upsert(sessionId, {
        sessionId,
        sessionKey: sessionId,
        user: { id: 'unknown', name: 'Recovering' },
        account: 'recovered',
        startTime: messages[0]?.created_at || Date.now(),
        status: 'active',
        lastActivity: Date.now(),
      });

      // 恢复消息队列
      for (const msg of messages) {
        try {
          const messageData = JSON.parse(msg.message_data);
          this.messageQueue.enqueueMessage(sessionId, messageData);
        } catch (error) {
          this.logger.error(
            `Failed to recover message ${msg.id}:`,
            error as Error,
          );
        }
      }

      // 启动队列处理器
      this.startSessionProcessor(sessionId);
    }

    this.logger.log(
      `Recovery complete: ${sessions.size} sessions, ${pendingMessages.length} messages`,
    );
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
    const sessionId = session.sessionId;
    this.logger.log(`Session started: ${sessionId}`);

    // 存储会话状态
    const sessionState = this.sessionState.upsert(sessionId, {
      sessionId,
      sessionKey: session.sessionKey,
      user: session.user,
      account: session.account,
      startTime: session.startTime || Date.now(),
      messageCount: session.messageCount || 0,
      status: session.status || 'active',
      firstMessage: session.firstMessage,
    });

    // 创建父消息并持久化
    const parentMessage = this.formatter.formatSessionParent(
      sessionState,
      'active',
    );
    const messageId = `${sessionId}-parent-${Date.now()}`;

    // 持久化消息
    this.persistence.saveMessage({
      id: messageId,
      session_id: sessionId,
      message_type: 'session_parent',
      message_data: JSON.stringify(parentMessage),
      status: 'pending',
      retry_count: 0,
    });

    // 加入队列
    this.messageQueue.enqueueMessage(sessionId, {
      _meta: { type: 'session_parent', messageId },
      ...parentMessage,
    });

    // 启动会话队列处理器
    this.startSessionProcessor(sessionId);
  }

  /**
   * 处理会话消息
   */
  private async handleSessionMessage(data: {
    sessionId: string;
    message: any;
    session: any;
  }): Promise<void> {
    const sessionId = data.sessionId;

    // 获取父消息 ID（从持久化存储）
    const threadInfo = this.persistence.getSessionThread(sessionId);
    const parentId =
      threadInfo?.parent_message_id || this.sessionState.getParentId(sessionId);

    if (!parentId) {
      // 父消息还未创建，将消息加入队列等待
      this.messageQueue.enqueueMessage(sessionId, {
        _meta: { type: data.message.type, waitForParent: true },
        ...data.message,
      });
      this.logger.debug(`Message queued (waiting for parent): ${sessionId}`);
      return;
    }

    // 直接加入队列处理
    this.messageQueue.enqueueMessage(sessionId, {
      _meta: { type: data.message.type, parentId },
      ...data.message,
    });

    // 确保处理器在运行
    if (!this.messageQueue.isProcessing(sessionId)) {
      this.startSessionProcessor(sessionId);
    }
  }

  /**
   * 启动会话队列处理器（每会话独立）
   */
  private startSessionProcessor(sessionId: string): void {
    // 避免重复启动
    if (this.sessionProcessors.has(sessionId)) {
      return;
    }

    this.logger.debug(`Starting processor for session: ${sessionId}`);

    // 立即处理一次
    this.processSessionQueue(sessionId);

    // 定时处理（每 500ms 检查一次）
    const intervalId = setInterval(() => {
      this.processSessionQueue(sessionId);
    }, 500);

    this.sessionProcessors.set(sessionId, intervalId);
  }

  /**
   * 处理会话队列
   */
  private async processSessionQueue(sessionId: string): Promise<void> {
    // 防止并发处理
    if (this.messageQueue.isProcessing(sessionId)) {
      return;
    }

    const queue = this.messageQueue.getQueue(sessionId);
    if (!queue || queue.size() === 0) {
      // 队列为空，检查是否可以清理
      const session = this.sessionState.getSession(sessionId);
      if (session?.status === 'completed') {
        this.stopSessionProcessor(sessionId);
      }
      return;
    }

    this.messageQueue.setProcessing(sessionId, true);

    try {
      // 获取下一条消息
      const queuedMessage = queue.getNextMessage();
      if (!queuedMessage) {
        return;
      }

      // 检查是否需要等待父消息
      if (queuedMessage.message._meta?.waitForParent) {
        const threadInfo = this.persistence.getSessionThread(sessionId);
        if (
          !threadInfo?.parent_message_id &&
          !this.sessionState.getParentId(sessionId)
        ) {
          this.logger.debug(`Still waiting for parent message: ${sessionId}`);
          queue.setProcessing(false);
          return;
        }
        // 父消息已就绪，更新消息
        queuedMessage.message._meta.parentId =
          threadInfo?.parent_message_id ||
          this.sessionState.getParentId(sessionId);
      }

      // 获取熔断器
      const circuitBreaker = this.circuitBreakerService.get('feishu');

      // 使用熔断器执行发送
      const result = await circuitBreaker.executeAndSuppress(
        () => this.sendQueuedMessage(sessionId, queuedMessage),
        undefined,
      );

      if (result) {
        // 发送成功
        this.messageQueue.markMessageSent(sessionId, queuedMessage.id);
        this.persistence.markMessageSent(queuedMessage.id);

        // 如果是父消息，保存 thread 映射
        if (queuedMessage.message._meta?.type === 'session_parent') {
          this.persistence.saveSessionThread(
            sessionId,
            result.message_id,
            result.message_id,
          );
          this.sessionState.setParentId(sessionId, result.message_id);
          this.logger.log(
            `Parent message saved: ${sessionId} -> ${result.message_id}`,
          );
        }

        // 清理已发送消息
        setTimeout(() => {
          this.persistence.removeSentMessage(queuedMessage.id);
        }, 60000); // 1 分钟后清理
      } else {
        // 发送失败（可能是熔断器打开）
        this.messageQueue.markMessageFailed(
          sessionId,
          queuedMessage.id,
          'Circuit breaker open or send failed',
        );
        this.persistence.markMessageFailed(
          queuedMessage.id,
          'Circuit breaker open or send failed',
        );

        // 检查重试次数
        if (queuedMessage.retryCount >= this.RETRY_DELAYS.length) {
          this.logger.error(
            `Message ${queuedMessage.id} exceeded max retries, dropping`,
          );
          this.messageQueue.removeFailedMessage(sessionId, queuedMessage.id);
        }
      }
    } catch (error) {
      this.logger.error(
        `Error processing queue for ${sessionId}:`,
        error as Error,
      );
    } finally {
      queue.setProcessing(false);
    }
  }

  /**
   * 发送队列消息（带重试）
   */
  private async sendQueuedMessage(
    sessionId: string,
    queuedMessage: any,
  ): Promise<{ message_id: string } | null> {
    const message = queuedMessage.message;
    const meta = message._meta;

    // 移除元数据，准备发送
    const { _meta, ...messageContent } = message;

    let parentId: string | undefined;
    if (meta?.parentId) {
      parentId = meta.parentId;
    } else if (meta?.type !== 'session_parent') {
      // 非父消息但没有 parentId，获取 thread 信息
      const threadInfo = this.persistence.getSessionThread(sessionId);
      parentId = threadInfo?.parent_message_id;
    }

    // 使用 ChannelManager 发送
    const result = await this.channelManager.sendToChannel(
      'feishu',
      messageContent,
      {
        reply_id: parentId,
      },
    );

    if (result) {
      this.logger.debug(
        `Message sent: ${sessionId} -> ${result.message_id} (type: ${meta?.type})`,
      );
    }

    return result;
  }

  /**
   * 停止会话处理器
   */
  private stopSessionProcessor(sessionId: string): void {
    const intervalId = this.sessionProcessors.get(sessionId);
    if (intervalId) {
      clearInterval(intervalId);
      this.sessionProcessors.delete(sessionId);
      this.logger.debug(`Processor stopped for session: ${sessionId}`);
    }
  }

  /**
   * 处理会话结束
   */
  private async handleSessionEnd(session: any): Promise<void> {
    const sessionId = session.sessionId;
    this.logger.log(`Session ended: ${sessionId}`);

    // 更新会话状态
    this.sessionState.complete(sessionId);
    this.persistence.completeSessionThread(sessionId);

    // 发送会话结束消息
    const parentId = this.sessionState.getParentId(sessionId);
    if (parentId) {
      const endMessage = this.formatter.formatSessionEnd(session);
      const messageId = `${sessionId}-end-${Date.now()}`;

      // 持久化
      this.persistence.saveMessage({
        id: messageId,
        session_id: sessionId,
        message_type: 'session_end',
        message_data: JSON.stringify(endMessage),
        parent_id: parentId,
        status: 'pending',
        retry_count: 0,
      });

      // 加入队列
      this.messageQueue.enqueueMessage(sessionId, {
        _meta: { type: 'session_end', parentId },
        ...endMessage,
      });

      // 等待队列处理完成后停止处理器
      setTimeout(() => {
        this.stopSessionProcessor(sessionId);
        this.messageQueue.cleanupSession(sessionId);
      }, 5000);
    } else {
      this.stopSessionProcessor(sessionId);
      this.messageQueue.cleanupSession(sessionId);
    }
  }

  /**
   * 获取推送统计
   */
  getStats(): {
    activeSessions: number;
    pendingMessages: number;
    circuitBreakerStats: Map<string, any>;
    persistenceStats: {
      pendingCount: number;
      sentCount: number;
      failedCount: number;
      sessionCount: number;
    };
  } {
    return {
      activeSessions: this.sessionProcessors.size,
      pendingMessages: this.messageQueue.getSessionWithPendingMessages().length,
      circuitBreakerStats: this.circuitBreakerService.getAllStats(),
      persistenceStats: this.persistence.getStats(),
    };
  }

  onModuleDestroy(): void {
    // 停止所有处理器
    for (const sessionId of this.sessionProcessors.keys()) {
      this.stopSessionProcessor(sessionId);
    }

    this.removeEventListeners();
    this.logger.log('IM Push Service destroyed');
  }
}
