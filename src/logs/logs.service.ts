import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '../config/config.service';
import * as fs from 'fs';
import * as path from 'path';

export interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  content: string;
  source?: 'traceflow' | 'im-push';
}

@Injectable()
export class LogsService implements OnModuleInit {
  private readonly logger = new Logger(LogsService.name);
  private traceflowLogTailer: import('chokidar').FSWatcher | null = null;
  private logSubscribers: Set<(entry: LogEntry) => void> = new Set();

  // TraceFlow 自身日志
  private traceflowLogPath: string | null = null;

  // IM 推送日志（内存存储）
  private imPushLogs: LogEntry[] = [];
  private readonly maxImLogs = 500;

  constructor(
    private configService: ConfigService,
    private eventEmitter: EventEmitter2,
  ) {}

  async onModuleInit(): Promise<void> {
    // 订阅 IM 推送事件
    this.subscribeToImPushEvents();
  }

  /**
   * 订阅 IM 推送相关事件
   */
  private subscribeToImPushEvents(): void {
    this.eventEmitter.on('audit.session.start', (session) => {
      this.addImPushLog('info', `[Session Start] ${session.user?.name || session.sessionId}`);
    });

    this.eventEmitter.on('audit.session.message', (data) => {
      const msgType = data.message?.type || 'unknown';
      if (msgType === 'skill:start') {
        this.addImPushLog('info', `[Skill Start] ${data.message?.skillName || 'unknown'}`);
      } else if (msgType === 'skill:end') {
        this.addImPushLog('info', `[Skill End] ${data.message?.skillName || 'unknown'} - ${data.message?.status || 'unknown'}`);
      } else if (msgType === 'user' || msgType === 'assistant') {
        this.addImPushLog('debug', `[Message] ${msgType}`);
      }
    });

    this.eventEmitter.on('audit.session.end', (session) => {
      this.addImPushLog('info', `[Session End] ${session.sessionId}`);
    });

    this.eventEmitter.on('audit.log.error', (log) => {
      this.addImPushLog('error', `[Error] ${log.component}: ${log.message}`);
    });

    this.logger.log('IM push event listeners registered');
  }

  /**
   * 添加 IM 推送日志
   */
  private addImPushLog(level: LogEntry['level'], content: string): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      content,
      source: 'im-push',
    };
    this.imPushLogs.push(entry);
    if (this.imPushLogs.length > this.maxImLogs) {
      this.imPushLogs.shift();
    }
    // 通知订阅者
    this.notifySubscribers(entry);
  }

  /**
   * 启动日志追踪 - TraceFlow 日志
   */
  async startTailing(): Promise<void> {
    const config = this.configService.getConfig();

    // 启动 TraceFlow 自身日志追踪
    this.traceflowLogPath = path.join(config.dataDir, 'traceflow.log');
    await this.startTraceflowTailing(this.traceflowLogPath);
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
      this.logger.error(
        'Failed to start traceflow log tailing:',
        error?.message || error,
      );
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

    // 注意：不再触发 audit.log.error 事件
    // TraceFlow 自身的错误日志不应该推送到飞书
    // OpenClaw 的错误日志应该由 OpenClaw 自己推送
  }

  /**
   * 获取 TraceFlow 最近日志
   */
  async getTraceflowRecentLogs(limit: number = 100): Promise<LogEntry[]> {
    const logPath =
      this.traceflowLogPath ||
      path.join(this.configService.getConfig().dataDir, 'traceflow.log');

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
   * 获取 IM 推送日志
   */
  getImPushLogs(limit: number = 100): LogEntry[] {
    return this.imPushLogs.slice(-limit);
  }

  /**
   * 获取所有日志（TraceFlow + IM 推送）
   */
  async getAllLogs(limit: number = 200): Promise<LogEntry[]> {
    const traceflowLogs = await this.getTraceflowRecentLogs(limit);
    const imPushLogs = this.getImPushLogs(limit);

    // 合并并排序
    const allLogs = [...traceflowLogs, ...imPushLogs];
    allLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return allLogs.slice(0, limit);
  }

  /**
   * 解析日志行
   */
  private parseLogLine(
    line: string,
    source: 'traceflow' = 'traceflow',
  ): LogEntry {
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
