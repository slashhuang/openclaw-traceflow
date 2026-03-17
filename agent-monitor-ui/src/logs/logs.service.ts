import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';

export interface LogEntry {
  timestamp: number;
  level: 'info' | 'warn' | 'error' | 'debug';
  content: string;
  source: 'pm2' | 'openclaw';
}

@Injectable()
export class LogsService {
  private logSubscribers: Map<string, (log: LogEntry) => void> = new Map();
  private tailProcess: any = null;

  async startTailing(logPath: string): Promise<void> {
    if (this.tailProcess) {
      return;
    }

    // 使用 tail -f 实时读取日志
    this.tailProcess = spawn('tail', ['-f', logPath]);

    this.tailProcess.stdout.on('data', (data: Buffer) => {
      const lines = data.toString().split('\n');
      lines.forEach((line) => {
        if (line.trim()) {
          const entry: LogEntry = {
            timestamp: Date.now(),
            level: this.detectLogLevel(line),
            content: line,
            source: 'pm2',
          };
          this.notifySubscribers(entry);
        }
      });
    });
  }

  stopTailing(): void {
    if (this.tailProcess) {
      this.tailProcess.kill();
      this.tailProcess = null;
    }
  }

  subscribe(subscriberId: string, callback: (log: LogEntry) => void): void {
    this.logSubscribers.set(subscriberId, callback);
  }

  unsubscribe(subscriberId: string): void {
    this.logSubscribers.delete(subscriberId);
  }

  private notifySubscribers(log: LogEntry): void {
    this.logSubscribers.forEach((callback) => callback(log));
  }

  private detectLogLevel(line: string): LogEntry['level'] {
    const lower = line.toLowerCase();
    if (lower.includes('error') || lower.includes('fail')) return 'error';
    if (lower.includes('warn')) return 'warn';
    if (lower.includes('debug')) return 'debug';
    return 'info';
  }

  async getRecentLogs(logPath: string, limit: number = 100): Promise<LogEntry[]> {
    try {
      if (!fs.existsSync(logPath)) {
        return [];
      }

      const content = fs.readFileSync(logPath, 'utf-8');
      const lines = content.split('\n').slice(-limit);

      return lines
        .filter((line) => line.trim())
        .map((line) => ({
          timestamp: Date.now(),
          level: this.detectLogLevel(line),
          content: line,
          source: 'pm2',
        }));
    } catch (error) {
      console.error('Failed to read logs:', error);
      return [];
    }
  }
}
