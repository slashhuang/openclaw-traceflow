import { Injectable, OnModuleInit } from '@nestjs/common';
import initSqlJs, { Database } from 'sql.js';
import * as path from 'path';
import * as fs from 'fs';

export interface HookMetric {
  id: string;
  timestamp: number;
  hook: string;
  sessionKey?: string;
  sessionId?: string;
  toolName?: string;
  durationMs?: number;
  success?: boolean;
  error?: string;
  metadata?: any;
}

export interface TokenUsageMetric {
  id: string;
  timestamp: number;
  sessionKey: string;
  sessionId: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  tokenLimit?: number;
  utilization?: number;
}

export interface TokenEventMetric {
  id: string;
  timestamp: number;
  sessionKey: string;
  sessionId: string;
  eventType: 'token:near_limit' | 'token:limit_reached';
  threshold?: number;
  currentUsage?: number;
  limit?: number;
}

export interface LatencyMetrics {
  p50: number;
  p95: number;
  p99: number;
  count: number;
}

export interface TokenUsageBySession {
  sessionKey: string;
  /** 该 session_key 下最近一条记录的 session_id，用于跳转会话详情 */
  sessionId?: string;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  requestCount: number;
  avgUtilization?: number;
  limitReachedCount?: number;
}

export interface TokenSummaryMetrics {
  totalInput: number;
  totalOutput: number;
  totalTokens: number;
  tokenCost?: number;
  nearLimitCount: number;
  limitReachedCount: number;
  sessionCount: number;
}

@Injectable()
export class MetricsService implements OnModuleInit {
  private db: Database | null = null;
  private dbPath: string;

  constructor() {
    this.dbPath = path.join(process.cwd(), 'data', 'metrics.db');
  }

  async onModuleInit() {
    const SQL = await initSqlJs();
    this.db = new SQL.Database();
    await this.initDatabase();
  }

  private async initDatabase() {
    if (!this.db) return;

    // 确保数据目录存在
    const dataDir = path.dirname(this.dbPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    // 创建表结构
    this.db.run(`
      CREATE TABLE IF NOT EXISTS hook_metrics (
        id TEXT PRIMARY KEY,
        timestamp INTEGER NOT NULL,
        hook TEXT NOT NULL,
        session_key TEXT,
        session_id TEXT,
        tool_name TEXT,
        duration_ms INTEGER,
        success BOOLEAN,
        error TEXT,
        metadata TEXT
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS concurrency_snapshots (
        id TEXT PRIMARY KEY,
        timestamp INTEGER NOT NULL,
        current_concurrent INTEGER NOT NULL,
        max_concurrent INTEGER NOT NULL,
        queue_length INTEGER NOT NULL,
        active_sessions INTEGER NOT NULL
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS session_key_stats (
        hour INTEGER NOT NULL,
        session_key TEXT NOT NULL,
        request_count INTEGER NOT NULL,
        avg_duration_ms INTEGER NOT NULL,
        p95_duration_ms INTEGER NOT NULL,
        error_count INTEGER NOT NULL,
        PRIMARY KEY (hour, session_key)
      )
    `);

    // Token 用量表 - 记录每次会话的 token 消耗
    this.db.run(`
      CREATE TABLE IF NOT EXISTS token_usage (
        id TEXT PRIMARY KEY,
        timestamp INTEGER NOT NULL,
        session_key TEXT NOT NULL,
        session_id TEXT NOT NULL,
        input_tokens INTEGER NOT NULL,
        output_tokens INTEGER NOT NULL,
        total_tokens INTEGER NOT NULL,
        token_limit INTEGER,
        utilization REAL
      )
    `);

    // Token 事件表 - 记录触顶和预警事件
    this.db.run(`
      CREATE TABLE IF NOT EXISTS token_events (
        id TEXT PRIMARY KEY,
        timestamp INTEGER NOT NULL,
        session_key TEXT NOT NULL,
        session_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        threshold REAL,
        current_usage INTEGER,
        token_limit INTEGER
      )
    `);

    // 创建索引
    this.db.run('CREATE INDEX IF NOT EXISTS idx_timestamp ON hook_metrics(timestamp)');
    this.db.run('CREATE INDEX IF NOT EXISTS idx_hook ON hook_metrics(hook)');
    this.db.run('CREATE INDEX IF NOT EXISTS idx_session_key ON hook_metrics(session_key)');
    this.db.run('CREATE INDEX IF NOT EXISTS idx_token_timestamp ON token_usage(timestamp)');
    this.db.run('CREATE INDEX IF NOT EXISTS idx_token_session_key ON token_usage(session_key)');
    this.db.run('CREATE INDEX IF NOT EXISTS idx_token_events_timestamp ON token_events(timestamp)');
    this.db.run('CREATE INDEX IF NOT EXISTS idx_token_events_type ON token_events(event_type)');

    console.log('Metrics database initialized');
  }

  async recordMetric(metric: HookMetric): Promise<void> {
    if (!this.db) return;

    try {
      this.db.run(
        `INSERT OR REPLACE INTO hook_metrics
         (id, timestamp, hook, session_key, session_id, tool_name, duration_ms, success, error, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          metric.id,
          metric.timestamp,
          metric.hook,
          metric.sessionKey || null,
          metric.sessionId || null,
          metric.toolName || null,
          metric.durationMs || null,
          metric.success ? 1 : 0,
          metric.error || null,
          metric.metadata ? JSON.stringify(metric.metadata) : null,
        ],
      );

      // 定期保存到磁盘
      this.saveDatabase();
    } catch (error) {
      console.error('Failed to record metric:', error);
    }
  }

  /**
   * 记录 Token 用量
   */
  async recordTokenUsage(usage: TokenUsageMetric): Promise<void> {
    if (!this.db) return;

    try {
      this.db.run(
        `INSERT OR REPLACE INTO token_usage
         (id, timestamp, session_key, session_id, input_tokens, output_tokens, total_tokens, token_limit, utilization)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          usage.id,
          usage.timestamp,
          usage.sessionKey,
          usage.sessionId,
          usage.inputTokens,
          usage.outputTokens,
          usage.totalTokens,
          usage.tokenLimit || null,
          usage.utilization || null,
        ],
      );

      this.saveDatabase();
    } catch (error) {
      console.error('Failed to record token usage:', error);
    }
  }

  /**
   * 记录 Token 事件（预警/触顶）
   */
  async recordTokenEvent(event: TokenEventMetric): Promise<void> {
    if (!this.db) return;

    try {
      this.db.run(
        `INSERT INTO token_events
         (id, timestamp, session_key, session_id, event_type, threshold, current_usage, token_limit)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          event.id,
          event.timestamp,
          event.sessionKey,
          event.sessionId,
          event.eventType,
          event.threshold || null,
          event.currentUsage || null,
          event.limit || null,
        ],
      );

      this.saveDatabase();
    } catch (error) {
      console.error('Failed to record token event:', error);
    }
  }

  /**
   * 获取 Token 汇总指标
   */
  async getTokenSummary(timeRangeMs: number = 86400000): Promise<TokenSummaryMetrics> {
    if (!this.db) return {
      totalInput: 0,
      totalOutput: 0,
      totalTokens: 0,
      nearLimitCount: 0,
      limitReachedCount: 0,
      sessionCount: 0,
    };

    const now = Date.now();
    const startTime = now - timeRangeMs;

    // 获取 token 总量
    const tokenResult = this.db.exec(
      `SELECT SUM(input_tokens), SUM(output_tokens), SUM(total_tokens), COUNT(DISTINCT session_id)
       FROM token_usage WHERE timestamp > ?`,
      [startTime],
    );

    // 获取预警和触顶次数
    const eventResult = this.db.exec(
      `SELECT event_type, COUNT(*) FROM token_events
       WHERE timestamp > ? GROUP BY event_type`,
      [startTime],
    );

    const totals = tokenResult.length ? tokenResult[0].values[0] : [0, 0, 0, 0];
    const events = eventResult.length ? eventResult[0].values : [];

    const nearLimitCount = events.find(e => e[0] === 'token:near_limit')?.[1] as number || 0;
    const limitReachedCount = events.find(e => e[0] === 'token:limit_reached')?.[1] as number || 0;

    return {
      totalInput: (totals[0] as number) || 0,
      totalOutput: (totals[1] as number) || 0,
      totalTokens: (totals[2] as number) || 0,
      nearLimitCount,
      limitReachedCount,
      sessionCount: (totals[3] as number) || 0,
    };
  }

  /**
   * 获取 Session Key Token 用量排行
   */
  async getTokenUsageBySession(timeRangeMs: number = 86400000): Promise<TokenUsageBySession[]> {
    if (!this.db) return [];

    const now = Date.now();
    const startTime = now - timeRangeMs;

    const result = this.db.exec(
      `WITH agg AS (
         SELECT session_key,
                SUM(total_tokens) AS total_tokens,
                SUM(input_tokens) AS input_tokens,
                SUM(output_tokens) AS output_tokens,
                COUNT(*) AS request_count,
                AVG(utilization) AS avg_utilization
         FROM token_usage
         WHERE timestamp > ?
         GROUP BY session_key
       ),
       ranked AS (
         SELECT session_key, session_id,
                ROW_NUMBER() OVER (PARTITION BY session_key ORDER BY timestamp DESC) AS rn
         FROM token_usage
         WHERE timestamp > ? AND session_id IS NOT NULL AND session_id != ''
       )
       SELECT a.session_key,
              r.session_id,
              a.total_tokens,
              a.input_tokens,
              a.output_tokens,
              a.request_count,
              a.avg_utilization
       FROM agg a
       LEFT JOIN ranked r ON r.session_key = a.session_key AND r.rn = 1
       ORDER BY a.total_tokens DESC
       LIMIT 10`,
      [startTime, startTime],
    );

    if (!result.length) return [];

    // 获取每个 session 的触顶次数
    const limitReachedResult = this.db.exec(
      `SELECT session_key, COUNT(*) as count FROM token_events
       WHERE timestamp > ? AND event_type = 'token:limit_reached'
       GROUP BY session_key`,
      [startTime],
    );

    const limitReachedMap = new Map<string, number>();
    if (limitReachedResult.length) {
      for (const row of limitReachedResult[0].values) {
        limitReachedMap.set(row[0] as string, row[1] as number);
      }
    }

    return result[0].values.map((row) => ({
      sessionKey: row[0] as string,
      sessionId: (row[1] as string) || undefined,
      totalTokens: row[2] as number,
      inputTokens: row[3] as number,
      outputTokens: row[4] as number,
      requestCount: row[5] as number,
      avgUtilization: row[6] as number,
      limitReachedCount: limitReachedMap.get(row[0] as string) || 0,
    }));
  }

  async getLatencyMetrics(timeRangeMs: number = 3600000): Promise<LatencyMetrics> {
    if (!this.db) return { p50: 0, p95: 0, p99: 0, count: 0 };

    const now = Date.now();
    const startTime = now - timeRangeMs;

    const result = this.db.exec(
      `SELECT duration_ms FROM hook_metrics 
       WHERE timestamp > ? AND duration_ms IS NOT NULL
       ORDER BY duration_ms`,
      [startTime],
    );

    if (!result.length || result[0].values.length === 0) {
      return { p50: 0, p95: 0, p99: 0, count: 0 };
    }

    const durations = result[0].values.map((row) => row[0] as number);
    const count = durations.length;

    return {
      p50: this.percentile(durations, 50),
      p95: this.percentile(durations, 95),
      p99: this.percentile(durations, 99),
      count,
    };
  }

  async getToolStats(timeRangeMs: number = 3600000): Promise<Array<{ tool: string; count: number; successRate: number }>> {
    if (!this.db) return [];

    const now = Date.now();
    const startTime = now - timeRangeMs;

    const result = this.db.exec(
      `SELECT tool_name, COUNT(*) as count, SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as success_count
       FROM hook_metrics
       WHERE timestamp > ? AND tool_name IS NOT NULL
       GROUP BY tool_name`,
      [startTime],
    );

    if (!result.length) return [];

    return result[0].values.map((row) => ({
      tool: row[0] as string,
      count: row[1] as number,
      successRate: (row[2] as number) / (row[1] as number) * 100,
    }));
  }

  private percentile(sortedArray: number[], p: number): number {
    if (sortedArray.length === 0) return 0;
    const index = Math.ceil((p / 100) * sortedArray.length) - 1;
    return sortedArray[Math.max(0, index)];
  }

  private saveDatabase(): void {
    if (!this.db) return;

    try {
      const data = this.db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(this.dbPath, buffer);
    } catch (error) {
      console.error('Failed to save database:', error);
    }
  }

  getDatabase(): Database | null {
    return this.db;
  }
}
