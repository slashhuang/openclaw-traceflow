import { Injectable, OnModuleInit } from '@nestjs/common';
import initSqlJs, { Database } from 'sql.js';
import * as path from 'path';
import * as fs from 'fs';
import { OpenClawService } from '../openclaw/openclaw.service';
import { inferInvokedSkillsFromToolCalls } from '../skill-invocation';
import { loadModelPricing, type ModelPricing } from '../config/model-pricing.config';

// 加载价格配置（支持配置文件覆盖）
const MODEL_PRICING = loadModelPricing();

/** 从 sessionKey 或 model 字符串中提取模型名称 */
function extractModelFromSessionKey(sessionKey: string): string | null {
  const parts = sessionKey.split('/');
  for (const part of parts) {
    const lower = part.toLowerCase();
    if (lower.includes('opus') || lower.includes('sonnet') || lower.includes('haiku')) {
      return part;
    }
    if (lower.includes('gpt-')) {
      return part;
    }
    if (lower.includes('gemini')) {
      return part;
    }
    if (lower.includes('grok')) {
      return part;
    }
  }
  return null;
}

/** 计算 token 对应的费用（USD） */
function calculateCost(
  inputTokens: number,
  outputTokens: number,
  model?: string | null,
  cacheReadTokens?: number,
  cacheWriteTokens?: number,
): number {
  if (!model) return 0;

  const pricing = MODEL_PRICING[model] || MODEL_PRICING['claude-sonnet-4-5'];
  if (!pricing) return 0;

  const inputCost = (inputTokens / 1_000_000) * pricing.input;
  const outputCost = (outputTokens / 1_000_000) * pricing.output;
  const cacheReadCost = cacheReadTokens ? (cacheReadTokens / 1_000_000) * (pricing.cacheRead || 0) : 0;
  const cacheWriteCost = cacheWriteTokens ? (cacheWriteTokens / 1_000_000) * (pricing.cacheWrite || 0) : 0;

  return inputCost + outputCost + cacheReadCost + cacheWriteCost;
}

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

/** 按 sessionKey 聚合的 token 消耗（含进行中 + 归档） */
export interface TokenUsageBySessionKey {
  sessionKey: string;
  sessionId?: string;
  totalTokens: number;
  activeTokens: number;
  archivedTokens: number;
  archivedCount: number;
  inputTokens: number;
  outputTokens: number;
  /** 估算费用（USD） */
  estimatedCost?: number;
  /** 模型名称（用于价格计算） */
  model?: string | null;
}

export interface TokenSummaryMetrics {
  totalInput: number;
  totalOutput: number;
  totalTokens: number;
  /** 进行中（活跃 + idle）会话的 token */
  activeInput: number;
  activeOutput: number;
  activeTokens: number;
  /** 归档会话的 token */
  archivedInput: number;
  archivedOutput: number;
  archivedTokens: number;
  tokenCost?: number;
  nearLimitCount: number;
  limitReachedCount: number;
  sessionCount: number;
}

@Injectable()
export class MetricsService implements OnModuleInit {
  private db: Database | null = null;
  private dbPath: string;
  private pendingSaveTimer: NodeJS.Timeout | null = null;
  private toolStatsSnapshot: {
    tools: Array<{ tool: string; count: number; successRate: number }>;
    skills: Array<{ skill: string; count: number }>;
  } = { tools: [], skills: [] };
  private toolStatsSnapshotAt = 0;

  constructor(private readonly openclawService: OpenClawService) {
    this.dbPath = path.join(process.cwd(), 'data', 'metrics.db');
  }

  async onModuleInit() {
    const SQL = await initSqlJs();
    this.db = new SQL.Database();
    await this.initDatabase();
  }

  getToolStatsSnapshot(
    maxAgeMs = 45_000,
  ): { tools: Array<{ tool: string; count: number; successRate: number }>; skills: Array<{ skill: string; count: number }> } | null {
    if (!this.toolStatsSnapshotAt || Date.now() - this.toolStatsSnapshotAt > maxAgeMs) {
      return null;
    }
    return this.toolStatsSnapshot;
  }

  async refreshToolStatsSnapshot(): Promise<{
    tools: Array<{ tool: string; count: number; successRate: number }>;
    skills: Array<{ skill: string; count: number }>;
  }> {
    const sessions = await this.openclawService.listSessions();
    const toolStats = new Map<string, { count: number; success: number }>();
    const skillStats = new Map<string, number>();
    for (const session of sessions) {
      const detail = await this.openclawService.getSessionDetail(session.sessionId);
      if (!detail?.toolCalls?.length) continue;
      for (const tool of detail.toolCalls) {
        const name = tool.name;
        const current = toolStats.get(name) || { count: 0, success: 0 };
        current.count += 1;
        if (tool.success) current.success += 1;
        toolStats.set(name, current);
      }
      for (const { skillName, readCount } of inferInvokedSkillsFromToolCalls(detail.toolCalls)) {
        skillStats.set(skillName, (skillStats.get(skillName) ?? 0) + readCount);
      }
    }
    const tools = Array.from(toolStats.entries())
      .map(([tool, data]) => ({
        tool,
        count: data.count,
        successRate: data.count > 0 ? (data.success / data.count) * 100 : 0,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
    const skills = Array.from(skillStats.entries())
      .map(([skill, count]) => ({ skill, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
    const snapshot = { tools, skills };
    this.toolStatsSnapshot = snapshot;
    this.toolStatsSnapshotAt = Date.now();
    return snapshot;
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
    this.db.run('CREATE INDEX IF NOT EXISTS idx_token_session_id ON token_usage(session_id)');
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
      this.scheduleSaveDatabase();
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

      this.scheduleSaveDatabase();
    } catch (error) {
      console.error('Failed to record token usage:', error);
    }
  }

  /**
   * 从 token_usage 历史记录中查找 sessionId 对应的 sessionKey（用于归档记录映射）
   */
  getSessionKeyForSessionId(sessionId: string): string | null {
    if (!this.db || !sessionId) return null;
    try {
      const result = this.db.exec(
        `SELECT session_key FROM token_usage
         WHERE session_id = ? AND session_key != session_id
         ORDER BY timestamp DESC LIMIT 1`,
        [sessionId],
      );
      if (result.length && result[0].values.length) {
        return result[0].values[0][0] as string;
      }
    } catch {
      /* ignore */
    }
    return null;
  }

  /**
   * 按 sessionKey 聚合 token 消耗（进行中 + 归档）
   * 进行中：取最新一条 active 记录的 total_tokens
   * 归档：SUM 所有 archived 记录的 total_tokens
   * 
   * 优化：使用 OpenClawService.getSession() 获取模型信息（O(1) 查找）
   */
  async getTokenUsageBySessionKey(timeRangeMs: number = 86400000): Promise<TokenUsageBySessionKey[]> {
    if (!this.db) return [];

    const now = Date.now();
    const startTime = now - timeRangeMs;

    const activeResult = this.db.exec(
      `SELECT session_key, session_id, total_tokens, input_tokens, output_tokens
       FROM token_usage
       WHERE timestamp > ${startTime} AND id LIKE 'token-%'
       ORDER BY session_key, timestamp DESC`,
    );

    const archivedResult = this.db.exec(
      `SELECT session_key, SUM(total_tokens), SUM(input_tokens), SUM(output_tokens), COUNT(*)
       FROM token_usage
       WHERE timestamp > ${startTime} AND id LIKE 'archived-%'
       GROUP BY session_key`,
    );

    const sessionKeys = new Set<string>();
    const activeMap = new Map<string, { sessionId?: string; total: number; input: number; output: number }>();
    const archivedMap = new Map<string, { total: number; input: number; output: number; count: number }>();

    if (activeResult.length && activeResult[0].values.length) {
      for (const row of activeResult[0].values) {
        const k = row[0] as string;
        if (!activeMap.has(k)) {
          sessionKeys.add(k);
          activeMap.set(k, {
            sessionId: row[1] as string,
            total: (row[2] as number) || 0,
            input: (row[3] as number) || 0,
            output: (row[4] as number) || 0,
          });
        }
      }
    }

    if (archivedResult.length && archivedResult[0].values.length) {
      for (const row of archivedResult[0].values) {
        const k = row[0] as string;
        sessionKeys.add(k);
        archivedMap.set(k, {
          total: (row[1] as number) || 0,
          input: (row[2] as number) || 0,
          output: (row[3] as number) || 0,
          count: (row[4] as number) || 0,
        });
      }
    }

    // 从 OpenClaw 缓存获取模型信息（O(1) 查找，不再全量扫描）
    const modelMap = new Map<string, string>();
    for (const sessionKey of sessionKeys) {
      const session = await this.openclawService.getSession(sessionKey);
      if (session?.model) {
        modelMap.set(sessionKey, session.model);
      }
    }

    const out: TokenUsageBySessionKey[] = [];
    for (const sessionKey of sessionKeys) {
      const active = activeMap.get(sessionKey);
      const archived = archivedMap.get(sessionKey);
      const activeTokens = active?.total ?? 0;
      const archivedTokens = archived?.total ?? 0;
      const archivedCount = archived?.count ?? 0;
      const inputTokens = (active?.input ?? 0) + (archived?.input ?? 0);
      const outputTokens = (active?.output ?? 0) + (archived?.output ?? 0);
      const model = modelMap.get(sessionKey) || extractModelFromSessionKey(sessionKey);
      const estimatedCost = calculateCost(inputTokens, outputTokens, model);

      out.push({
        sessionKey,
        sessionId: active?.sessionId,
        totalTokens: activeTokens + archivedTokens,
        activeTokens,
        archivedTokens,
        archivedCount,
        inputTokens,
        outputTokens,
        estimatedCost,
        model,
      });
    }
    return out.sort((a, b) => b.totalTokens - a.totalTokens);
  }

  /**
   * 获取每个 sessionKey 的归档次数（用于 sessions 列表）
   */
  async getArchivedCountBySessionKey(): Promise<Record<string, number>> {
    const map: Record<string, number> = {};
    try {
      const archived = await this.openclawService.getArchivedTokenUsageFromResetFiles();
      for (const a of archived) {
        const key = this.getSessionKeyForSessionId(a.sessionId) || a.sessionId;
        map[key] = (map[key] || 0) + 1;
      }
    } catch {
      /* ignore */
    }
    return map;
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

      this.scheduleSaveDatabase();
    } catch (error) {
      console.error('Failed to record token event:', error);
    }
  }

  /**
   * 获取 Token 汇总指标（进行中 / 归档 分开展示）
   * 每个 session_id 只取最新一条记录（避免 30 秒采集导致的重复累加）
   */
  async getTokenSummary(timeRangeMs: number = 86400000): Promise<TokenSummaryMetrics> {
    const empty = {
      totalInput: 0, totalOutput: 0, totalTokens: 0,
      activeInput: 0, activeOutput: 0, activeTokens: 0,
      archivedInput: 0, archivedOutput: 0, archivedTokens: 0,
      nearLimitCount: 0, limitReachedCount: 0, sessionCount: 0,
    };
    if (!this.db) return empty;

    const now = Date.now();
    const startTime = now - timeRangeMs;

    // 进行中（token-%）：每个 session_id 取最新一条
    const activeResult = this.db.exec(
      `WITH latest AS (
         SELECT session_id, input_tokens, output_tokens, total_tokens,
           ROW_NUMBER() OVER (PARTITION BY session_id ORDER BY timestamp DESC) AS rn
         FROM token_usage WHERE timestamp > ? AND id LIKE 'token-%'
       )
       SELECT COALESCE(SUM(input_tokens), 0), COALESCE(SUM(output_tokens), 0),
              COALESCE(SUM(total_tokens), 0), COUNT(DISTINCT session_id)
       FROM latest WHERE rn = 1`,
      [startTime],
    );

    // 归档（archived-%）：每个 session_id 取最新一条（同一归档多次采集会覆盖）
    const archivedResult = this.db.exec(
      `WITH latest AS (
         SELECT session_id, input_tokens, output_tokens, total_tokens,
           ROW_NUMBER() OVER (PARTITION BY session_id ORDER BY timestamp DESC) AS rn
         FROM token_usage WHERE timestamp > ? AND id LIKE 'archived-%'
       )
       SELECT COALESCE(SUM(input_tokens), 0), COALESCE(SUM(output_tokens), 0),
              COALESCE(SUM(total_tokens), 0), COUNT(DISTINCT session_id)
       FROM latest WHERE rn = 1`,
      [startTime],
    );

    const active = activeResult.length ? activeResult[0].values[0] : [0, 0, 0, 0];
    const archived = archivedResult.length ? archivedResult[0].values[0] : [0, 0, 0, 0];
    const activeInput = (active[0] as number) || 0;
    const activeOutput = (active[1] as number) || 0;
    const activeTokens = (active[2] as number) || 0;
    const archivedInput = (archived[0] as number) || 0;
    const archivedOutput = (archived[1] as number) || 0;
    const archivedTokens = (archived[2] as number) || 0;

    const eventResult = this.db.exec(
      `SELECT event_type, COUNT(*) FROM token_events
       WHERE timestamp > ? GROUP BY event_type`,
      [startTime],
    );
    const events = eventResult.length ? eventResult[0].values : [];
    const nearLimitCount = events.find(e => e[0] === 'token:near_limit')?.[1] as number || 0;
    const limitReachedCount = events.find(e => e[0] === 'token:limit_reached')?.[1] as number || 0;

    return {
      totalInput: activeInput + archivedInput,
      totalOutput: activeOutput + archivedOutput,
      totalTokens: activeTokens + archivedTokens,
      activeInput, activeOutput, activeTokens,
      archivedInput, archivedOutput, archivedTokens,
      nearLimitCount,
      limitReachedCount,
      sessionCount: ((active[3] as number) || 0) + ((archived[3] as number) || 0),
    };
  }

  /**
   * 获取 Session Key Token 用量排行
   * 每个 session_id 只取最新一条，再按 session_key 聚合（避免重复累加）
   */
  async getTokenUsageBySession(timeRangeMs: number = 86400000): Promise<TokenUsageBySession[]> {
    if (!this.db) return [];

    const now = Date.now();
    const startTime = now - timeRangeMs;

    const result = this.db.exec(
      `WITH latest_per_session AS (
         SELECT session_key, session_id, input_tokens, output_tokens, total_tokens, utilization, timestamp,
           ROW_NUMBER() OVER (PARTITION BY session_id ORDER BY timestamp DESC) AS rn
         FROM token_usage WHERE timestamp > ? AND id LIKE 'token-%'
       ),
       agg AS (
         SELECT session_key,
                SUM(total_tokens) AS total_tokens,
                SUM(input_tokens) AS input_tokens,
                SUM(output_tokens) AS output_tokens,
                COUNT(*) AS request_count,
                AVG(utilization) AS avg_utilization
         FROM latest_per_session WHERE rn = 1
         GROUP BY session_key
       ),
       ranked AS (
         SELECT session_key, session_id,
                ROW_NUMBER() OVER (PARTITION BY session_key ORDER BY timestamp DESC) AS rn
         FROM latest_per_session
         WHERE rn = 1 AND session_id IS NOT NULL AND session_id != ''
       )
       SELECT a.session_key, r.session_id, a.total_tokens, a.input_tokens, a.output_tokens,
              a.request_count, a.avg_utilization
       FROM agg a
       LEFT JOIN ranked r ON r.session_key = a.session_key AND r.rn = 1
       ORDER BY a.total_tokens DESC
       LIMIT 10`,
      [startTime],
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

  private scheduleSaveDatabase(delayMs = 5_000): void {
    if (this.pendingSaveTimer) {
      return;
    }
    this.pendingSaveTimer = setTimeout(() => {
      this.pendingSaveTimer = null;
      void this.flushDatabase();
    }, delayMs);
  }

  async flushDatabase(): Promise<void> {
    if (!this.db) return;
    try {
      const data = this.db.export();
      const buffer = Buffer.from(data);
      await fs.promises.writeFile(this.dbPath, buffer);
    } catch (error) {
      console.error('Failed to save database:', error);
    }
  }

  getDatabase(): Database | null {
    return this.db;
  }
}
