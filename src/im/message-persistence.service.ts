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
 * 会话记录
 */
export interface SessionRecord {
  session_id: string;
  session_key: string;
  agent_id: string;
  user_id: string;
  user_name: string;
  thread_id?: string;
  parent_message_id?: string;
  status: 'active' | 'completed' | 'failed';
  created_at: number;
  updated_at: number;
  completed_at?: number;
}

/**
 * 消息记录
 */
export interface MessageRecord {
  id: string;
  session_id: string;
  seq: number; // 序列号，保证顺序
  message_type: string;
  message_data: string; // JSON
  status: 'pending' | 'sending' | 'sent' | 'failed';
  retry_count: number;
  error?: string;
  parent_id?: string;
  sent_message_id?: string; // 飞书返回的消息 ID
  created_at: number;
  sent_at?: number;
}

/**
 * 待发送消息（运行时，包含元数据）
 */
export interface PendingMessage extends MessageRecord {
  _meta?: {
    type?: string;
    parentId?: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any;
  };
}

/**
 * 消息持久化服务（增强版）
 *
 * 设计原则：
 * 1. SQLite 作为单一事实来源
 * 2. 会话和消息完全解耦
 * 3. 支持多 Agent/多用户并发
 * 4. 服务重启后完整恢复
 */
@Injectable()
export class MessagePersistenceService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(MessagePersistenceService.name);
  private db?: Database;
  private dbPath: string;
  private sequenceCache = new Map<string, number>(); // 每会话序列号缓存

  constructor() {
    const dataDir =
      process.env.TRACEFLOW_DATA_DIR || path.join(process.cwd(), 'data');
    this.dbPath = path.join(dataDir, 'im-messages.db');
  }

  async onModuleInit(): Promise<void> {
    await this.initDatabase();
    await this.rebuildSequenceCache(); // 重建序列号缓存
  }

  async onModuleDestroy(): Promise<void> {
    if (this.db) {
      const data = this.db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(this.dbPath, buffer);
    }

    return Promise.resolve();
  }

  /**
   * 重建序列号缓存（服务重启后从数据库恢复）
   * 确保 seq 连续性，避免重启后 seq 冲突
   */
  private async rebuildSequenceCache(): Promise<void> {
    if (!this.db) return;

    const stmt = this.db.prepare(`
      SELECT session_id, MAX(seq) as maxSeq
      FROM messages
      GROUP BY session_id
    `);

    while (stmt.step()) {
      const row = stmt.getAsObject() as { session_id: string; maxSeq: number };
      if (row.session_id && row.maxSeq) {
        this.sequenceCache.set(row.session_id, row.maxSeq);
      }
    }
    stmt.free();

    this.logger.debug(
      `Sequence cache rebuilt: ${this.sequenceCache.size} sessions`,
    );
  }

  private async initDatabase(): Promise<void> {
    try {
      const SQL = await initSqlJs();

      if (fs.existsSync(this.dbPath)) {
        const fileBuffer = fs.readFileSync(this.dbPath);
        this.db = new SQL.Database(fileBuffer);
        this.logger.log('Loaded existing IM messages database');
      } else {
        this.db = new SQL.Database();
        this.logger.log('Created new IM messages database');
      }

      this.createTables();
      this.createIndexes();
      this.migrateDatabase(); // 运行迁移
      this.saveDatabase();

      this.logger.log('IM messages database initialized');
    } catch (error) {
      this.logger.error(
        'Failed to initialize IM messages database:',
        error as Error,
      );
      this.db = undefined;
    }
  }

  private createTables(): void {
    if (!this.db) return;

    // 会话表：存储会话级信息
    this.db.run(`
      CREATE TABLE IF NOT EXISTS sessions (
        session_id TEXT PRIMARY KEY,
        session_key TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        user_name TEXT NOT NULL,
        thread_id TEXT,
        parent_message_id TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        completed_at INTEGER
      )
    `);

    // 消息表：存储每条消息
    this.db.run(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        seq INTEGER NOT NULL,
        message_type TEXT NOT NULL,
        message_data TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        retry_count INTEGER NOT NULL DEFAULT 0,
        error TEXT,
        parent_id TEXT,
        sent_message_id TEXT,
        created_at INTEGER NOT NULL,
        sent_at INTEGER,
        FOREIGN KEY (session_id) REFERENCES sessions(session_id)
      )
    `);

    // 发送历史表：审计用途
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

  private createIndexes(): void {
    if (!this.db) return;

    // 加速查询
    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_messages_session_status
      ON messages(session_id, status)
    `);

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_messages_pending
      ON messages(status, created_at)
    `);

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_sessions_status
      ON sessions(status)
    `);

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_sessions_agent
      ON sessions(agent_id)
    `);

    this.logger.debug('Database indexes created');
  }

  /**
   * 数据库迁移（添加新列）
   */
  private migrateDatabase(): void {
    if (!this.db) return;

    try {
      // 检查 sent_message_id 列是否存在
      const result = this.db.exec('PRAGMA table_info(messages)');
      const columns = result[0]?.values?.map((row) => row[1] as string) || [];

      if (!columns.includes('sent_message_id')) {
        this.logger.log('Running migration: adding sent_message_id column');
        this.db.run(`
          ALTER TABLE messages ADD COLUMN sent_message_id TEXT
        `);
        this.logger.log('Migration completed: sent_message_id column added');
      }
    } catch (error) {
      this.logger.error('Failed to run database migration:', error as Error);
    }
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
   * 创建或更新会话（原子操作）
   */
  upsertSession(session: Partial<SessionRecord>): void {
    if (!this.db) return;

    const now = Date.now();
    const record: SessionRecord = {
      session_id: session.session_id!,
      session_key: session.session_key || session.session_id!,
      agent_id: session.agent_id || 'default',
      user_id: session.user_id || 'unknown',
      user_name: session.user_name || 'Unknown User',
      thread_id: session.thread_id,
      parent_message_id: session.parent_message_id,
      status: session.status || 'active',
      created_at: session.created_at || now,
      updated_at: now,
      completed_at: session.completed_at,
    };

    // 检查是否已存在
    const existing = this.getSession(session.session_id!);
    if (existing) {
      // 更新
      this.db.run(
        `UPDATE sessions SET
         session_key = ?, agent_id = ?, user_id = ?, user_name = ?,
         thread_id = ?, parent_message_id = ?, status = ?,
         updated_at = ?, completed_at = ?
         WHERE session_id = ?`,
        [
          record.session_key,
          record.agent_id,
          record.user_id,
          record.user_name,
          record.thread_id || null,
          record.parent_message_id || null,
          record.status,
          record.updated_at,
          record.completed_at || null,
          record.session_id,
        ],
      );
      this.logger.debug(`Session updated: ${record.session_id}`);
    } else {
      // 插入
      this.db.run(
        `INSERT INTO sessions
         (session_id, session_key, agent_id, user_id, user_name,
          thread_id, parent_message_id, status, created_at, updated_at, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          record.session_id,
          record.session_key,
          record.agent_id,
          record.user_id,
          record.user_name,
          record.thread_id || null,
          record.parent_message_id || null,
          record.status,
          record.created_at,
          record.updated_at,
          record.completed_at || null,
        ],
      );
      this.logger.debug(`Session created: ${record.session_id}`);
    }

    this.saveDatabase();
  }

  /**
   * 获取会话
   */
  getSession(sessionId: string): SessionRecord | null {
    if (!this.db) return null;

    const stmt = this.db.prepare(`SELECT * FROM sessions WHERE session_id = ?`);
    stmt.bind([sessionId]);

    let result: SessionRecord | null = null;
    if (stmt.step()) {
      result = stmt.getAsObject() as unknown as SessionRecord;
    }
    stmt.free();

    return result;
  }

  /**
   * 获取会话的 thread 信息
   */
  getSessionThread(sessionId: string): {
    thread_id?: string;
    parent_message_id?: string;
  } | null {
    const session = this.getSession(sessionId);
    if (!session) return null;

    return {
      thread_id: session.thread_id || undefined,
      parent_message_id: session.parent_message_id || undefined,
    };
  }

  /**
   * 获取会话中指定类型的最后一条消息
   */
  getLastMessageByType(
    sessionId: string,
    messageType: string,
  ): MessageRecord | null {
    if (!this.db) return null;

    const stmt = this.db.prepare(`
      SELECT * FROM messages
      WHERE session_id = ? AND message_type = ?
      ORDER BY seq DESC
      LIMIT 1
    `);
    stmt.bind([sessionId, messageType]);

    let result: MessageRecord | null = null;
    if (stmt.step()) {
      result = stmt.getAsObject() as unknown as MessageRecord;
    }
    stmt.free();

    return result;
  }

  /**
   * 获取会话中最后一条已发送成功的消息（任何类型）
   */
  getLastSentMessage(sessionId: string): MessageRecord | null {
    if (!this.db) return null;

    const stmt = this.db.prepare(`
      SELECT * FROM messages
      WHERE session_id = ? AND sent_message_id IS NOT NULL
      ORDER BY seq DESC
      LIMIT 1
    `);
    stmt.bind([sessionId]);

    let result: MessageRecord | null = null;
    if (stmt.step()) {
      result = stmt.getAsObject() as unknown as MessageRecord;
    }
    stmt.free();

    return result;
  }

  /**
   * 获取会话中指定类型的第一条已发送消息
   */
  getFirstMessageByType(
    sessionId: string,
    messageType: string,
  ): MessageRecord | null {
    if (!this.db) return null;

    const stmt = this.db.prepare(`
      SELECT * FROM messages
      WHERE session_id = ? AND message_type = ? AND sent_message_id IS NOT NULL
      ORDER BY seq ASC
      LIMIT 1
    `);
    stmt.bind([sessionId, messageType]);

    let result: MessageRecord | null = null;
    if (stmt.step()) {
      result = stmt.getAsObject() as unknown as MessageRecord;
    }
    stmt.free();

    return result;
  }

  /**
   * 设置会话的 thread（父消息）
   */
  setSessionThread(
    sessionId: string,
    threadId: string,
    parentMessageId: string,
  ): void {
    if (!this.db) return;

    this.db.run(
      `UPDATE sessions SET thread_id = ?, parent_message_id = ?, updated_at = ?
       WHERE session_id = ?`,
      [threadId, parentMessageId, Date.now(), sessionId],
    );
    this.saveDatabase();
    this.logger.debug(`Session thread set: ${sessionId} -> ${threadId}`);
  }

  /**
   * 标记会话完成
   */
  completeSession(sessionId: string): void {
    if (!this.db) return;

    this.db.run(
      `UPDATE sessions SET status = 'completed', completed_at = ?, updated_at = ?
       WHERE session_id = ?`,
      [Date.now(), Date.now(), sessionId],
    );
    this.saveDatabase();
  }

  /**
   * 获取或生成下一序列号（保证每会话内 FIFO）
   */
  getNextSequence(sessionId: string): number {
    const cached = this.sequenceCache.get(sessionId);
    const nextSeq = (cached || 0) + 1;
    this.sequenceCache.set(sessionId, nextSeq);
    return nextSeq;
  }

  /**
   * 添加消息到队列（原子操作，自动分配 seq）
   *
   * 注意：如果数据库写入失败，会回滚 sequenceCache
   */
  enqueueMessage(message: Omit<PendingMessage, 'seq' | 'created_at'>): string {
    if (!this.db) return message.id;

    const now = Date.now();
    const seq = this.getNextSequence(message.session_id);

    // 不持久化 _meta，只提取它
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { _meta, ...messageDataToSave } = message;

    const record: MessageRecord = {
      id: message.id,
      session_id: message.session_id,
      seq,
      message_type: message.message_type,
      message_data: message.message_data,
      status: message.status,
      retry_count: message.retry_count || 0,
      error: message.error,
      parent_id: message.parent_id,
      created_at: now,
      sent_at: message.sent_at,
    };

    try {
      this.db.run(
        `INSERT OR REPLACE INTO messages
         (id, session_id, seq, message_type, message_data, status, retry_count, error, parent_id, created_at, sent_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          record.id,
          record.session_id,
          record.seq,
          record.message_type,
          record.message_data,
          record.status,
          record.retry_count,
          record.error || null,
          record.parent_id || null,
          record.created_at,
          record.sent_at || null,
        ],
      );
      this.saveDatabase();

      this.logger.debug(
        `Message enqueued: ${record.id} (session: ${record.session_id}, seq: ${record.seq})`,
      );

      return record.id;
    } catch (error) {
      // 回滚 sequenceCache
      this.sequenceCache.set(record.session_id, seq - 1);
      this.logger.error(
        `Failed to enqueue message, seq cache rolled back: ${message.id}`,
        error as Error,
      );
      throw error;
    }
  }

  /**
   * 获取待发送消息（按会话分组，每会话返回最早的消息）
   */
  getPendingMessages(
    limitPerSession: number = 1,
  ): Map<string, MessageRecord[]> {
    if (!this.db) return new Map();

    // 获取所有有待发送消息的会话
    const sessionStmt = this.db.prepare(`
      SELECT DISTINCT session_id FROM messages
      WHERE status IN ('pending', 'sending')
      ORDER BY created_at ASC
    `);

    const sessions: string[] = [];
    while (sessionStmt.step()) {
      const row = sessionStmt.getAsObject() as { session_id: string };
      if (row.session_id) {
        sessions.push(row.session_id);
      }
    }
    sessionStmt.free();

    const result = new Map<string, MessageRecord[]>();

    // 为每个会话获取待发送消息（按 seq 排序）
    for (const sessionId of sessions) {
      const stmt = this.db.prepare(`
        SELECT * FROM messages
        WHERE session_id = ? AND status IN ('pending', 'sending')
        ORDER BY seq ASC
        LIMIT ?
      `);
      stmt.bind([sessionId, limitPerSession]);

      const messages: MessageRecord[] = [];
      while (stmt.step()) {
        const msg = stmt.getAsObject() as unknown as MessageRecord;
        messages.push(msg);
      }
      stmt.free();

      if (messages.length > 0) {
        result.set(sessionId, messages);
      }
    }

    return result;
  }

  /**
   * 标记消息发送成功
   */
  markMessageSent(
    messageId: string,
    sentAt?: number,
    sentMessageId?: string,
  ): void {
    if (!this.db) return;

    const now = sentAt || Date.now();
    this.db.run(
      `UPDATE messages SET status = 'sent', sent_at = ?, error = NULL, sent_message_id = ?
       WHERE id = ?`,
      [now, sentMessageId || null, messageId],
    );

    this.recordSendHistory(messageId, 'sent');
    this.saveDatabase();

    this.logger.debug(`Message marked as sent: ${messageId}`);
  }

  /**
   * 标记消息发送失败
   */
  markMessageFailed(messageId: string, error: string): void {
    if (!this.db) return;

    this.db.run(
      `UPDATE messages
       SET status = 'pending', retry_count = retry_count + 1, error = ?
       WHERE id = ?`,
      [error, messageId],
    );

    this.recordSendHistory(messageId, 'failed', error);
    this.saveDatabase();

    this.logger.debug(`Message marked as failed: ${messageId}`);
  }

  /**
   * 删除已发送消息（清理）
   */
  removeSentMessage(messageId: string): void {
    if (!this.db) return;

    this.db.run(`DELETE FROM messages WHERE id = ?`, [messageId]);
    this.saveDatabase();
  }

  /**
   * 恢复未完成消息（服务重启时调用）
   */
  recoverPendingMessages(): Map<string, MessageRecord[]> {
    if (!this.db) return new Map();

    // 重置所有"sending"状态为"pending"
    this.db.run(
      `UPDATE messages SET status = 'pending' WHERE status = 'sending'`,
    );
    this.saveDatabase();

    return this.getPendingMessages(100);
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
       SELECT ?, session_id, ?, ?, ?, ? FROM messages WHERE id = ?`,
      [messageId, status, error || null, Date.now(), Date.now(), messageId],
    );
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    activeSessions: number;
    pendingMessages: number;
    sendingMessages: number;
    failedMessages: number;
  } {
    if (!this.db) {
      return {
        activeSessions: 0,
        pendingMessages: 0,
        sendingMessages: 0,
        failedMessages: 0,
      };
    }

    const activeSessions = this.db.exec(
      `SELECT COUNT(*) FROM sessions WHERE status = 'active'`,
    );
    const pending = this.db.exec(
      `SELECT COUNT(*) FROM messages WHERE status = 'pending'`,
    );
    const sending = this.db.exec(
      `SELECT COUNT(*) FROM messages WHERE status = 'sending'`,
    );
    const failed = this.db.exec(
      `SELECT COUNT(*) FROM messages WHERE status = 'failed'`,
    );

    return {
      activeSessions: (activeSessions[0]?.values[0]?.[0] as number) || 0,
      pendingMessages: (pending[0]?.values[0]?.[0] as number) || 0,
      sendingMessages: (sending[0]?.values[0]?.[0] as number) || 0,
      failedMessages: (failed[0]?.values[0]?.[0] as number) || 0,
    };
  }

  /**
   * 清理旧数据
   */
  cleanupOldData(retentionHours: number = 24): {
    cleanedSessions: number;
    cleanedMessages: number;
  } {
    if (!this.db) return { cleanedSessions: 0, cleanedMessages: 0 };

    const cutoffTime = Date.now() - retentionHours * 60 * 60 * 1000;

    // 清理已完成的会话（保留最近 24 小时）
    const sessionStmt = this.db.prepare(
      `SELECT COUNT(*) FROM sessions
       WHERE status = 'completed' AND completed_at < ?`,
    );
    sessionStmt.bind([cutoffTime]);
    let cleanedSessions = 0;
    if (sessionStmt.step()) {
      cleanedSessions = sessionStmt.getAsObject() as unknown as number;
    }
    sessionStmt.free();

    this.db.run(
      `DELETE FROM sessions
       WHERE status = 'completed' AND completed_at < ?`,
      [cutoffTime],
    );

    // 清理已发送的消息
    const messageStmt = this.db.prepare(
      `SELECT COUNT(*) FROM messages WHERE status = 'sent' AND sent_at < ?`,
    );
    messageStmt.bind([cutoffTime]);
    let cleanedMessages = 0;
    if (messageStmt.step()) {
      cleanedMessages = messageStmt.getAsObject() as unknown as number;
    }
    messageStmt.free();

    this.db.run(`DELETE FROM messages WHERE status = 'sent' AND sent_at < ?`, [
      cutoffTime,
    ]);

    // 清理发送历史
    this.db.run(`DELETE FROM send_history WHERE sent_at < ?`, [cutoffTime]);

    this.saveDatabase();

    this.logger.log(
      `Cleaned up ${cleanedSessions} sessions and ${cleanedMessages} messages`,
    );

    return { cleanedSessions, cleanedMessages };
  }
}
