import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '../config/config.service';
import * as fs from 'fs';
import { createHash } from 'crypto';
import { GatewayConnectionService } from '../openclaw/gateway-connection.service';
import * as path from 'path';

export interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  content: string;
  source?: 'gateway' | 'traceflow';
}

@Injectable()
export class LogsService {
  private readonly logger = new Logger(LogsService.name);
  private gatewayLogTailer: import('chokidar').FSWatcher | null = null;
  private traceflowLogTailer: import('chokidar').FSWatcher | null = null;
  private logSubscribers: Set<(entry: LogEntry) => void> = new Set();

  // OpenClaw Gateway tail via `logs.tail` cursor protocol
  private gatewayCursor: number | null = null;
  private gatewayTimer: NodeJS.Timeout | null = null;
  private gatewayPollInFlight = false;
  private gatewaySuppressNextEmit = false;
  private gatewaySubscribers: Set<(entry: LogEntry) => void> = new Set();
  private gatewayPollOptions: {
    limit: number;
    pollIntervalMs: number;
    maxBytes: number;
  } | null = null;
  private gatewayCurrentPollMs = 1500;
  private gatewayFailureCount = 0;
  private gatewayNoNewDataCount = 0;
  private gatewayDedupeOrder: string[] = [];
  private gatewayDedupeSet: Set<string> = new Set();
  private readonly gatewayDedupeMax = 1000;

  // TraceFlow 自身日志
  private traceflowLogPath: string | null = null;

  constructor(
    private configService: ConfigService,
    private gatewayConnection: GatewayConnectionService,
  ) {}

  /**
   * 启动日志追踪 - Gateway 日志和 TraceFlow 日志
   */
  async startTailing(gatewayLogPath?: string): Promise<void> {
    const config = this.configService.getConfig();
    
    // 1. 启动 Gateway 日志追踪
    if (gatewayLogPath) {
      await this.startGatewayTailing(gatewayLogPath);
    }

    // 2. 启动 TraceFlow 自身日志追踪
    this.traceflowLogPath = path.join(config.dataDir, 'traceflow.log');
    await this.startTraceflowTailing(this.traceflowLogPath);
  }

  /**
   * 启动 Gateway 日志追踪
   */
  private async startGatewayTailing(logPath: string): Promise<void> {
    if (!fs.existsSync(logPath)) {
      this.logger.warn(`Gateway log file does not exist: ${logPath}`);
      return;
    }

    try {
      const chokidar = await import('chokidar');
      this.gatewayLogTailer = chokidar.watch(logPath, { persistent: true });

      let lastSize = fs.statSync(logPath).size;

      this.gatewayLogTailer.on('change', () => {
        try {
          const stats = fs.statSync(logPath);
          if (stats.size > lastSize) {
            const fd = fs.openSync(logPath, 'r');
            const buffer = Buffer.alloc(stats.size - lastSize);
            fs.readSync(fd, buffer, 0, buffer.length, lastSize);
            fs.closeSync(fd);

            const newLines = buffer
              .toString('utf-8')
              .split('\n')
              .filter((line) => line.trim());
            for (const line of newLines) {
              const entry = this.parseLogLine(line, 'gateway');
              this.notifySubscribers(entry);
            }

            lastSize = stats.size;
          }
        } catch (err) {
          this.logger.error('Error reading gateway log file:', err);
        }
      });

      this.logger.log(`Started tailing gateway logs from: ${logPath}`);
    } catch (error: any) {
      this.logger.error('Failed to start gateway log tailing:', error?.message || error);
    }
  }

  /**
   * 启动 TraceFlow 自身日志追踪
   */
  private async startTraceflowTailing(logPath: string): Promise<void> {
    // 确保日志文件存在
    const logDir = path.dirname(logPath);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    if (!fs.existsSync(logPath)) {
      fs.writeFileSync(logPath, '', 'utf-8');
    }

    try {
      const chokidar = await import('chokidar');
      this.traceflowLogTailer = chokidar.watch(logPath, { persistent: true });

      let lastSize = fs.statSync(logPath).size;

      this.traceflowLogTailer.on('change', () => {
        try {
          const stats = fs.statSync(logPath);
          if (stats.size > lastSize) {
            const fd = fs.openSync(logPath, 'r');
            const buffer = Buffer.alloc(stats.size - lastSize);
            fs.readSync(fd, buffer, 0, buffer.length, lastSize);
            fs.closeSync(fd);

            const newLines = buffer
              .toString('utf-8')
              .split('\n')
              .filter((line) => line.trim());
            for (const line of newLines) {
              const entry = this.parseLogLine(line, 'traceflow');
              this.notifySubscribers(entry);
            }

            lastSize = stats.size;
          }
        } catch (err) {
          this.logger.error('Error reading traceflow log file:', err);
        }
      });

      this.logger.log(`Started tailing traceflow logs from: ${logPath}`);
    } catch (error: any) {
      this.logger.error('Failed to start traceflow log tailing:', error?.message || error);
    }
  }

  /**
   * 订阅日志更新
   */
  subscribe(callback: (entry: LogEntry) => void): () => void {
    this.logSubscribers.add(callback);
    return () => {
      this.logSubscribers.delete(callback);
    };
  }

  private notifySubscribers(entry: LogEntry) {
    for (const subscriber of this.logSubscribers) {
      try {
        subscriber(entry);
      } catch (error) {
        this.logger.error('Error in log subscriber:', error);
      }
    }
  }

  /**
   * 映射 Gateway tail payload 到日志条目（用于 dashboard bundle）
   */
  mapGatewayTailPayloadToEntries(payload: {
    cursor?: number;
    lines: string[];
  }): LogEntry[] {
    if (typeof payload.cursor === 'number') {
      this.gatewayCursor = payload.cursor;
    }
    const rawLines = payload.lines.filter(
      (l) => typeof l === 'string' && l.trim().length > 0,
    );
    for (const line of rawLines) {
      this.rememberGatewayLine(line);
    }
    return rawLines.map((l) => this.parseLogLine(l, 'gateway'));
  }

  /**
   * 获取 Gateway 最近日志
   */
  async getGatewayRecentLogs(limit: number = 100): Promise<LogEntry[]> {
    const config = this.configService.getConfig();
    const logPath = config.openclawLogPath;
    
    if (!logPath) {
      this.logger.warn('Gateway log file path not configured (OPENCLAW_LOG_PATH)');
      return [];
    }

    try {
      if (!fs.existsSync(logPath)) {
        this.logger.warn(`Gateway log file does not exist: ${logPath}`);
        return [];
      }

      const content = fs.readFileSync(logPath, 'utf-8');
      const lines = content.split('\n').filter((line) => line.trim());
      const rawLines = lines.slice(-limit);
      
      return rawLines.map((l) => this.parseLogLine(l, 'gateway'));
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to get gateway recent logs: ${msg}`);
      return [];
    }
  }

  /**
   * 获取 TraceFlow 最近日志
   */
  async getTraceflowRecentLogs(limit: number = 100): Promise<LogEntry[]> {
    const logPath = this.traceflowLogPath || path.join(this.configService.getConfig().dataDir, 'traceflow.log');
    
    try {
      if (!fs.existsSync(logPath)) {
        // 文件不存在时返回空数组（首次启动）
        return [];
      }

      const content = fs.readFileSync(logPath, 'utf-8');
      const lines = content.split('\n').filter((line) => line.trim());
      const rawLines = lines.slice(-limit);
      
      return rawLines.map((l) => this.parseLogLine(l, 'traceflow'));
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to get traceflow recent logs: ${msg}`);
      return [];
    }
  }

  /**
   * 订阅 Gateway 日志（WebSocket 实时推送）
   */
  subscribeGatewayLogs(
    callback: (entry: LogEntry) => void,
    opts?: Partial<{ limit: number; pollIntervalMs: number; maxBytes: number }>,
  ): () => void {
    this.gatewaySubscribers.add(callback);

    if (!this.gatewayTimer) {
      const limit =
        typeof opts?.limit === 'number' &&
        Number.isFinite(opts.limit) &&
        opts.limit > 0
          ? Math.floor(opts.limit)
          : 200;
      const pollIntervalMs =
        typeof opts?.pollIntervalMs === 'number' &&
        Number.isFinite(opts.pollIntervalMs) &&
        opts.pollIntervalMs > 0
          ? Math.floor(opts.pollIntervalMs)
          : 1500;
      const maxBytes =
        typeof opts?.maxBytes === 'number' &&
        Number.isFinite(opts.maxBytes) &&
        opts.maxBytes > 0
          ? Math.floor(opts.maxBytes)
          : 1_000_000;

      this.gatewayPollOptions = { limit, pollIntervalMs, maxBytes };
      this.gatewayCurrentPollMs = pollIntervalMs;
      this.gatewayFailureCount = 0;
      this.gatewayNoNewDataCount = 0;
      this.gatewaySuppressNextEmit = this.gatewayCursor == null;
      this.scheduleGatewayPoll();

      void this.pollGatewayTailOnce();
    }

    return () => {
      this.gatewaySubscribers.delete(callback);
      if (this.gatewaySubscribers.size === 0) {
        if (this.gatewayTimer) {
          clearInterval(this.gatewayTimer);
          this.gatewayTimer = null;
        }
        this.gatewayPollOptions = null;
      }
    };
  }

  private scheduleGatewayPoll() {
    if (this.gatewayTimer) {
      clearInterval(this.gatewayTimer);
    }
    this.gatewayTimer = setInterval(() => {
      void this.pollGatewayTailOnce();
    }, this.gatewayCurrentPollMs);
  }

  private updateGatewayPollInterval(nextMs: number): void {
    const normalized = Math.max(500, Math.floor(nextMs));
    if (normalized === this.gatewayCurrentPollMs) return;
    this.gatewayCurrentPollMs = normalized;
    this.scheduleGatewayPoll();
  }

  private async pollGatewayTailOnce(): Promise<void> {
    if (this.gatewayPollInFlight) return;
    if (!this.gatewayPollOptions) return;

    this.gatewayPollInFlight = true;
    try {
      const config = this.configService.getConfig();
      const gatewayHttpUrl = config.openclawGatewayUrl?.trim();
      if (!gatewayHttpUrl) return;

      const { limit, maxBytes } = this.gatewayPollOptions;
      const cursorToUse = this.gatewayCursor ?? undefined;

      const res = await this.gatewayConnection.request<{
        cursor?: number;
        lines?: string[];
        truncated?: boolean;
        reset?: boolean;
      }>(
        'logs.tail',
        {
          cursor: cursorToUse,
          limit,
          maxBytes,
        },
        8000,
      );

      if (!res.ok || !res.payload) {
        this.gatewayFailureCount += 1;
        this.gatewayNoNewDataCount = 0;
        const base = this.gatewayPollOptions?.pollIntervalMs || 1500;
        this.updateGatewayPollInterval(
          Math.min(60_000, base * 2 ** Math.min(this.gatewayFailureCount, 6)),
        );
        return;
      }
      if (this.gatewayFailureCount > 0 || this.gatewayNoNewDataCount > 0) {
        this.gatewayFailureCount = 0;
        this.gatewayNoNewDataCount = 0;
        this.updateGatewayPollInterval(
          this.gatewayPollOptions?.pollIntervalMs || 1500,
        );
      }

      if (typeof res.payload.cursor === 'number') {
        this.gatewayCursor = res.payload.cursor;
      }

      const rawLines = Array.isArray(res.payload.lines)
        ? res.payload.lines.filter(
            (l): l is string => typeof l === 'string' && l.trim().length > 0,
          )
        : [];

      if (rawLines.length === 0) {
        this.gatewayNoNewDataCount += 1;
        const base = this.gatewayPollOptions?.pollIntervalMs || 1500;
        this.updateGatewayPollInterval(
          Math.min(60_000, base * 2 ** Math.min(this.gatewayNoNewDataCount, 5)),
        );
      } else if (this.gatewayNoNewDataCount > 0) {
        this.gatewayNoNewDataCount = 0;
        this.updateGatewayPollInterval(
          this.gatewayPollOptions?.pollIntervalMs || 1500,
        );
      }

      const resetOrTruncated = Boolean(
        res.payload.reset || res.payload.truncated,
      );
      if (resetOrTruncated) {
        this.gatewayDedupeOrder = [];
        this.gatewayDedupeSet.clear();
      }

      for (const line of rawLines) {
        const firstTime = this.rememberGatewayLine(line);
        if (!firstTime) continue;
        if (this.gatewaySuppressNextEmit) continue;

        const entry = this.parseLogLine(line, 'gateway');
        for (const subscriber of this.gatewaySubscribers) {
          try {
            subscriber(entry);
          } catch (e) {
            this.logger.error('Error in gateway log subscriber:', e);
          }
        }
      }

      if (this.gatewaySuppressNextEmit) {
        this.gatewaySuppressNextEmit = false;
      }
    } finally {
      this.gatewayPollInFlight = false;
    }
  }

  private rememberGatewayLine(line: string): boolean {
    const h = createHash('sha1').update(line).digest('hex');
    if (this.gatewayDedupeSet.has(h)) return false;
    this.gatewayDedupeSet.add(h);
    this.gatewayDedupeOrder.push(h);
    if (this.gatewayDedupeOrder.length > this.gatewayDedupeMax) {
      const removed = this.gatewayDedupeOrder.shift();
      if (removed) this.gatewayDedupeSet.delete(removed);
    }
    return true;
  }

  /**
   * 解析日志行
   */
  private parseLogLine(line: string, source: 'gateway' | 'traceflow' = 'gateway'): LogEntry {
    const trimmed = line.trim();
    if (!trimmed) {
      return {
        timestamp: new Date().toISOString(),
        level: 'info',
        content: '',
        source,
      };
    }

    // 尝试解析 JSON 格式日志
    try {
      const obj = JSON.parse(trimmed) as unknown;
      if (obj && typeof obj === 'object') {
        const o = obj as unknown as Record<string, unknown>;
        const meta =
          o['_meta'] && typeof o['_meta'] === 'object'
            ? (o['_meta'] as Record<string, unknown>)
            : null;

        const timeStr =
          typeof o['time'] === 'string'
            ? o['time']
            : meta && typeof meta['date'] === 'string'
              ? meta['date']
              : null;

        const rawLevel =
          meta &&
          (typeof meta['logLevelName'] === 'string'
            ? meta['logLevelName']
            : typeof meta['level'] === 'string'
              ? meta['level']
              : typeof meta['logLevel'] === 'string'
                ? meta['logLevel']
                : undefined);

        const normalizedLevel =
          typeof rawLevel === 'string'
            ? this.normalizeLogLevel(rawLevel)
            : ('info' as LogEntry['level']);

        const parseMaybeJsonString = (
          value: unknown,
        ): Record<string, unknown> | null => {
          if (typeof value !== 'string') return null;
          const v = value.trim();
          if (!v.startsWith('{') || !v.endsWith('}')) return null;
          try {
            const parsed = JSON.parse(v) as unknown;
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
              return parsed as Record<string, unknown>;
          } catch {
            // ignore
          }
          return null;
        };

        const contextCandidate =
          typeof o['0'] === 'string'
            ? o['0']
            : meta && typeof meta['name'] === 'string'
              ? meta['name']
              : null;

        const contextObj = parseMaybeJsonString(contextCandidate);
        const subsystem =
          contextObj && typeof contextObj['subsystem'] === 'string'
            ? contextObj['subsystem']
            : contextObj && typeof contextObj['module'] === 'string'
              ? contextObj['module']
              : null;

        const message =
          (typeof o['1'] === 'string'
            ? o['1']
            : typeof o['2'] === 'string'
              ? o['2']
              : typeof o['message'] === 'string'
                ? o['message']
                : null) ??
          (contextCandidate && !contextObj ? contextCandidate : null) ??
          trimmed;

        const timestamp = timeStr
          ? (() => {
              const dt = new Date(timeStr);
              return Number.isNaN(dt.getTime())
                ? new Date().toISOString()
                : dt.toISOString();
            })()
          : new Date().toISOString();

        return {
          timestamp,
          level: normalizedLevel,
          content: subsystem ? `[${subsystem}] ${message}` : message,
          source,
        };
      }
    } catch {
      // ignore and fall back to regex formats
    }

    // 尝试匹配标准日志格式：[TIMESTAMP] [LEVEL] content
    const match = trimmed.match(/^\[([^\]]+)\]\s*\[([^\]]+)\]\s*(.*)$/);

    if (match) {
      return {
        timestamp: match[1],
        level: this.normalizeLogLevel(match[2]),
        content: match[3],
        source,
      };
    }

    // 尝试匹配简单格式：TIMESTAMP LEVEL content
    const simpleMatch = trimmed.match(
      /^(\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}[.\d]*)\s*(INFO|WARN|ERROR|DEBUG|LOG|VERBOSE)\s+(.*)$/i,
    );

    if (simpleMatch) {
      return {
        timestamp: simpleMatch[1],
        level: this.normalizeLogLevel(simpleMatch[2]),
        content: simpleMatch[3],
        source,
      };
    }

    // 无法解析，返回原始内容
    return {
      timestamp: new Date().toISOString(),
      level: 'info',
      content: line,
      source,
    };
  }

  /**
   * 标准化日志级别
   */
  private normalizeLogLevel(level: string): LogEntry['level'] {
    const normalized = level.toLowerCase();
    if (normalized === 'error' || normalized === 'fatal') return 'error';
    if (normalized === 'warn' || normalized === 'warning') return 'warn';
    if (
      normalized === 'trace' ||
      normalized === 'debug' ||
      normalized === 'verbose'
    )
      return 'debug';
    return 'info';
  }
}
