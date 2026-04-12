import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '../config/config.service';
import { SessionStateService } from './session-state.service';
import * as fs from 'fs';
import * as path from 'path';
import * as chokidar from 'chokidar';

export interface SessionEvent {
  sessionId: string;
  sessionKey: string;
  user: { id: string; name: string };
  account: string;
  startTime: number;
  endTime?: number;
  messageCount: number;
  status: 'active' | 'completed';
  tokenInput?: number;
  tokenOutput?: number;
  firstMessage?: string;
  lastActivity?: number;
}

/**
 * 会话管理器
 * 管理会话生命周期，通过文件系统监听检测会话开始/结束
 * 使用 SessionStateService 存储会话状态，解耦事件时序
 */
@Injectable()
export class SessionManager implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SessionManager.name);

  // 使用 SessionStateService 存储会话状态
  private sessionState: SessionStateService;

  // 已知的会话文件（用于检测新会话）
  private knownSessionFiles = new Set<string>();

  // 会话结束超时（5 分钟无活动）
  private readonly SESSION_END_TIMEOUT_MS = 5 * 60 * 1000;

  // 定时器检查会话结束
  private cleanupInterval?: NodeJS.Timeout;

  // 文件监听器列表（每个 agent 一个）
  private watchers: chokidar.FSWatcher[] = [];

  // Watcher 是否已启动
  private watcherReady = false;

  // 记录每个会话文件最后处理的位置（用于增量推送）
  private sessionFilePositions: Map<
    string,
    { size: number; lastLine: string; lineCount: number }
  > = new Map();

  constructor(
    private eventEmitter: EventEmitter2,
    private configService: ConfigService,
    sessionState: SessionStateService,
  ) {
    this.sessionState = sessionState;
    this.startCleanupTimer();
  }

  onModuleInit(): void {
    // 启动文件监听器，直接监听 agents/*/sessions/*.jsonl 文件变化
    setTimeout(() => {
      this.startFileWatcher();
    }, 1000);
  }

  /**
   * 启动文件监听器
   * 监听 openclawStateDir/agents 目录下所有 agent 的 sessions
   */
  private startFileWatcher(): void {
    const config = this.configService.getConfig();

    // 优先使用 openclawStateDir，自动发现所有 agent
    const stateDir = config.openclawStateDir;
    const agentsSessionsDirs: { agentId: string; sessionsDir: string }[] = [];

    if (stateDir && fs.existsSync(stateDir)) {
      // 遍历 agents 目录，发现所有 agent 的 sessions
      const agentsDir = path.join(stateDir, 'agents');
      if (fs.existsSync(agentsDir)) {
        const agentIds = fs.readdirSync(agentsDir);
        for (const agentId of agentIds) {
          const sessionsDir = path.join(agentsDir, agentId, 'sessions');
          if (fs.existsSync(sessionsDir)) {
            agentsSessionsDirs.push({ agentId, sessionsDir });
            this.logger.log(`Discovered agent sessions: ${agentId}`);
          }
        }
      }
    }

    // 如果没有发现 agent sessions，尝试使用 sources 配置
    if (agentsSessionsDirs.length === 0) {
      const sessionsDir = config.sources?.find((s) => s.type === 'openclaw')
        ?.config?.sessionsDir;
      if (sessionsDir && fs.existsSync(sessionsDir)) {
        agentsSessionsDirs.push({ agentId: 'default', sessionsDir });
        this.logger.log(`Using configured sessionsDir: ${sessionsDir}`);
      }
    }

    if (agentsSessionsDirs.length === 0) {
      this.logger.warn(
        'No OpenClaw sessions directories found, skipping file watcher',
      );
      return;
    }

    this.logger.log(
      `Starting file watcher for ${agentsSessionsDirs.length} agent(s)`,
    );

    // 为每个 agent 启动监听器
    for (const { agentId, sessionsDir } of agentsSessionsDirs) {
      this.startAgentFileWatcher(agentId, sessionsDir);
    }
  }

  /**
   * 为单个 agent 启动文件监听器
   */
  private startAgentFileWatcher(agentId: string, sessionsDir: string): void {
    this.logger.log(`Starting watcher for agent ${agentId}: ${sessionsDir}`);

    // 监听 sessions.json 文件
    const sessionsJsonPath = path.join(sessionsDir, 'sessions.json');

    // 先扫描现有文件
    this.scanExistingSessions(sessionsDir, agentId);

    // 监听文件变化
    // 使用原生 fs.watch (跨平台：macOS fsevents / Linux inotify / Windows ReadDirectoryChangesW)
    const watcher = chokidar.watch(sessionsDir, {
      // 只监听 .jsonl 和 sessions.json 文件 (chokidar v4 风格：返回 true 表示忽略)
      ignored: (filePath, stats) => {
        if (!stats?.isFile()) return false; // 不忽略目录
        return !(
          filePath.endsWith('.jsonl') || filePath.endsWith('sessions.json')
        );
      },
      persistent: true,
      ignoreInitial: false, // 需要触发 add 事件来初始化文件位置
      // 使用原生 watching (默认)，只在网络文件系统时开启 polling
      usePolling: false,
      // awaitWriteFinish 配置，避免写入中途触发事件
      awaitWriteFinish: {
        stabilityThreshold: 200,
        pollInterval: 50,
      },
      depth: 1,
      alwaysStat: true, // 始终提供 stats 对象
    });

    this.watchers.push(watcher);

    watcher
      .on('add', (filePath) => {
        this.logger.log(`File created: ${filePath}`);
        if (filePath.endsWith('.jsonl')) {
          this.handleNewSessionFile(filePath, agentId);
        }
      })
      .on('change', (filePath, stats) => {
        this.logger.log(
          `File changed: ${filePath}, size: ${stats?.size || 'unknown'}`,
        );
        if (filePath.endsWith('.jsonl')) {
          // 检测现有会话文件的更新
          this.handleSessionFileChange(filePath, agentId);
        } else if (filePath === sessionsJsonPath) {
          this.handleSessionsJsonChange(filePath, agentId);
        }
      })
      .on('error', (error) => {
        this.logger.error('Watcher error:', error as Error);
      })
      .on('ready', () => {
        this.logger.log(`Watcher ready for agent ${agentId}`);
        this.watcherReady = true;
      });

    this.logger.log(`Watcher started for agent ${agentId}`);
  }

  /**
   * 处理会话文件变化（用于检测会话更新）
   */
  private handleSessionFileChange(filePath: string, agentId: string): void {
    try {
      const sessionId = path.basename(filePath, '.jsonl');

      // 忽略 reset 文件
      if (sessionId.includes('.reset.')) {
        return;
      }

      this.logger.log(`Session file updated: ${sessionId} (agent: ${agentId})`);

      // 检查是否是启动时已存在的会话（有文件位置记录但无 session state）
      const hasFilePosition = this.sessionFilePositions.has(sessionId);
      const hasSessionState = this.sessionState.getSession(sessionId);

      if (!hasSessionState) {
        // 新会话（或启动时已存在的会话），触发会话开始事件
        this.logger.log(
          `Detected ${hasFilePosition ? 'existing' : 'new'} session, parsing file: ${sessionId}`,
        );
        void this.parseNewSessionFile(filePath, sessionId, agentId);

        // 如果是启动时已存在的会话，仅记录文件位置，不推送历史消息
        // 用户只关心启动后的新消息
        if (hasFilePosition) {
          this.logger.debug(
            `Existing session ${sessionId} loaded, skipping historical messages`,
          );
        }
        return;
      }

      // 触发会话消息事件（解析文件内容并推送）
      void this.parseSessionFileUpdate(filePath, sessionId);
    } catch (error) {
      this.logger.error('Error handling session file change:', error as Error);
    }
  }

  /**
   * 解析会话文件更新（增量推送：只处理新增的行）
   */
  private parseSessionFileUpdate(filePath: string, sessionId: string): void {
    try {
      // 读取完整文件内容
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.trim().split('\n');

      if (lines.length === 0) {
        return;
      }

      // 检测文件压缩/重置（行数减少 = 压缩，因为 JSONL 是 append-only）
      const filePosition = this.sessionFilePositions.get(sessionId);
      const lastLineCount = filePosition?.lineCount || 0;
      const currentLineCount = lines.length;

      if (lastLineCount > 0 && currentLineCount < lastLineCount) {
        // 行数减少，判定为文件压缩/重置（JSONL 文件只增不减）
        const lineDrop = lastLineCount - currentLineCount;
        const dropRate = ((lineDrop / lastLineCount) * 100).toFixed(1);

        this.logger.warn(
          `Session file compressed: ${sessionId} (${lastLineCount} → ${currentLineCount} lines, -${lineDrop} lines, -${dropRate}%)`,
        );

        // 发送告警事件
        this.eventEmitter.emit('audit.session.alert', {
          sessionId,
          alert: {
            type: 'file_reset',
            message: `⚠️ 会话文件 ${sessionId}.jsonl 的行数从 ${lastLineCount} 行变成了 ${currentLineCount} 行（减少 ${lineDrop} 行，-${dropRate}%），可能有信息丢失，会话将重置`,
          },
        });

        // Reset 会话：清空 position 记录
        this.sessionFilePositions.delete(sessionId);
        this.logger.log(`Session reset: ${sessionId}`);
        return;
      }

      // 获取上次处理的位置（优先使用 size，更可靠）
      const lastProcessedSize = filePosition?.size || 0;
      const lastProcessedLine = filePosition?.lastLine || '';

      // 使用 size 进行增量检测（更可靠）
      const currentStats = fs.statSync(filePath);
      const currentSize = currentStats.size;

      // 如果文件大小没有变化，说明没有新内容
      if (lastProcessedSize > 0 && currentSize <= lastProcessedSize) {
        this.logger.debug(
          `Session file unchanged: ${sessionId} (${currentSize} bytes)`,
        );
        return;
      }

      // 找到上次处理的行索引（使用 size 作为主要判断）
      let startIndex = 0;
      if (lastProcessedSize > 0) {
        // 从文件开头读取到 lastProcessedSize 位置，计算已处理的行数
        const previousContent = content.substring(0, lastProcessedSize);
        const previousLines = previousContent.trim().split('\n');
        startIndex = previousLines.length;

        // 验证：如果有 lastProcessedLine，检查是否匹配
        if (lastProcessedLine) {
          const expectedLineIndex = startIndex - 1;
          if (
            expectedLineIndex >= 0 &&
            previousLines[expectedLineIndex] !== lastProcessedLine
          ) {
            // 如果不匹配，使用 lastIndexOf 回退
            const lastIdx = lines.lastIndexOf(lastProcessedLine);
            if (lastIdx >= 0) {
              startIndex = lastIdx + 1;
            } else {
              // 完全找不到，可能是文件被截断，从当前 size 位置开始
              this.logger.warn(
                `Could not find last processed line for ${sessionId}, using size-based position: ${startIndex}`,
              );
            }
          }
        } else {
          // 没有 lastProcessedLine，使用 size 计算的位置（新逻辑）
          this.logger.debug(
            `No lastProcessedLine for ${sessionId}, using size-based position: ${startIndex}`,
          );
        }
      }

      // 只处理新增的行
      const newLines = lines.slice(startIndex);
      if (newLines.length === 0) {
        return;
      }

      // 警告：如果新增行数过多，可能是文件位置记录错误
      if (newLines.length > 100) {
        this.logger.warn(
          `Large batch detected: ${newLines.length} lines for ${sessionId} (startIndex=${startIndex}, total=${lines.length}). This may indicate a position tracking error.`,
        );
      }

      this.logger.debug(
        `Processing ${newLines.length} new lines for session ${sessionId} (${startIndex}/${lines.length})`,
      );

      // 更新最后处理的位置
      const newLastLine = lines[lines.length - 1];
      this.sessionFilePositions.set(sessionId, {
        size: currentSize,
        lastLine: newLastLine,
        lineCount: lines.length,
      });

      // 计算消息时间阈值（跳过超过 1 小时的旧消息）
      const ONE_HOUR_MS = 60 * 60 * 1000;
      const now = Date.now();
      const maxAgeMs = 24 * ONE_HOUR_MS; // 24 小时内的消息才处理

      // 处理每一行新增消息
      for (const line of newLines) {
        try {
          const entry = JSON.parse(line);

          if (entry.type !== 'message') {
            continue;
          }

          // 检查消息时间戳，跳过过旧的消息
          const messageTimestamp = entry.timestamp;
          if (messageTimestamp && now - messageTimestamp > maxAgeMs) {
            this.logger.debug(
              `Skipping old message: ${sessionId}, timestamp: ${new Date(messageTimestamp).toISOString()}`,
            );
            continue;
          }

          const role = entry.message?.role;
          const messageContent = entry.message?.content;

          // 处理 toolCall（审计关键：工具调用）
          if (Array.isArray(messageContent)) {
            for (const item of messageContent) {
              if (item?.type === 'toolCall') {
                const session = this.sessionState.getSession(sessionId) || {
                  sessionId,
                  messageCount: lines.length,
                };
                this.eventEmitter.emit('audit.session.message', {
                  sessionId,
                  message: {
                    type: 'skill:start',
                    skillName: item.name || 'unknown',
                    action: item.name || 'unknown',
                    input: item.arguments || {},
                    timestamp: Date.now(),
                  },
                  session,
                });
                this.logger.log(
                  `Tool call detected: ${item.name} in session ${sessionId}`,
                );
              }
            }
          }

          // 处理 toolResult（审计关键：工具执行结果）
          // 注意：toolResult 可能没有 message.role，而是直接在顶层有 toolName
          if (
            role === 'toolResult' ||
            (entry.type === 'message' && entry.toolName && !entry.message?.role)
          ) {
            const toolName =
              entry.toolName || entry.message?.toolCallId || 'unknown';
            const toolContent = entry.content || entry.message?.content;
            const isError = entry.isError ?? false;
            const durationMs = entry.details?.durationMs || 0;
            const session = this.sessionState.getSession(sessionId) || {
              sessionId,
              messageCount: lines.length,
            };
            this.eventEmitter.emit('audit.session.message', {
              sessionId,
              message: {
                type: 'skill:end',
                skillName: toolName,
                status: isError ? 'error' : 'success',
                output: toolContent,
                durationMs,
                timestamp: Date.now(),
              },
              session,
            });
            this.logger.log(
              `Tool result detected: ${toolName} (${isError ? 'error' : 'success'}) in session ${sessionId}`,
            );
            continue;
          }

          // 只处理 user 和 assistant 消息
          if (role !== 'user' && role !== 'assistant') {
            continue;
          }

          let textContent = '';

          if (typeof messageContent === 'string') {
            textContent = messageContent;
          } else if (Array.isArray(messageContent)) {
            for (const item of messageContent) {
              if (item?.type === 'text' && typeof item.text === 'string') {
                textContent += item.text;
              }
            }
          }

          // 触发会话消息事件
          const session = this.sessionState.getSession(sessionId) || {
            sessionId,
            messageCount: lines.length,
          };

          this.eventEmitter.emit('audit.session.message', {
            sessionId,
            message: {
              type: role,
              content: { text: textContent },
              timestamp: Date.now(),
            },
            session,
          });

          this.logger.log(
            `Session message event emitted: ${sessionId} (${role})`,
          );
        } catch (parseError) {
          this.logger.warn(`Failed to parse line: ${parseError}`);
        }
      }
    } catch (error) {
      this.logger.error('Error parsing session file update:', error as Error);
    }
  }

  /**
   * 扫描现有会话文件
   */
  private scanExistingSessions(
    sessionsDir: string,
    agentId: string = 'default',
  ): void {
    try {
      // 1. 从 sessions.json 读取已知会话
      const sessionsJsonPath = path.join(sessionsDir, 'sessions.json');
      if (fs.existsSync(sessionsJsonPath)) {
        try {
          const content = fs.readFileSync(sessionsJsonPath, 'utf-8');
          const sessions = JSON.parse(content);

          for (const [sessionKey, sessionData] of Object.entries(sessions)) {
            const data = sessionData as any;
            if (data.sessionId) {
              this.knownSessionFiles.add(data.sessionId);

              const sessionFile = data.sessionFile || data.sessionId + '.jsonl';
              const filePath = path.isAbsolute(sessionFile)
                ? sessionFile
                : path.join(sessionsDir, sessionFile);
              if (fs.existsSync(filePath)) {
                this.recordSessionPosition(filePath, data.sessionId, agentId);
              }
            }
          }
        } catch (parseError) {
          this.logger.warn(`Failed to parse sessions.json: ${parseError}`);
        }
      }

      // 2. 额外扫描目录中所有 .jsonl 文件，补漏 sessions.json 未记录的会话
      try {
        const jsonlFiles = fs
          .readdirSync(sessionsDir)
          .filter((f) => f.endsWith('.jsonl') && !f.includes('.reset.'));
        for (const jsonlFile of jsonlFiles) {
          const sessionId = path.basename(jsonlFile, '.jsonl');
          if (!this.knownSessionFiles.has(sessionId)) {
            this.knownSessionFiles.add(sessionId);
            const filePath = path.join(sessionsDir, jsonlFile);
            try {
              this.recordSessionPosition(filePath, sessionId, agentId);
              this.logger.debug(`Discovered orphaned session ${sessionId}`);
            } catch {
              // 文件可能正在写入，跳过
            }
          }
        }
      } catch (dirError) {
        this.logger.warn(`Failed to read sessions directory: ${dirError}`);
      }

      this.logger.log(
        `Scanned ${this.knownSessionFiles.size} existing sessions for agent ${agentId}`,
      );
    } catch (error) {
      this.logger.error('Error scanning existing sessions:', error as Error);
    }
  }

  /**
   * 记录会话文件的初始位置，并建立 session state
   * 不重放历史消息，仅让后续 watcher 增量推送正常工作
   */
  private recordSessionPosition(
    filePath: string,
    sessionId: string,
    agentId: string,
  ): void {
    const stats = fs.statSync(filePath);
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content
      .trim()
      .split('\n')
      .filter((line) => line.trim());
    const lastLine = lines.length > 0 ? lines[lines.length - 1] : '';

    this.sessionFilePositions.set(sessionId, {
      size: stats.size,
      lastLine,
      lineCount: lines.length,
    });

    this.logger.debug(
      `Recorded initial position for ${sessionId}: ${stats.size} bytes, ${lines.length} lines`,
    );

    // 解析文件元数据并建立 session state（同步执行）
    this.registerSessionStart(filePath, sessionId, agentId);
  }

  /**
   * 注册会话开始（同步版本，用于启动时扫描）
   * 与 parseNewSessionFile 逻辑一致，但不使用 async
   */
  private registerSessionStart(
    filePath: string,
    sessionId: string,
    agentId: string,
  ): void {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.trim().split('\n');
      if (lines.length === 0) return;

      // 从 sessions.json 中查找 sessionKey
      const sessionsDir = path.dirname(filePath);
      const sessionsJsonPath = path.join(sessionsDir, 'sessions.json');
      let sessionKey = `unknown:${sessionId}`;

      if (fs.existsSync(sessionsJsonPath)) {
        try {
          const sessionsData = JSON.parse(
            fs.readFileSync(sessionsJsonPath, 'utf-8'),
          );
          for (const [key, value] of Object.entries(sessionsData)) {
            if ((value as any).sessionId === sessionId) {
              sessionKey = key;
              break;
            }
          }
        } catch {
          // 忽略解析错误
        }
      }

      // 提取用户信息
      let userId = 'unknown';
      let userName = 'Unknown User';

      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          if (entry.type === 'message' && entry.message?.role === 'user') {
            const msgContent = entry.message.content;
            if (
              typeof msgContent === 'string' &&
              msgContent.includes('System:')
            ) {
              const match = msgContent.match(/\[(.*?)\]/);
              if (match) {
                const parts = match[1].split('|');
                if (parts.length > 1) {
                  const userInfo = parts[1].trim();
                  const userMatch = userInfo.match(/\((ou_[a-f0-9]+)\)/);
                  if (userMatch) {
                    userId = userMatch[1];
                    userName = userInfo.split('(')[0].trim();
                  }
                }
              }
            }
            break;
          }
        } catch {
          // 忽略解析错误
        }
      }

      this.onSessionStart({
        sessionId,
        sessionKey,
        user: { id: userId, name: userName },
        account: `${agentId}:${this.extractAccount(sessionKey)}`,
      });
    } catch (error) {
      this.logger.warn(`Failed to register session ${sessionId}: ${error}`);
    }
  }

  /**
   * 处理新会话文件
   */
  private handleNewSessionFile(filePath: string, agentId: string): void {
    try {
      const sessionId = path.basename(filePath, '.jsonl');

      // 忽略 reset 文件
      if (sessionId.includes('.reset.')) {
        return;
      }

      if (!this.knownSessionFiles.has(sessionId)) {
        this.knownSessionFiles.add(sessionId);
        this.logger.log(
          `New session file detected: ${sessionId} (agent: ${agentId})`,
        );

        this.recordSessionPosition(filePath, sessionId, agentId);
      }
    } catch (error) {
      this.logger.error('Error handling new session file:', error as Error);
    }
  }

  /**
   * 解析新会话文件
   */
  private async parseNewSessionFile(
    filePath: string,
    sessionId: string,
    agentId: string,
  ): Promise<void> {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.trim().split('\n');

      if (lines.length === 0) {
        return;
      }

      // 从 sessions.json 中查找 sessionKey
      const sessionsDir = path.dirname(filePath);
      const sessionsJsonPath = path.join(sessionsDir, 'sessions.json');
      let sessionKey = `unknown:${sessionId}`;

      if (fs.existsSync(sessionsJsonPath)) {
        try {
          const sessionsData = JSON.parse(
            fs.readFileSync(sessionsJsonPath, 'utf-8'),
          );
          for (const [key, value] of Object.entries(sessionsData)) {
            if ((value as any).sessionId === sessionId) {
              sessionKey = key;
              break;
            }
          }
        } catch {
          // 忽略解析错误
        }
      }

      // 提取用户信息 - 从第一条 user 消息中提取
      let userId = 'unknown';
      let userName = 'Unknown User';

      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          if (entry.type === 'message' && entry.message?.role === 'user') {
            const content = entry.message.content;
            if (typeof content === 'string' && content.includes('System:')) {
              // 从系统消息中提取用户 ID
              const match = content.match(/\[(.*?)\]/);
              if (match) {
                const parts = match[1].split('|');
                if (parts.length > 1) {
                  const userInfo = parts[1].trim();
                  const userMatch = userInfo.match(/\((ou_[a-f0-9]+)\)/);
                  if (userMatch) {
                    userId = userMatch[1];
                    userName = userInfo.split('(')[0].trim();
                  }
                }
              }
            }
            break;
          }
        } catch {
          // 忽略解析错误
        }
      }

      // 触发会话开始事件
      this.onSessionStart({
        sessionId,
        sessionKey,
        user: { id: userId, name: userName },
        account: `${agentId}:${this.extractAccount(sessionKey)}`,
      });
    } catch (error) {
      this.logger.error('Error parsing session file:', error as Error);
    }
  }

  /**
   * 处理 sessions.json 变化
   */
  private handleSessionsJsonChange(filePath: string, agentId: string): void {
    // 简化实现：不处理增量更新，依赖文件监听捕获新 .jsonl 文件
    this.logger.debug(`sessions.json changed for agent ${agentId}`);
  }

  /**
   * 会话开始
   */
  onSessionStart(sessionData: Partial<SessionEvent>): void {
    const sessionId = sessionData.sessionId!;

    // 使用 SessionStateService 存储会话状态
    const sessionState = this.sessionState.upsert(sessionId, {
      sessionId,
      sessionKey: sessionData.sessionKey!,
      user: sessionData.user!,
      account: sessionData.account!,
      startTime: Date.now(),
      messageCount: 0,
      status: 'active',
      lastActivity: Date.now(),
    });

    this.logger.debug(`Session started: ${sessionId}`);

    // 触发推送事件
    this.eventEmitter.emit('audit.session.start', sessionState);
  }

  /**
   * 会话消息（用户消息、AI 回复、技能调用）
   */
  async onSessionMessage(
    sessionId: string,
    message: {
      type: 'user' | 'assistant' | 'skill:start' | 'skill:end';
      content: any;
      timestamp: number;
    },
  ): Promise<void> {
    // 从 SessionStateService 获取或创建会话状态
    let sessionState = this.sessionState.getSession(sessionId);

    if (!sessionState) {
      // 会话不存在，尝试恢复
      this.logger.warn(
        `Session not found: ${sessionId}, attempting to recover`,
      );
      await this.recoverSession(sessionId);
      sessionState = this.sessionState.getSession(sessionId);

      if (!sessionState) {
        this.logger.error(`Failed to recover session: ${sessionId}`);
        return;
      }
    }

    // 更新会话状态
    sessionState = this.sessionState.update(sessionId, {
      messageCount: sessionState.messageCount + 1,
    });

    // 更新 Token 信息（如果是 AI 回复）
    if (message.type === 'assistant') {
      this.sessionState.update(sessionId, {
        tokenInput: message.content.tokens?.input,
        tokenOutput: message.content.tokens?.output,
      });
    }

    // 触发推送事件
    this.eventEmitter.emit('audit.session.message', {
      sessionId,
      message,
      session: sessionState,
    });
  }

  /**
   * 获取会话
   */
  getSession(sessionId: string): unknown {
    return this.sessionState.getSession(sessionId);
  }

  /**
   * 获取所有活跃会话
   */
  getActiveSessions(): any[] {
    return this.sessionState.getActiveSessions();
  }

  /**
   * 获取 Watcher 状态
   */
  getWatcherStatus(): {
    ready: boolean;
    activeSessions: number;
  } {
    return {
      ready: this.watcherReady,
      activeSessions: this.sessionState.getActiveSessions().length,
    };
  }

  /**
   * 检测会话结束（超时机制）
   */
  private startCleanupTimer(): void {
    this.cleanupInterval = setInterval(() => {
      // 使用 SessionStateService 清理超时会话
      const completedSessions = this.sessionState.cleanupTimeout(
        this.SESSION_END_TIMEOUT_MS,
      );

      for (const session of completedSessions) {
        this.logger.log(`Session completed (timeout): ${session.sessionId}`);
        // 触发推送事件
        this.eventEmitter.emit('audit.session.end', session);
      }
    }, 60000); // 每分钟检查一次

    this.logger.debug('Session cleanup timer started');
  }

  /**
   * 完成会话
   */
  private async completeSession(sessionId: string): Promise<void> {
    const sessionState = this.sessionState.getSession(sessionId);
    if (!sessionState || sessionState.status === 'completed') return;

    // 更新会话状态为完成
    const completedSession = this.sessionState.complete(sessionId);

    if (completedSession) {
      this.logger.log(`Session completed: ${sessionId}`);

      // 触发推送事件
      this.eventEmitter.emit('audit.session.end', completedSession);

      // 从活跃会话移除（SessionStateService 内部处理）
    }
  }

  /**
   * 恢复会话（从 sessions.json 读取）
   * 注：当前版本暂不实现，待后续从 sessions.json 直接读取
   */
  private async recoverSession(sessionId: string): Promise<void> {
    this.logger.warn(`Session recovery not implemented for: ${sessionId}`);
    return;
  }

  /**
   * 从 sessionKey 提取 account 信息
   */
  private extractAccount(sessionKey: string): string {
    // agent:main:main -> main (agent ID)
    // agent:main:feishu:direct:ou_xxx -> feishu
    const parts = sessionKey.split(':');

    // 如果是旧格式（agent:main:provider:...），返回 provider
    if (parts.length >= 3 && parts[2] !== 'main') {
      return parts[2];
    }

    // 如果是新格式（agent:main:main），尝试从 sessions.json 读取 provider
    if (parts.length === 3 && parts[2] === 'main') {
      const sessionsDir = this.configService
        .getConfig()
        .sources?.find((s) => s.type === 'openclaw')?.config?.sessionsDir;
      if (sessionsDir) {
        try {
          const sessionsJsonPath = path.join(sessionsDir, 'sessions.json');
          if (fs.existsSync(sessionsJsonPath)) {
            const sessionsData = JSON.parse(
              fs.readFileSync(sessionsJsonPath, 'utf-8'),
            );
            const sessionEntry = sessionsData[sessionKey];
            if (sessionEntry?.origin?.provider) {
              return sessionEntry.origin.provider;
            }
          }
        } catch {
          // 忽略解析错误
        }
      }
    }

    return 'unknown';
  }

  onModuleDestroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    for (const watcher of this.watchers) {
      watcher.close();
    }
    this.logger.log('SessionManager destroyed');
  }
}
