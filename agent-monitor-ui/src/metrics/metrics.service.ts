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

export interface LatencyMetrics {
  p50: number;
  p95: number;
  p99: number;
  count: number;
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

    // 创建索引
    this.db.run('CREATE INDEX IF NOT EXISTS idx_timestamp ON hook_metrics(timestamp)');
    this.db.run('CREATE INDEX IF NOT EXISTS idx_hook ON hook_metrics(hook)');
    this.db.run('CREATE INDEX IF NOT EXISTS idx_session_key ON hook_metrics(session_key)');

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
