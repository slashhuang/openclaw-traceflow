import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '../../config/config.service';
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

  // 记录每个会话文件最后处理的位置（用于增量推送）
  private sessionFilePositions: Map<
    string,
    { size: number; lastLine: string }
  > = new Map();

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
          const sessionFile = (entry as any).sessionFile as string;
          this.watchSessionFile(sessionFile, sessionKey);

          // 记录初始文件位置，不触发推送（只记录位置）
          const filePath = path.isAbsolute(sessionFile)
            ? sessionFile
            : path.join(this.sessionsDir, sessionFile);
          if (fs.existsSync(filePath)) {
            const stats = fs.statSync(filePath);
            const content = fs.readFileSync(filePath, 'utf-8');
            const lines = content
              .trim()
              .split('\n')
              .filter((line) => line.trim());
            const lastLine = lines.length > 0 ? lines[lines.length - 1] : '';

            this.sessionFilePositions.set(sessionKey, {
              size: stats.size,
              lastLine,
            });

            this.logger.debug(
              `Recorded initial position for ${sessionKey}: ${stats.size} bytes`,
            );
          }

          // 触发新会话事件（但不会推送历史消息）
          this.eventEmitter.emit('session:start', {
            sessionKey,
            sessionId: sessionKey,
            sessionFile,
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
          const sessionFile = (entry as any).sessionFile as string;
          this.watchSessionFile(sessionFile, sessionKey);

          // 记录初始文件位置，不触发推送
          const filePath = path.isAbsolute(sessionFile)
            ? sessionFile
            : path.join(this.sessionsDir, sessionFile);
          if (fs.existsSync(filePath)) {
            const stats = fs.statSync(filePath);
            const content = fs.readFileSync(filePath, 'utf-8');
            const lines = content
              .trim()
              .split('\n')
              .filter((line) => line.trim());
            const lastLine = lines.length > 0 ? lines[lines.length - 1] : '';

            this.sessionFilePositions.set(sessionKey, {
              size: stats.size,
              lastLine,
            });

            this.logger.debug(
              `Recorded initial position for new session ${sessionKey}: ${stats.size} bytes`,
            );
          }

          this.eventEmitter.emit('session:start', {
            sessionKey,
            sessionId: sessionKey,
            sessionFile,
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
    // sessionFile 可能是绝对路径或相对路径，需要判断
    const filePath = path.isAbsolute(filename)
      ? filename
      : path.join(this.sessionsDir, filename);
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
          // 重置位置记录
          this.sessionFilePositions.set(sessionKey, {
            size: stats.size,
            lastLine: '',
          });
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
