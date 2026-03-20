import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '../config/config.service';
import * as fs from 'fs';
import { createHash } from 'crypto';
import { callGatewayRpc } from '../openclaw/gateway-rpc';

export interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  content: string;
}

@Injectable()
export class LogsService {
  private readonly logger = new Logger(LogsService.name);
  private logTailer: any = null;
  private logSubscribers: Set<(entry: LogEntry) => void> = new Set();

  // OpenClaw Gateway tail via `logs.tail` cursor protocol
  private gatewayCursor: number | null = null;
  private gatewayTimer: NodeJS.Timeout | null = null;
  private gatewayPollInFlight = false;
  private gatewaySuppressNextEmit = false;
  private gatewaySubscribers: Set<(entry: LogEntry) => void> = new Set();
  private gatewayPollOptions: { limit: number; pollIntervalMs: number; maxBytes: number } | null = null;
  private gatewayCurrentPollMs = 1500;
  private gatewayFailureCount = 0;
  private gatewayDedupeOrder: string[] = [];
  private gatewayDedupeSet: Set<string> = new Set();
  private readonly gatewayDedupeMax = 1000;

  constructor(private configService: ConfigService) {}

  /**
   * 启动日志追踪（tail -f）- 弱依赖，失败不阻塞
   */
  async startTailing(logPath?: string): Promise<void> {
    if (!logPath) {
      console.warn('[LogsService] Log file path not configured');
      return;
    }

    if (!fs.existsSync(logPath)) {
      console.warn('[LogsService] Log file does not exist:', logPath);
      return;
    }

    try {
      const chokidar = await import('chokidar');
      this.logTailer = chokidar.watch(logPath, { persistent: true });

      let lastSize = fs.statSync(logPath).size;

      this.logTailer.on('change', () => {
        try {
          const stats = fs.statSync(logPath);
          if (stats.size > lastSize) {
            // 读取新增的日志内容
            const fd = fs.openSync(logPath, 'r');
            const buffer = Buffer.alloc(stats.size - lastSize);
            fs.readSync(fd, buffer, 0, buffer.length, lastSize);
            fs.closeSync(fd);

            const newLines = buffer.toString('utf-8').split('\n').filter(line => line.trim());
            for (const line of newLines) {
              const entry = this.parseLogLine(line);
              this.notifySubscribers(entry);
            }

            lastSize = stats.size;
          }
        } catch (err) {
          console.error('[LogsService] Error reading log file:', err);
        }
      });

      this.logger.log(`Started tailing logs from: ${logPath}`);
    } catch (error: any) {
      console.error('[LogsService] Failed to start log tailing:', error?.message || error);
      // 不抛出错误，静默失败
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
   * Subscribe to OpenClaw Gateway `logs.tail` cursor.
   * Returns a cleanup function for this callback only.
   */
  subscribeGatewayLogs(
    callback: (entry: LogEntry) => void,
    opts?: Partial<{ limit: number; pollIntervalMs: number; maxBytes: number }>,
  ): () => void {
    this.gatewaySubscribers.add(callback);

    if (!this.gatewayTimer) {
      const limit = typeof opts?.limit === 'number' && Number.isFinite(opts.limit) && opts.limit > 0 ? Math.floor(opts.limit) : 200;
      const pollIntervalMs =
        typeof opts?.pollIntervalMs === 'number' && Number.isFinite(opts.pollIntervalMs) && opts.pollIntervalMs > 0
          ? Math.floor(opts.pollIntervalMs)
          : 1500;
      const maxBytes =
        typeof opts?.maxBytes === 'number' && Number.isFinite(opts.maxBytes) && opts.maxBytes > 0
          ? Math.floor(opts.maxBytes)
          : 1_000_000;

      this.gatewayPollOptions = { limit, pollIntervalMs, maxBytes };
      this.gatewayCurrentPollMs = pollIntervalMs;
      this.gatewayFailureCount = 0;
      this.gatewaySuppressNextEmit = this.gatewayCursor == null;
      this.scheduleGatewayPoll();

      // Kick once immediately
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

  /**
   * 获取最近日志 - 优先调用 OpenClaw Gateway `logs.tail`。
   * 若 Gateway 不可用/参数缺失，才退回到本地 `OPENCLAW_LOG_PATH` 文件读取。
   */
  async getRecentLogs(limit: number = 100): Promise<LogEntry[]> {
    const config = this.configService.getConfig();

    // 1) Prefer Gateway tail, because it works without OPENCLAW_LOG_PATH
    const gatewayHttpUrl = config.openclawGatewayUrl?.trim();
    if (gatewayHttpUrl) {
      const res = await callGatewayRpc<{
        file?: string;
        cursor?: number;
        size?: number;
        lines?: string[];
        truncated?: boolean;
        reset?: boolean;
      }>({
        gatewayHttpUrl,
        token: config.openclawGatewayToken,
        password: config.openclawGatewayPassword,
        method: 'logs.tail',
        methodParams: {
          limit,
          maxBytes: Math.max(250_000, limit * 4_000),
        },
        timeoutMs: 8000,
      });

      if (res.ok && res.payload) {
        if (typeof res.payload.cursor === 'number') {
          this.gatewayCursor = res.payload.cursor;
        }
        const rawLines = Array.isArray(res.payload.lines)
          ? res.payload.lines.filter((l): l is string => typeof l === 'string' && l.trim().length > 0)
          : [];
        // Fill dedupe so the websocket won't re-send the same lines.
        for (const line of rawLines) {
          this.rememberGatewayLine(line);
        }
        return rawLines.map((l) => this.parseLogLine(l));
      }
    }

    // 2) Fallback to local file logs
    const logPath = config.openclawLogPath;
    if (!logPath) {
      console.warn('[LogsService] Log file path not configured (OPENCLAW_LOG_PATH) and Gateway unavailable');
      return [];
    }

    try {
      if (!fs.existsSync(logPath)) {
        return [];
      }

      const content = fs.readFileSync(logPath, 'utf-8');
      const lines = content.split('\n').filter((line) => line.trim());

      const rawLines = lines.slice(-limit);
      for (const line of rawLines) {
        this.rememberGatewayLine(line);
      }
      return rawLines.map((l) => this.parseLogLine(l));
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`[LogsService] Failed to get recent logs: ${msg}`);
      return [];
    }
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

      const res = await callGatewayRpc<{
        cursor?: number;
        lines?: string[];
        truncated?: boolean;
        reset?: boolean;
      }>({
        gatewayHttpUrl,
        token: config.openclawGatewayToken,
        password: config.openclawGatewayPassword,
        method: 'logs.tail',
        methodParams: {
          cursor: cursorToUse,
          limit,
          maxBytes,
        },
        timeoutMs: 8000,
      });

      if (!res.ok || !res.payload) {
        this.gatewayFailureCount += 1;
        const base = this.gatewayPollOptions?.pollIntervalMs || 1500;
        this.gatewayCurrentPollMs = Math.min(15_000, base * (2 ** Math.min(this.gatewayFailureCount, 4)));
        this.scheduleGatewayPoll();
        return;
      }
      if (this.gatewayFailureCount > 0) {
        this.gatewayFailureCount = 0;
        this.gatewayCurrentPollMs = this.gatewayPollOptions?.pollIntervalMs || 1500;
        this.scheduleGatewayPoll();
      }

      if (typeof res.payload.cursor === 'number') {
        this.gatewayCursor = res.payload.cursor;
      }

      const rawLines = Array.isArray(res.payload.lines)
        ? res.payload.lines.filter((l): l is string => typeof l === 'string' && l.trim().length > 0)
        : [];

      const resetOrTruncated = Boolean(res.payload.reset || res.payload.truncated);
      if (resetOrTruncated) {
        // The cursor moved backwards or we only got a truncated chunk; safest is clearing dedupe.
        this.gatewayDedupeOrder = [];
        this.gatewayDedupeSet.clear();
      }

      for (const line of rawLines) {
        const firstTime = this.rememberGatewayLine(line);
        if (!firstTime) continue;
        if (this.gatewaySuppressNextEmit) continue;

        const entry = this.parseLogLine(line);
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
  private parseLogLine(line: string): LogEntry {
    const trimmed = line.trim();
    if (!trimmed) {
      return {
        timestamp: new Date().toISOString(),
        level: 'info',
        content: '',
      };
    }

    // Try OpenClaw JSONL / structured log format first.
    try {
      const obj = JSON.parse(trimmed) as unknown;
      // `logs.tail` 的单行日志可能是结构化对象，也可能是 JSON 数组；这里都尝试解析。
      if (obj && typeof obj === 'object') {
        const o = obj as unknown as Record<string, unknown>;
        const meta =
          o['_meta'] && typeof o['_meta'] === 'object' ? (o['_meta'] as Record<string, unknown>) : null;

        const timeStr =
          typeof o['time'] === 'string'
            ? (o['time'] as string)
            : meta && typeof meta['date'] === 'string'
              ? (meta['date'] as string)
              : null;

        const rawLevel =
          meta && (typeof meta['logLevelName'] === 'string'
            ? meta['logLevelName']
            : typeof meta['level'] === 'string'
              ? meta['level']
              : typeof meta['logLevel'] === 'string'
                ? meta['logLevel']
                : undefined);

        const normalizedLevel =
          typeof rawLevel === 'string' ? this.normalizeLogLevel(rawLevel) : ('info' as LogEntry['level']);

        const parseMaybeJsonString = (value: unknown): Record<string, unknown> | null => {
          if (typeof value !== 'string') return null;
          const v = value.trim();
          if (!v.startsWith('{') || !v.endsWith('}')) return null;
          try {
            const parsed = JSON.parse(v) as unknown;
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
          } catch {
            // ignore
          }
          return null;
        };

        const contextCandidate =
          typeof o['0'] === 'string'
            ? (o['0'] as string)
            : meta && typeof meta['name'] === 'string'
              ? (meta['name'] as string)
              : null;

        const contextObj = parseMaybeJsonString(contextCandidate);
        const subsystem =
          contextObj && typeof contextObj['subsystem'] === 'string'
            ? (contextObj['subsystem'] as string)
            : contextObj && typeof contextObj['module'] === 'string'
              ? (contextObj['module'] as string)
              : null;

        const message =
          (typeof o['1'] === 'string'
            ? (o['1'] as string)
            : typeof o['2'] === 'string'
              ? (o['2'] as string)
              : typeof o['message'] === 'string'
                ? (o['message'] as string)
                : null) ??
          (contextCandidate && !contextObj ? contextCandidate : null) ??
          trimmed;

        const timestamp = timeStr
          ? (() => {
              const dt = new Date(timeStr);
              return Number.isNaN(dt.getTime()) ? new Date().toISOString() : dt.toISOString();
            })()
          : new Date().toISOString();

        return {
          timestamp,
          level: normalizedLevel,
          content: subsystem ? `[${subsystem}] ${message}` : message,
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
      };
    }

    // 尝试匹配简单格式：TIMESTAMP LEVEL content
    const simpleMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}[.\d]*)\s*(INFO|WARN|ERROR|DEBUG|LOG|VERBOSE)\s+(.*)$/i);

    if (simpleMatch) {
      return {
        timestamp: simpleMatch[1],
        level: this.normalizeLogLevel(simpleMatch[2]),
        content: simpleMatch[3],
      };
    }

    // 无法解析，返回原始内容
    return {
      timestamp: new Date().toISOString(),
      level: 'info',
      content: line,
    };
  }

  /**
   * 标准化日志级别
   */
  private normalizeLogLevel(level: string): LogEntry['level'] {
    const normalized = level.toLowerCase();
    if (normalized === 'error' || normalized === 'fatal') return 'error';
    if (normalized === 'warn' || normalized === 'warning') return 'warn';
    if (normalized === 'trace' || normalized === 'debug' || normalized === 'verbose') return 'debug';
    return 'info';
  }
}
