import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import initSqlJs, { Database } from 'sql.js';
import * as fs from 'fs';
import * as path from 'path';

/**
 * 持久化消息记录
 */
export interface PersistentMessage {
  id: string;
  session_id: string;
  message_type: string;
  message_data: string; // JSON 字符串
  parent_id?: string;
  created_at: number;
  status: 'pending' | 'sending' | 'sent' | 'failed';
  retry_count: number;
  last_error?: string;
  sent_at?: number;
}

/**
 * 消息持久化服务
 * 使用 SQLite 存储待发送消息，支持服务重启恢复
 */
@Injectable()
export class MessagePersistenceService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(MessagePersistenceService.name);
  private db?: Database;
  private dbPath: string;

  constructor() {
    const dataDir =
      process.env.TRACEFLOW_DATA_DIR || path.join(process.cwd(), 'data');
    this.dbPath = path.join(dataDir, 'im-messages.db');
  }

  async onModuleInit(): Promise<void> {
    await this.initDatabase();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.db) {
      const data = this.db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(this.dbPath, buffer);
    }
  }

  private async initDatabase(): Promise<void> {
    try {
      const SQL = await initSqlJs();

      // 尝试加载现有数据库
      if (fs.existsSync(this.dbPath)) {
        const fileBuffer = fs.readFileSync(this.dbPath);
        this.db = new SQL.Database(fileBuffer);
        this.logger.log('Loaded existing IM messages database');
      } else {
        this.db = new SQL.Database();
        this.logger.log('Created new IM messages database');
      }

      // 创建表结构
      this.createTables();

      // 保存初始状态
      this.saveDatabase();

      this.logger.log('IM messages database initialized');
    } catch (error) {
      this.logger.error(
        'Failed to initialize IM messages database:',
        error as Error,
      );
      // 数据库初始化失败不影响服务启动
      this.db = undefined;
    }
  }

  private createTables(): void {
    if (!this.db) return;

    // 消息表
    this.db.run(`
      CREATE TABLE IF NOT EXISTS pending_messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        message_type TEXT NOT NULL,
        message_data TEXT NOT NULL,
        parent_id TEXT,
        created_at INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        retry_count INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        sent_at INTEGER,
        INDEX idx_session_status (session_id, status),
        INDEX idx_created_at (created_at)
      )
    `);

    // 会话 thread 映射表
    this.db.run(`
      CREATE TABLE IF NOT EXISTS session_threads (
        session_id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL,
        parent_message_id TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'active'
      )
    `);

    // 发送历史表（用于审计和调试）
    this.db.run(`
      CREATE TABLE IF NOT EXISTS send_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        status TEXT NOT NULL,
        error TEXT,
        sent_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      )
    `);

    this.logger.debug('Database tables created');
  }

  private saveDatabase(): void {
    if (!this.db) return;
    try {
      const data = this.db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(this.dbPath, buffer);
    } catch (error) {
      this.logger.error('Failed to save database:', error as Error);
    }
  }

  /**
   * 保存待发送消息
   */
  saveMessage(message: Omit<PersistentMessage, 'created_at'>): void {
    if (!this.db) return;

    const createdAt = Date.now();
    this.db.run(
      `INSERT OR REPLACE INTO pending_messages
       (id, session_id, message_type, message_data, parent_id, created_at, status, retry_count, last_error, sent_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        message.id,
        message.session_id,
        message.message_type,
        message.message_data,
        message.parent_id || null,
        createdAt,
        message.status,
        message.retry_count,
        message.last_error || null,
        message.sent_at || null,
      ],
    );
    this.saveDatabase();
    this.logger.debug(`Message persisted: ${message.id}`);
  }

  /**
   * 获取会话的所有待发送消息（按创建时间排序）
   */
  getPendingMessages(sessionId: string): PersistentMessage[] {
    if (!this.db) return [];

    const stmt = this.db.prepare(
      `SELECT * FROM pending_messages
       WHERE session_id = ? AND status = 'pending'
       ORDER BY created_at ASC`,
    );
    stmt.bind([sessionId]);

    const messages: PersistentMessage[] = [];
    while (stmt.step()) {
      messages.push(stmt.getAsObject() as unknown as PersistentMessage);
    }
    stmt.free();

    return messages;
  }

  /**
   * 获取所有有待发送消息的会话
   */
  getSessionWithPendingMessages(): string[] {
    if (!this.db) return [];

    const stmt = this.db.prepare(
      `SELECT DISTINCT session_id FROM pending_messages WHERE status = 'pending'`,
    );

    const sessions: string[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject() as { session_id: string };
      if (row.session_id) {
        sessions.push(row.session_id);
      }
    }
    stmt.free();

    return sessions;
  }

  /**
   * 标记消息为发送中
   */
  markMessageSending(messageId: string): void {
    if (!this.db) return;

    this.db.run(`UPDATE pending_messages SET status = 'sending' WHERE id = ?`, [
      messageId,
    ]);
    this.saveDatabase();
  }

  /**
   * 标记消息为已发送
   */
  markMessageSent(messageId: string, sentAt?: number): void {
    if (!this.db) return;

    this.db.run(
      `UPDATE pending_messages
       SET status = 'sent', sent_at = ?, last_error = NULL
       WHERE id = ?`,
      [sentAt || Date.now(), messageId],
    );

    // 记录发送历史
    this.recordSendHistory(messageId, 'sent');

    this.saveDatabase();
    this.logger.debug(`Message marked as sent: ${messageId}`);
  }

  /**
   * 标记消息为发送失败
   */
  markMessageFailed(messageId: string, error: string): void {
    if (!this.db) return;

    this.db.run(
      `UPDATE pending_messages
       SET status = 'pending', retry_count = retry_count + 1, last_error = ?
       WHERE id = ?`,
      [error, messageId],
    );

    // 记录发送历史
    this.recordSendHistory(messageId, 'failed', error);

    this.saveDatabase();
    this.logger.debug(`Message marked as failed: ${messageId}`);
  }

  /**
   * 删除已发送的消息（清理）
   */
  removeSentMessage(messageId: string): void {
    if (!this.db) return;

    this.db.run(`DELETE FROM pending_messages WHERE id = ?`, [messageId]);
    this.saveDatabase();
  }

  /**
   * 保存会话 thread 映射
   */
  saveSessionThread(
    sessionId: string,
    threadId: string,
    parentMessageId?: string,
  ): void {
    if (!this.db) return;

    const now = Date.now();
    this.db.run(
      `INSERT OR REPLACE INTO session_threads
       (session_id, thread_id, parent_message_id, created_at, updated_at, status)
       VALUES (?, ?, ?, ?, ?, 'active')`,
      [sessionId, threadId, parentMessageId || null, now, now],
    );
    this.saveDatabase();
    this.logger.debug(`Session thread saved: ${sessionId} -> ${threadId}`);
  }

  /**
   * 获取会话 thread
   */
  getSessionThread(
    sessionId: string,
  ): { thread_id: string; parent_message_id?: string } | null {
    if (!this.db) return null;

    const stmt = this.db.prepare(
      `SELECT thread_id, parent_message_id FROM session_threads WHERE session_id = ?`,
    );
    stmt.bind([sessionId]);

    let result: { thread_id: string; parent_message_id?: string } | null = null;
    if (stmt.step()) {
      const row = stmt.getAsObject() as {
        thread_id: string;
        parent_message_id?: string;
      };
      result = {
        thread_id: row.thread_id,
        parent_message_id: row.parent_message_id,
      };
    }
    stmt.free();

    return result;
  }

  /**
   * 标记会话 thread 为完成
   */
  completeSessionThread(sessionId: string): void {
    if (!this.db) return;

    this.db.run(
      `UPDATE session_threads SET status = 'completed', updated_at = ? WHERE session_id = ?`,
      [Date.now(), sessionId],
    );
    this.saveDatabase();
  }

  /**
   * 恢复未完成的消息
   */
  recoverPendingMessages(): PersistentMessage[] {
    if (!this.db) return [];

    const stmt = this.db.prepare(
      `SELECT * FROM pending_messages WHERE status IN ('pending', 'sending') ORDER BY created_at ASC`,
    );

    const messages: PersistentMessage[] = [];
    while (stmt.step()) {
      const msg = stmt.getAsObject() as unknown as PersistentMessage;
      // 重置"sending"状态为"pending"
      if (msg.status === 'sending') {
        msg.status = 'pending';
      }
      messages.push(msg);
    }
    stmt.free();

    // 重置所有"sending"状态
    this.db.run(
      `UPDATE pending_messages SET status = 'pending' WHERE status = 'sending'`,
    );
    this.saveDatabase();

    this.logger.log(`Recovered ${messages.length} pending messages`);
    return messages;
  }

  /**
   * 记录发送历史
   */
  private recordSendHistory(
    messageId: string,
    status: string,
    error?: string,
  ): void {
    if (!this.db) return;

    this.db.run(
      `INSERT INTO send_history (message_id, session_id, status, error, sent_at, created_at)
       SELECT ?, session_id, ?, ?, ?, ? FROM pending_messages WHERE id = ?`,
      [messageId, status, error || null, Date.now(), Date.now(), messageId],
    );
  }

  /**
   * 清理旧消息（保留最近 24 小时）
   */
  cleanupOldMessages(retentionHours: number = 24): number {
    if (!this.db) return 0;

    const cutoffTime = Date.now() - retentionHours * 60 * 60 * 1000;

    const stmt = this.db.prepare(
      `SELECT COUNT(*) as count FROM pending_messages
       WHERE status = 'sent' AND sent_at < ?`,
    );
    stmt.bind([cutoffTime]);

    let count = 0;
    if (stmt.step()) {
      count = (stmt.getAsObject() as { count: number }).count || 0;
    }
    stmt.free();

    this.db.run(
      `DELETE FROM pending_messages WHERE status = 'sent' AND sent_at < ?`,
      [cutoffTime],
    );
    this.saveDatabase();

    this.logger.log(`Cleaned up ${count} old sent messages`);
    return count;
  }

  /**
   * 获取数据库统计
   */
  getStats(): {
    pendingCount: number;
    sentCount: number;
    failedCount: number;
    sessionCount: number;
  } {
    if (!this.db) {
      return { pendingCount: 0, sentCount: 0, failedCount: 0, sessionCount: 0 };
    }

    const pending = this.db.exec(
      `SELECT COUNT(*) as count FROM pending_messages WHERE status = 'pending'`,
    );
    const sent = this.db.exec(
      `SELECT COUNT(*) as count FROM pending_messages WHERE status = 'sent'`,
    );
    const failed = this.db.exec(
      `SELECT COUNT(*) as count FROM pending_messages WHERE status = 'failed'`,
    );
    const sessions = this.db.exec(
      `SELECT COUNT(DISTINCT session_id) as count FROM pending_messages WHERE status != 'sent'`,
    );

    return {
      pendingCount: (pending[0]?.values[0]?.[0] as number) || 0,
      sentCount: (sent[0]?.values[0]?.[0] as number) || 0,
      failedCount: (failed[0]?.values[0]?.[0] as number) || 0,
      sessionCount: (sessions[0]?.values[0]?.[0] as number) || 0,
    };
  }
}
