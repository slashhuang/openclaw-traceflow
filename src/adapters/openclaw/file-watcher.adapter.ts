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
import * as chokidar from 'chokidar';

/**
 * OpenClaw JSONL 文件监听器
 * 监听 sessions/*.jsonl 文件变化，触发会话事件
 */
@Injectable()
export class OpenClawFileWatcher implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OpenClawFileWatcher.name);

  private sessionsDir: string;
  private watcher?: chokidar.FSWatcher;
  private knownSessions: Set<string> = new Set();
  private pollingInterval?: NodeJS.Timeout;

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

    // 使用 chokidar 监听文件变化（macOS 上使用 polling 模式确保可靠性）
    this.startFileWatcher();
  }

  /**
   * 启动 chokidar 文件监听器
   */
  private startFileWatcher(): void {
    const sessionsJsonPath = path.join(this.sessionsDir, 'sessions.json');

    // 先扫描现有会话
    this.scanExistingSessions();

    // 使用轮询方式检查 sessions.json 变化（更可靠）
    this.startPollingWatcher();

    // 同时使用 chokidar 作为备用监听
    this.watcher = chokidar.watch(this.sessionsDir, {
      ignored: (filePath) => {
        const basename = path.basename(filePath);
        const shouldIgnore = !(
          basename.endsWith('.jsonl') || basename === 'sessions.json'
        );
        return shouldIgnore;
      },
      persistent: true,
      ignoreInitial: true,
      usePolling: true,
      interval: 2000,
      awaitWriteFinish: {
        stabilityThreshold: 500,
        pollInterval: 200,
      },
      atomic: true,
    });

    this.watcher
      .on('add', (filePath) => {
        const basename = path.basename(filePath);
        this.logger.log(`[chokidar] File added: ${basename}`);
        if (basename === 'sessions.json') {
          this.checkNewSessions();
        } else if (filePath.endsWith('.jsonl') && !filePath.includes('.reset.')) {
          this.handleNewSessionFile(filePath);
        }
      })
      .on('change', (filePath, stats) => {
        const basename = path.basename(filePath);
        this.logger.log(`[chokidar] File changed: ${basename}, size: ${stats?.size || 'unknown'}`);
        if (basename === 'sessions.json') {
          this.checkNewSessions();
        } else if (filePath.endsWith('.jsonl') && !filePath.includes('.reset.')) {
          this.handleSessionFileChange(filePath, stats?.size);
        }
      })
      .on('error', (error) => {
        this.logger.error('Watcher error:', error as Error);
      });

    this.logger.log('OpenClaw file watcher started (chokidar with polling + polling fallback)');
  }

  /**
   * 启动轮询监听器（检查 sessions.json 的 updatedAt 变化）
   */
  private startPollingWatcher(): void {
    const sessionsJsonPath = path.join(this.sessionsDir, 'sessions.json');
    let lastUpdateTime = 0;

    // 读取初始更新时间
    if (fs.existsSync(sessionsJsonPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(sessionsJsonPath, 'utf-8'));
        for (const entry of Object.values(data)) {
          const updatedAt = (entry as any).updatedAt;
          if (updatedAt && updatedAt > lastUpdateTime) {
            lastUpdateTime = updatedAt;
          }
        }
      } catch {
        // 忽略
      }
    }

    this.logger.log(`Polling watcher started, lastUpdateTime: ${lastUpdateTime}`);

    // 每 2 秒检查一次
    this.pollingInterval = setInterval(() => {
      if (!fs.existsSync(sessionsJsonPath)) return;

      try {
        const data = JSON.parse(fs.readFileSync(sessionsJsonPath, 'utf-8'));
        let maxUpdateTime = 0;

        for (const [sessionKey, entry] of Object.entries(data)) {
          const updatedAt = (entry as any).updatedAt;
          if (updatedAt && updatedAt > maxUpdateTime) {
            maxUpdateTime = updatedAt;
          }

          // 检查新会话
          if (!this.knownSessions.has(sessionKey)) {
            this.knownSessions.add(sessionKey);
            const sessionFile = (entry as any).sessionFile as string;

            // 记录初始位置
            const filePath = path.isAbsolute(sessionFile)
              ? sessionFile
              : path.join(this.sessionsDir, sessionFile);
            if (fs.existsSync(filePath)) {
              const stats = fs.statSync(filePath);
              const content = fs.readFileSync(filePath, 'utf-8');
              const lines = content.trim().split('\n').filter((l) => l.trim());
              const lastLine = lines.length > 0 ? lines[lines.length - 1] : '';

              this.sessionFilePositions.set(sessionKey, {
                size: stats.size,
                lastLine,
              });
            }

            this.eventEmitter.emit('session:start', {
              sessionKey,
              sessionId: sessionKey,
              sessionFile,
            });

            this.logger.log(`New session detected via polling: ${sessionKey}`);
          }
        }

        // 如果更新时间有变化，检查所有会话文件
        if (maxUpdateTime > lastUpdateTime) {
          this.logger.debug(`sessions.json updated: ${lastUpdateTime} -> ${maxUpdateTime}`);
          lastUpdateTime = maxUpdateTime;

          // 检查每个会话文件是否有新消息
          for (const [sessionKey, entry] of Object.entries(data)) {
            const sessionFile = (entry as any).sessionFile as string;
            const filePath = path.isAbsolute(sessionFile)
              ? sessionFile
              : path.join(this.sessionsDir, sessionFile);

            if (fs.existsSync(filePath)) {
              const stats = fs.statSync(filePath);
              const position = this.sessionFilePositions.get(sessionKey);
              const lastSize = position?.size || 0;

              if (stats.size > lastSize) {
                this.handleSessionFileChange(filePath, stats.size);
              }
            }
          }
        }
      } catch (error) {
        this.logger.debug('Polling check error:', error as Error);
      }
    }, 2000);
  }

  /**
   * 扫描现有会话
   */
  private scanExistingSessions(): void {
    try {
      const indexPath = path.join(this.sessionsDir, 'sessions.json');
      if (!fs.existsSync(indexPath)) {
        this.logger.warn('sessions.json not found');
        return;
      }

      const indexData = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));

      for (const [sessionKey, entry] of Object.entries(indexData)) {
        if (!this.knownSessions.has(sessionKey)) {
          this.knownSessions.add(sessionKey);
          const sessionFile = (entry as any).sessionFile as string;

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

          this.logger.debug(`Scanned existing session: ${sessionKey}`);
        }
      }
    } catch (error) {
      this.logger.error('Failed to scan existing sessions:', error as Error);
    }
  }

  /**
   * 处理会话文件变化
   */
  private handleSessionFileChange(filePath: string, fileSize?: number): void {
    const sessionKey = this.findSessionKeyByFile(filePath);
    if (!sessionKey) {
      this.logger.warn(`Unknown session file changed: ${filePath}`);
      return;
    }

    const position = this.sessionFilePositions.get(sessionKey);
    const lastSize = position?.size || 0;
    const lastProcessedLine = position?.lastLine || '';

    // 检测文件重置
    if (fileSize && fileSize < lastSize) {
      this.logger.log(`Session reset detected: ${sessionKey}`);
      this.sessionFilePositions.set(sessionKey, {
        size: fileSize,
        lastLine: '',
      });
      this.eventEmitter.emit('session:start', {
        sessionKey,
        sessionId: sessionKey,
        sessionFile: filePath,
      });
      return;
    }

    // 读取文件内容
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.trim().split('\n').filter((line) => line.trim());

    // 找到上次处理的行索引
    let startIndex = 0;
    if (lastProcessedLine) {
      const lastIdx = lines.lastIndexOf(lastProcessedLine);
      if (lastIdx >= 0) {
        startIndex = lastIdx + 1;
      }
    }

    // 处理新增的行
    const newLines = lines.slice(startIndex);
    if (newLines.length === 0) {
      // 更新位置记录但不触发事件
      if (lines.length > 0) {
        this.sessionFilePositions.set(sessionKey, {
          size: fileSize || content.length,
          lastLine: lines[lines.length - 1],
        });
      }
      return;
    }

    this.logger.debug(`Processing ${newLines.length} new lines for session ${sessionKey}`);

    for (const line of newLines) {
      try {
        const record = JSON.parse(line);
        if (record.type === 'message') {
          this.eventEmitter.emit('session:message', {
            sessionKey,
            sessionId: sessionKey,
            record,
          });
        }
      } catch (parseError) {
        this.logger.warn(`Failed to parse line: ${parseError}`);
      }
    }

    // 更新位置记录
    if (lines.length > 0) {
      this.sessionFilePositions.set(sessionKey, {
        size: fileSize || content.length,
        lastLine: lines[lines.length - 1],
      });
    }
  }

  /**
   * 处理新会话文件
   */
  private handleNewSessionFile(filePath: string): void {
    const sessionKey = this.findSessionKeyByFile(filePath);
    if (!sessionKey) {
      this.logger.log(`New session file detected: ${filePath}`);
      return;
    }

    this.logger.log(`New session file detected: ${sessionKey}`);

    // 记录初始文件位置，不推送历史消息
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
  }

  /**
   * 根据文件路径查找 sessionKey
   */
  private findSessionKeyByFile(filePath: string): string | null {
    const basename = path.basename(filePath, '.jsonl');
    if (basename.includes('.reset.')) {
      return null;
    }

    for (const [sessionKey, value] of this.knownSessions.entries()) {
      // Check if this sessionKey maps to this file
      // This is a simplified check - in practice, sessionKey should match basename
      if (sessionKey.includes(basename) || basename === sessionKey) {
        return sessionKey;
      }
    }

    // Try to find from sessions.json
    try {
      const indexPath = path.join(this.sessionsDir, 'sessions.json');
      if (fs.existsSync(indexPath)) {
        const sessionsData = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
        for (const [key, value] of Object.entries(sessionsData)) {
          const sessionFile = (value as any).sessionFile;
          if (sessionFile && path.basename(sessionFile) === path.basename(filePath)) {
            return key;
          }
        }
      }
    } catch {
      // Ignore
    }

    return basename;
  }

  /**
   * 检查新会话（从 sessions.json）
   */
  private checkNewSessions(): void {
    try {
      const indexPath = path.join(this.sessionsDir, 'sessions.json');
      if (!fs.existsSync(indexPath)) return;

      const indexData = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));

      for (const [sessionKey, entry] of Object.entries(indexData)) {
        if (!this.knownSessions.has(sessionKey)) {
          this.knownSessions.add(sessionKey);
          const sessionFile = (entry as any).sessionFile as string;

          // 记录初始文件位置
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

  onModuleDestroy(): void {
    if (this.watcher) {
      this.watcher.close();
    }
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }
    this.logger.log('OpenClaw file watcher destroyed');
  }
}
