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
  status: 'pending' | 'sending' | 'sent';
}

/**
 * 每会话消息队列
 * 保证同一会话的消息按 FIFO 顺序串行发送
 * 消息失败即丢弃，不重试
 */
export class MessageQueue {
  private readonly sessionId: string;
  private readonly messages: QueuedMessage[] = [];
  private processing = false;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
  }

  enqueue(message: any): QueuedMessage {
    const queuedMessage: QueuedMessage = {
      id: `${this.sessionId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      sessionId: this.sessionId,
      message,
      timestamp: Date.now(),
      status: 'pending',
    };
    this.messages.push(queuedMessage);
    return queuedMessage;
  }

  /**
   * 原子性地取出并标记一条待发送消息（防止并发重复领取）
   */
  dequeue(): QueuedMessage | null {
    const pending = this.messages.find((m) => m.status === 'pending');
    if (pending) {
      pending.status = 'sending';
      return pending;
    }
    return null;
  }

  /**
   * 标记消息已处理（无论成功还是失败丢弃），并从队列移除
   */
  markDone(messageId: string): void {
    const index = this.messages.findIndex((m) => m.id === messageId);
    if (index >= 0) {
      this.messages[index].status = 'sent';
      this.messages.splice(index, 1);
    }
  }

  isProcessing(): boolean {
    return this.processing;
  }

  size(): number {
    return this.messages.length;
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
   * 标记消息已处理（无论成功还是失败丢弃）
   */
  markMessageSent(sessionId: string, messageId: string): void {
    const queue = this.queues.get(sessionId);
    if (queue) {
      queue.markDone(messageId);
      this.emitMessageSentEvent(sessionId, messageId);
    }
  }

  /**
   * 标记消息已处理（失败丢弃场景，与 markMessageSent 语义相同，仅日志区分）
   */
  removeMessage(sessionId: string, messageId: string): void {
    const queue = this.queues.get(sessionId);
    if (queue) {
      queue.markDone(messageId);
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
   * 获取所有有消息的会话
   */
  getSessionsWithMessages(): string[] {
    const sessions: string[] = [];
    for (const [sessionId, queue] of this.queues.entries()) {
      if (queue.size() > 0) {
        sessions.push(sessionId);
      }
    }
    return sessions;
  }

  /**
   * 清理已完成的会话队列
   */
  cleanupSession(sessionId: string): void {
    this.queues.delete(sessionId);
    this.logger.debug(`Cleaned up message queue for session ${sessionId}`);
  }

  /**
   * 发送消息已处理事件
   */
  private emitMessageSentEvent(sessionId: string, messageId: string): void {
    this.eventEmitter.emit('im.message.sent', { sessionId, messageId });
  }
}
