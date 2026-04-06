import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '../config/config.service';
import { ChannelManager } from './channel-manager';
import {
  MessagePersistenceService,
  MessageRecord,
} from './message-persistence.service';
import {
  CircuitBreakerService,
  CircuitBreaker,
} from './circuit-breaker.service';
import type { SendResult } from './channel.interface';

/**
 * 会话调度器
 * 每会话独立 worker，并行处理不同会话的消息
 */
class SessionWorker {
  private readonly logger = new Logger(SessionWorker.name);
  private processing = false;
  private stopped = false;
  private currentRetry = 0;
  private maxRetries = 5;

  constructor(
    private readonly sessionId: string,
    private readonly persistence: MessagePersistenceService,
    private readonly channelManager: ChannelManager,
    private readonly circuitBreaker: CircuitBreaker,
    private readonly onComplete: () => void,
  ) {}

  /**
   * 启动 worker
   */
  async start(): Promise<void> {
    this.stopped = false;
    await this.process();
  }

  /**
   * 停止 worker
   */
  stop(): void {
    this.stopped = true;
    this.logger.debug(`Worker stopped for session ${this.sessionId}`);
  }

  /**
   * 处理队列
   */
  private async process(): Promise<void> {
    if (this.stopped || this.processing) return;

    this.processing = true;

    try {
      // 获取待发送消息
      const pending = this.persistence.getPendingMessages(1);
      const messages = pending.get(this.sessionId) || [];

      this.logger.warn(
        `Worker processing: sessionId=${this.sessionId}, messages=${messages.length}, pending.size=${pending.size}`,
      );

      if (messages.length === 0) {
        // 检查会话是否已完成
        const session = this.persistence.getSession(this.sessionId);
        if (session?.status === 'completed') {
          this.stopped = true;
          this.onComplete();
          return;
        }
        this.processing = false;
        return;
      }

      for (const message of messages) {
        if (this.stopped) break;

        await this.sendMessage(message);
      }
    } catch (error) {
      this.logger.error(`Worker error for ${this.sessionId}:`, error as Error);
    } finally {
      this.processing = false;
    }

    // 继续处理下一条
    if (!this.stopped) {
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      setTimeout(() => this.process(), 500);
    }
  }

  /**
   * 发送单条消息
   */
  private async sendMessage(message: MessageRecord): Promise<void> {
    const messageData = JSON.parse(message.message_data);
    const _im_meta = messageData._im_meta;
    const content = messageData as Omit<typeof messageData, '_im_meta'>;
    const messageType = message.message_type;

    // 获取 reply_id：用于飞书回复消息
    // 对于 assistant/skill 消息，使用会话中第一条 user 消息作为回复目标
    let replyId: string | undefined;

    if (
      messageType === 'assistant' ||
      messageType === 'skill:start' ||
      messageType === 'skill:end'
    ) {
      // 获取会话中第一条 user 消息作为回复目标
      const firstUserMessage = this.persistence.getFirstMessageByType(
        this.sessionId,
        'user',
      );
      replyId = firstUserMessage?.sent_message_id;

      this.logger.warn(
        `Looking for user message: sessionId=${this.sessionId}, firstUserMessage=${firstUserMessage ? 'found' : 'not found'}, sent_message_id=${firstUserMessage?.sent_message_id || 'N/A'}`,
      );

      if (!replyId) {
        // 没有找到 user 消息，跳过发送（避免刷屏）
        this.logger.warn(
          `Skipping ${messageType} message: no user message found for reply in session ${this.sessionId}`,
        );
        // 标记消息为完成（跳过）
        this.persistence.markMessageSent(message.id, undefined, 'skipped');
        return;
      }
    }

    // 使用熔断器发送
    const result =
      await this.circuitBreaker.executeAndSuppress<SendResult | null>(
        async () =>
          this.channelManager.sendToChannel('feishu', content as never, {
            reply_id: replyId || undefined,
          }),
        null,
      );

    if (result) {
      this.persistence.markMessageSent(
        message.id,
        undefined,
        result.message_id,
      );
      this.currentRetry = 0;

      // 清理已发送消息
      void setTimeout(() => {
        this.persistence.removeSentMessage(message.id);
      }, 60000);

      this.logger.debug(
        `Message sent: ${this.sessionId} -> ${result.message_id}`,
      );
    } else {
      this.persistence.markMessageFailed(
        message.id,
        'Send failed or circuit breaker open',
      );
      this.currentRetry++;

      if (this.currentRetry >= this.maxRetries) {
        this.logger.error(
          `Message ${message.id} exceeded max retries, dropping`,
        );
        // 从数据库中删除失败消息，防止无限重试
        this.persistence.removeSentMessage(message.id);
        return;
      }
    }
  }
}

/**
 * 消息调度服务
 *
 * 职责：
 * 1. 管理所有会话的 worker
 * 2. 并行处理多会话消息
 * 3. 每会话严格 FIFO
 */
@Injectable()
export class MessageDispatcherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MessageDispatcherService.name);

  // 活跃 worker
  private workers = new Map<string, SessionWorker>();

  // 调度定时器
  private schedulerInterval?: NodeJS.Timeout;

  // 清理定时器
  private cleanupInterval?: NodeJS.Timeout;

  constructor(
    private eventEmitter: EventEmitter2,
    private configService: ConfigService,
    private channelManager: ChannelManager,
    private persistence: MessagePersistenceService,
    private circuitBreakerService: CircuitBreakerService,
  ) {}

  onModuleInit(): void {
    // 不恢复历史消息，只处理启动后的新消息
    // 如果数据库中没有第一条 user 消息，该会话将被跳过

    // 启动调度器（每 500ms 扫描新消息）
    this.schedulerInterval = setInterval(() => {
      this.schedulePendingMessages();
    }, 500);

    // 启动清理任务（每小时清理一次）
    this.cleanupInterval = setInterval(
      () => {
        void this.persistence.cleanupOldData(24);
      },
      60 * 60 * 1000,
    );

    this.logger.log('MessageDispatcher started');
  }

  onModuleDestroy(): void {
    if (this.schedulerInterval) {
      clearInterval(this.schedulerInterval);
    }
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    // 停止所有 worker
    for (const worker of this.workers.values()) {
      worker.stop();
    }
    this.workers.clear();

    this.logger.log('MessageDispatcher stopped');
  }

  /**
   * 调度待发送消息
   */
  private schedulePendingMessages(): void {
    const pending = this.persistence.getPendingMessages(1);

    this.logger.debug(
      `Scheduler tick: ${pending.size} sessions with pending messages`,
    );

    for (const sessionId of pending.keys()) {
      // 确保 worker 存在
      this.getOrCreateWorker(sessionId);
    }
  }

  /**
   * 获取或创建 worker
   */
  private getOrCreateWorker(sessionId: string): SessionWorker {
    let worker = this.workers.get(sessionId);
    if (!worker) {
      const circuitBreaker = this.circuitBreakerService.get('feishu');
      worker = new SessionWorker(
        sessionId,
        this.persistence,
        this.channelManager,
        circuitBreaker,
        () => {
          // worker 完成回调
          this.workers.delete(sessionId);
        },
      );
      this.workers.set(sessionId, worker);
      this.logger.debug(`Created worker for session ${sessionId}`);

      // 启动 worker (fire and forget)
      setImmediate(() => {
        void worker?.start();
      });
    }
    return worker;
  }

  /**
   * 通知 worker 有新消息（避免等待轮询）
   */
  notifyNewMessage(sessionId: string): void {
    const worker = this.getOrCreateWorker(sessionId);
    // 如果 worker 存在但未在处理（可能在等待轮询），立即触发一次处理
    setImmediate(() => {
      // 通过调用 start() 触发立即检查，start() 会检查 processing 标志
      void worker.start();
    });
  }

  /**
   * 停止会话 worker（会话完成时调用）
   */
  stopWorker(sessionId: string): void {
    const worker = this.workers.get(sessionId);
    if (worker) {
      worker.stop();
      this.workers.delete(sessionId);
      this.logger.debug(`Worker stopped for session ${sessionId}`);
    }
  }

  /**
   * 获取调度器状态
   */
  getStatus(): {
    activeWorkers: number;
    workerSessionIds: string[];
  } {
    return {
      activeWorkers: this.workers.size,
      workerSessionIds: Array.from(this.workers.keys()),
    };
  }
}
