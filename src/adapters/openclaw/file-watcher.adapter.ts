import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '../config/config.service';
import * as fs from 'fs';
import * as path from 'path';

/**
 * OpenClaw JSONL 文件监听器
 * 监听 sessions/*.jsonl 文件变化，触发会话事件
 */
@Injectable()
export class OpenClawFileWatcher implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OpenClawFileWatcher.name);

  private sessionsDir: string;
  private watchers: Map<string, fs.FSWatcher> = new Map();
  private knownSessions: Set<string> = new Set();
  private sessionData: Map<string, any> = new Map();

  constructor(
    private eventEmitter: EventEmitter2,
    private configService: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    const config = this.configService.getConfig();
    const sourceConfig = config.sources?.find(
      (s: any) => s.type === 'openclaw',
    );

    if (!sourceConfig?.enabled) {
      this.logger.log('OpenClaw source disabled, skipping file watcher');
      return;
    }

    this.sessionsDir = sourceConfig.config.sessionsDir;

    if (!fs.existsSync(this.sessionsDir)) {
      this.logger.error(
        `Sessions directory does not exist: ${this.sessionsDir}`,
      );
      return;
    }

    this.logger.log(`Starting OpenClaw file watcher: ${this.sessionsDir}`);

    // 监听 sessions.json 索引文件
    this.watchSessionsIndex();

    // 扫描现有会话
    this.scanExistingSessions();
  }

  /**
   * 监听 sessions.json 索引文件
   */
  private watchSessionsIndex(): void {
    const indexPath = path.join(this.sessionsDir, 'sessions.json');

    if (!fs.existsSync(indexPath)) {
      this.logger.warn(`sessions.json not found: ${indexPath}`);
      return;
    }

    fs.watch(indexPath, (eventType) => {
      if (eventType === 'change') {
        this.checkNewSessions();
      }
    });

    this.logger.debug('Watching sessions.json');
  }

  /**
   * 扫描现有会话
   */
  private scanExistingSessions(): void {
    try {
      const indexPath = path.join(this.sessionsDir, 'sessions.json');
      const indexData = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));

      for (const [sessionKey, entry] of Object.entries(indexData)) {
        if (!this.knownSessions.has(sessionKey)) {
          this.knownSessions.add(sessionKey);
          this.watchSessionFile(entry.sessionFile as string, sessionKey);

          // 触发新会话事件
          this.eventEmitter.emit('session:start', {
            sessionKey,
            sessionId: sessionKey,
            sessionFile: entry.sessionFile,
          });
        }
      }
    } catch (error) {
      this.logger.error('Failed to scan existing sessions:', error as Error);
    }
  }

  /**
   * 检查新会话
   */
  private checkNewSessions(): void {
    try {
      const indexPath = path.join(this.sessionsDir, 'sessions.json');
      const indexData = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));

      for (const [sessionKey, entry] of Object.entries(indexData)) {
        if (!this.knownSessions.has(sessionKey)) {
          this.knownSessions.add(sessionKey);
          this.watchSessionFile(entry.sessionFile as string, sessionKey);

          this.eventEmitter.emit('session:start', {
            sessionKey,
            sessionId: sessionKey,
            sessionFile: entry.sessionFile,
          });

          this.logger.debug(`New session detected: ${sessionKey}`);
        }
      }
    } catch (error) {
      // 忽略解析错误（可能是写入中）
    }
  }

  /**
   * 监听单个 session 文件
   */
  private watchSessionFile(filename: string, sessionKey: string): void {
    const filePath = path.join(this.sessionsDir, filename);
    let lastSize = 0;
    let lastProcessedLine = '';

    try {
      const stats = fs.statSync(filePath);
      lastSize = stats.size;
    } catch (error) {
      this.logger.warn(`File not found: ${filePath}`);
      return;
    }

    const watcher = fs.watch(filePath, (eventType) => {
      if (eventType !== 'change') return;

      try {
        const stats = fs.statSync(filePath);

        // 检测文件重置（新轮次会话）
        if (stats.size < lastSize) {
          this.logger.log(`Session reset detected: ${sessionKey}`);
          this.eventEmitter.emit('session:start', {
            sessionKey,
            sessionId: sessionKey,
            sessionFile: filename,
          });
          lastSize = stats.size;
          lastProcessedLine = '';
          return;
        }

        if (stats.size <= lastSize) return;

        // 读取新增内容
        const buffer = Buffer.alloc(stats.size - lastSize);
        const fd = fs.openSync(filePath, 'r');
        fs.readSync(fd, buffer, 0, stats.size - lastSize, lastSize);
        fs.closeSync(fd);

        const newContent = buffer.toString('utf-8');
        const lines = newContent.split('\n').filter((line) => line.trim());

        for (const line of lines) {
          if (line === lastProcessedLine) continue;

          try {
            const record = JSON.parse(line);
            this.eventEmitter.emit('session:message', {
              sessionKey,
              sessionId: sessionKey,
              record,
            });
            lastProcessedLine = line;
          } catch (parseError) {
            // 可能是写入中，忽略
          }
        }

        lastSize = stats.size;
      } catch (error) {
        // 文件可能被删除
      }
    });

    this.watchers.set(sessionKey, watcher);
    this.logger.debug(`Watching session file: ${filename}`);
  }

  onModuleDestroy(): void {
    for (const watcher of this.watchers.values()) {
      watcher.close();
    }
    this.watchers.clear();
    this.logger.log('OpenClaw file watcher destroyed');
  }
}
