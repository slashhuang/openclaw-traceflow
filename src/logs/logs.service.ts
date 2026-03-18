import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '../config/config.service';
import * as fs from 'fs';
import * as path from 'path';

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
   * 获取最近日志 - 弱依赖，失败返回空数组
   */
  getRecentLogs(limit: number = 100): LogEntry[] {
    const config = this.configService.getConfig();
    const logPath = config.openclawLogPath;

    if (!logPath) {
      console.warn('[LogsService] Log file path not configured (OPENCLAW_LOG_PATH)');
      return [];
    }

    try {
      if (!fs.existsSync(logPath)) {
        return [];
      }

      const content = fs.readFileSync(logPath, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim());

      // 解析日志行
      const entries: LogEntry[] = [];
      for (const line of lines.slice(-limit)) {
        entries.push(this.parseLogLine(line));
      }

      return entries;
    } catch (error: any) {
      console.error('[LogsService] Failed to get recent logs:', error?.message || error);
      return [];
    }
  }

  /**
   * 解析日志行
   */
  private parseLogLine(line: string): LogEntry {
    // 尝试匹配标准日志格式：[TIMESTAMP] [LEVEL] content
    const match = line.match(/^\[([^\]]+)\]\s*\[([^\]]+)\]\s*(.*)$/);

    if (match) {
      return {
        timestamp: match[1],
        level: this.normalizeLogLevel(match[2]),
        content: match[3],
      };
    }

    // 尝试匹配简单格式：TIMESTAMP LEVEL content
    const simpleMatch = line.match(/^(\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}[.\d]*)\s*(INFO|WARN|ERROR|DEBUG|LOG|VERBOSE)\s+(.*)$/i);

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
    if (normalized === 'error') return 'error';
    if (normalized === 'warn' || normalized === 'warning') return 'warn';
    if (normalized === 'debug' || normalized === 'verbose') return 'debug';
    return 'info';
  }
}
