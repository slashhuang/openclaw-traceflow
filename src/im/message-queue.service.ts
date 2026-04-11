import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

/**
 * 排队等待的消息
 */
export interface QueuedMessage {
  id: string;
  sessionId: string;
  message: any;
  timestamp: number;
  retryCount: number;
  status: 'pending' | 'sending' | 'sent' | 'failed';
  error?: string;
}

/**
 * 每会话消息队列
 * 保证同一会话的消息按 FIFO 顺序串行发送
 */
export class MessageQueue {
  private readonly sessionId: string;
  private readonly messages: QueuedMessage[] = [];
  private processing = false;
  private paused = false;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
  }

  enqueue(message: any): QueuedMessage {
    const queuedMessage: QueuedMessage = {
      id: `${this.sessionId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      sessionId: this.sessionId,
      message,
      timestamp: Date.now(),
      retryCount: 0,
      status: 'pending',
    };
    this.messages.push(queuedMessage);
    return queuedMessage;
  }

  dequeue(): QueuedMessage | null {
    if (this.paused) return null;
    const pending = this.messages.find((m) => m.status === 'pending');
    if (pending) {
      pending.status = 'sending';
      return pending;
    }
    return null;
  }

  markSent(messageId: string): void {
    const msg = this.messages.find((m) => m.id === messageId);
    if (msg) {
      msg.status = 'sent';
      // 从队列中移除已发送的消息
      const index = this.messages.indexOf(msg);
      if (index >= 0) {
        this.messages.splice(index, 1);
      }
    }
  }

  markFailed(messageId: string, error: string): void {
    const msg = this.messages.find((m) => m.id === messageId);
    if (msg) {
      msg.status = 'pending'; // 回退到 pending，等待重试
      msg.error = error;
      msg.retryCount++;
    }
  }

  removeFailed(messageId: string): void {
    const index = this.messages.findIndex((m) => m.id === messageId);
    if (index >= 0) {
      this.messages.splice(index, 1);
    }
  }

  getNextMessage(): QueuedMessage | null {
    if (this.paused || this.processing) return null;
    return this.dequeue();
  }

  setProcessing(value: boolean): void {
    this.processing = value;
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
  }

  size(): number {
    return this.messages.length;
  }

  isProcessing(): boolean {
    return this.processing;
  }

  isPaused(): boolean {
    return this.paused;
  }

  getOldestMessage(): QueuedMessage | undefined {
    return this.messages.find((m) => m.status === 'pending');
  }
}

/**
 * 会话消息队列服务
 * 管理所有会话的消息队列，确保并发安全和顺序
 */
@Injectable()
export class MessageQueueService {
  private readonly logger = new Logger(MessageQueueService.name);

  // 每会话队列
  private queues = new Map<string, MessageQueue>();

  // 正在处理的会话（防止重复处理）
  private processingSessions = new Set<string>();

  constructor(private eventEmitter: EventEmitter2) {}

  /**
   * 获取或创建会话队列
   */
  getOrCreateQueue(sessionId: string): MessageQueue {
    let queue = this.queues.get(sessionId);
    if (!queue) {
      queue = new MessageQueue(sessionId);
      this.queues.set(sessionId, queue);
      this.logger.debug(`Created message queue for session ${sessionId}`);
    }
    return queue;
  }

  /**
   * 获取队列（如果存在）
   */
  getQueue(sessionId: string): MessageQueue | undefined {
    return this.queues.get(sessionId);
  }

  /**
   * 将消息加入队列
   */
  enqueueMessage(sessionId: string, message: any): QueuedMessage {
    const queue = this.getOrCreateQueue(sessionId);
    return queue.enqueue(message);
  }

  /**
   * 标记消息发送成功
   */
  markMessageSent(sessionId: string, messageId: string): void {
    const queue = this.queues.get(sessionId);
    if (queue) {
      queue.markSent(messageId);
      this.emitMessageSentEvent(sessionId, messageId);
    }
  }

  /**
   * 标记消息发送失败（等待重试）
   */
  markMessageFailed(sessionId: string, messageId: string, error: string): void {
    const queue = this.queues.get(sessionId);
    if (queue) {
      queue.markFailed(messageId, error);
    }
  }

  /**
   * 移除失败消息（放弃重试）
   */
  removeFailedMessage(sessionId: string, messageId: string): void {
    const queue = this.queues.get(sessionId);
    if (queue) {
      queue.removeFailed(messageId);
    }
  }

  /**
   * 标记会话正在处理
   */
  setProcessing(sessionId: string, value: boolean): void {
    if (value) {
      this.processingSessions.add(sessionId);
    } else {
      this.processingSessions.delete(sessionId);
    }
  }

  /**
   * 检查会话是否正在处理
   */
  isProcessing(sessionId: string): boolean {
    return this.processingSessions.has(sessionId);
  }

  /**
   * 获取所有有待处理消息的会话
   */
  getSessionWithPendingMessages(): string[] {
    const sessions: string[] = [];
    for (const [sessionId, queue] of this.queues.entries()) {
      if (queue.size() > 0 && !queue.isPaused()) {
        sessions.push(sessionId);
      }
    }
    return sessions;
  }

  /**
   * 清理已完成的会话队列
   */
  cleanupSession(sessionId: string): void {
    const queue = this.queues.get(sessionId);
    if (queue) {
      queue.pause();
      this.queues.delete(sessionId);
      this.logger.debug(`Cleaned up message queue for session ${sessionId}`);
    }
  }

  /**
   * 发送消息已处理事件
   */
  private emitMessageSentEvent(sessionId: string, messageId: string): void {
    this.eventEmitter.emit('im.message.sent', { sessionId, messageId });
  }
}
