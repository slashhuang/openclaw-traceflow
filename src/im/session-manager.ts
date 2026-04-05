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

  // 记录每个会话文件最后处理的位置（用于增量推送）
  private sessionFilePositions: Map<
    string,
    { size: number; lastLine: string }
  > = new Map();

  constructor(
    private eventEmitter: EventEmitter2,
    private configService: ConfigService,
    sessionState: SessionStateService,
  ) {
    this.sessionState = sessionState;
    this.startCleanupTimer();
  }

  async onModuleInit(): Promise<void> {
    // 1. 先订阅 OpenClawFileWatcher 的事件（如果存在），将其转换为 audit.session 事件
    this.subscribeToOpenClawFileWatcherEvents();

    // 2. 延迟启动自己的文件监听器，等待配置加载完成
    setTimeout(() => {
      this.startFileWatcher();
    }, 3000);
  }

  /**
   * 订阅 OpenClawFileWatcher 的事件，转换为 audit.session 事件
   * 这样两个监听器可以共存，事件都会被正确处理
   */
  private subscribeToOpenClawFileWatcherEvents(): void {
    // 订阅 session:start 事件
    this.eventEmitter.on('session:start', (data) => {
      this.logger.debug(`Received session:start event: ${data.sessionId}`);
      // 从 sessions.json 中查找 sessionKey
      const sessionsDir = this.configService
        .getConfig()
        .sources?.find((s) => s.type === 'openclaw')?.config?.sessionsDir;

      if (sessionsDir) {
        const sessionsJsonPath = path.join(sessionsDir, 'sessions.json');
        let sessionKey = `unknown:${data.sessionId}`;

        if (fs.existsSync(sessionsJsonPath)) {
          try {
            const sessionsData = JSON.parse(
              fs.readFileSync(sessionsJsonPath, 'utf-8'),
            );
            for (const [key, value] of Object.entries(sessionsData)) {
              if ((value as any).sessionId === data.sessionId) {
                sessionKey = key;
                break;
              }
            }
          } catch {
            // 忽略解析错误
          }
        }

        // 存储会话状态到 SessionStateService
        const sessionState = this.sessionState.upsert(data.sessionId, {
          sessionId: data.sessionId,
          sessionKey,
          user: { id: 'unknown', name: 'Unknown User' },
          account: this.extractAccount(sessionKey),
          status: 'active',
        });

        void this.onSessionStart(sessionState);
      }
    });

    // 订阅 session:message 事件
    this.eventEmitter.on('session:message', (data) => {
      this.logger.debug(
        `Received session:message event: ${data.sessionId}, type: ${data.record?.type}`,
      );

      const sessionId = data.sessionId || data.sessionKey;
      if (!sessionId) return;

      const record = data.record;
      if (!record || record.type !== 'message') return;

      const role = record.message?.role;
      if (role !== 'user' && role !== 'assistant' && role !== 'toolResult') return;

      const messageContent = record.message?.content;

      // 处理 toolCall（审计关键：工具调用）
      if (Array.isArray(messageContent)) {
        for (const item of messageContent) {
          if (item?.type === 'toolCall') {
            // 触发技能开始事件
            this.eventEmitter.emit('audit.session.message', {
              sessionId,
              message: {
                type: 'skill:start',
                skillName: item.name || 'unknown',
                action: item.name || 'unknown',
                input: item.arguments || {},
                timestamp: Date.now(),
              },
              session: this.sessionState.getSession(sessionId) || { sessionId },
            });
            this.logger.log(`Tool call detected: ${item.name} in session ${sessionId}`);
          }
        }
      }

      // 处理 toolResult（审计关键：工具执行结果）
      if (role === 'toolResult') {
        const toolName = record.toolName || record.message?.toolCallId || 'unknown';
        const toolContent = record.content || record.message?.content;

        this.eventEmitter.emit('audit.session.message', {
          sessionId,
          message: {
            type: 'skill:end',
            skillName: toolName,
            status: record.isError ? 'error' : 'success',
            output: toolContent,
            durationMs: record.details?.durationMs || 0,
            timestamp: Date.now(),
          },
          session: this.sessionState.getSession(sessionId) || { sessionId },
        });
        this.logger.log(`Tool result detected: ${toolName} (${record.isError ? 'error' : 'success'}) in session ${sessionId}`);
        return;
      }

      // 处理 user/assistant 文本消息
      if (role !== 'user' && role !== 'assistant') return;

      // 提取消息内容
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

      // 从 SessionStateService 获取或创建会话状态
      let sessionState = this.sessionState.getSession(sessionId);
      if (!sessionState) {
        sessionState = this.sessionState.upsert(sessionId, {
          sessionId,
          sessionKey: sessionId,
          user: { id: 'unknown', name: 'Unknown User' },
          account: 'unknown',
          status: 'active',
        });
      }

      // 触发 audit.session.message 事件
      this.eventEmitter.emit('audit.session.message', {
        sessionId,
        message: {
          type: role,
          content: { text: textContent },
          timestamp: Date.now(),
        },
        session: sessionState,
      });
    });
  }

  /**
   * 启动文件监听器
   * 监听 openclawStateDir/agents 目录下所有 agent 的 sessions
   */
  private startFileWatcher(): void {
    const config = this.configService.getConfig();

    // 优先使用 openclawStateDir，自动发现所有 agent
    const stateDir = config.openclawStateDir;
    let agentsSessionsDirs: { agentId: string; sessionsDir: string }[] = [];

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
  private startAgentFileWatcher(
    agentId: string,
    sessionsDir: string,
  ): void {
    this.logger.log(`Starting watcher for agent ${agentId}: ${sessionsDir}`);

    // 监听 sessions.json 文件
    const sessionsJsonPath = path.join(sessionsDir, 'sessions.json');

    // 先扫描现有文件
    this.scanExistingSessions(sessionsDir, agentId);

    // 监听文件变化
    const watcher = chokidar.watch(sessionsDir, {
      ignored: (filePath) => {
        // 只监听 .jsonl 和 sessions.json 文件
        const basename = path.basename(filePath);
        const shouldIgnore = !(
          basename.endsWith('.jsonl') || basename === 'sessions.json'
        );
        if (!shouldIgnore) {
          this.logger.debug(`Watching file: ${basename}`);
        }
        return shouldIgnore;
      },
      persistent: true,
      ignoreInitial: true,
      // macOS 使用 polling 模式，确保能检测到文件变化
      usePolling: true,
      interval: 1000, // 1 秒轮询一次
      // awaitWriteFinish 配置
      awaitWriteFinish: {
        // 等待写入完成，避免在文件还在写入时触发事件
        stabilityThreshold: 500,
        pollInterval: 100,
      },
      // atomic 处理原子写入
      atomic: true,
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

      // 如果是新会话（之前没见过），先触发会话开始事件
      if (!this.sessionState.getSession(sessionId)) {
        this.logger.log(`Detected unknown session, parsing file: ${sessionId}`);
        this.parseNewSessionFile(filePath, sessionId, agentId);
        return;
      }

      // 触发会话消息事件（解析文件内容并推送）
      this.parseSessionFileUpdate(filePath, sessionId);
    } catch (error) {
      this.logger.error('Error handling session file change:', error as Error);
    }
  }

  /**
   * 解析会话文件更新（增量推送：只处理新增的行）
   */
  private async parseSessionFileUpdate(
    filePath: string,
    sessionId: string,
  ): Promise<void> {
    try {
      // 读取完整文件内容
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.trim().split('\n');

      if (lines.length === 0) {
        return;
      }

      // 获取上次处理的位置
      const position = this.sessionFilePositions.get(sessionId);
      const lastProcessedLine = position?.lastLine || '';

      // 找到上次处理的行索引
      let startIndex = 0;
      if (lastProcessedLine) {
        const lastIdx = lines.lastIndexOf(lastProcessedLine);
        if (lastIdx >= 0) {
          startIndex = lastIdx + 1;
        }
      }

      // 只处理新增的行
      const newLines = lines.slice(startIndex);
      if (newLines.length === 0) {
        return;
      }

      this.logger.debug(
        `Processing ${newLines.length} new lines for session ${sessionId}`,
      );

      // 更新最后处理的位置
      const newLastLine = lines[lines.length - 1];
      const stats = fs.statSync(filePath);
      this.sessionFilePositions.set(sessionId, {
        size: stats.size,
        lastLine: newLastLine,
      });

      // 处理每一行新增消息
      for (const line of newLines) {
        try {
          const entry = JSON.parse(line);

          if (entry.type !== 'message') {
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
                this.logger.log(`Tool call detected: ${item.name} in session ${sessionId}`);
              }
            }
          }

          // 处理 toolResult（审计关键：工具执行结果）
          if (role === 'toolResult') {
            const toolName = entry.toolName || entry.message?.toolCallId || 'unknown';
            const toolContent = entry.content || entry.message?.content;
            const session = this.sessionState.getSession(sessionId) || {
              sessionId,
              messageCount: lines.length,
            };
            this.eventEmitter.emit('audit.session.message', {
              sessionId,
              message: {
                type: 'skill:end',
                skillName: toolName,
                status: entry.isError ? 'error' : 'success',
                output: toolContent,
                durationMs: entry.details?.durationMs || 0,
                timestamp: Date.now(),
              },
              session,
            });
            this.logger.log(`Tool result detected: ${toolName} (${entry.isError ? 'error' : 'success'}) in session ${sessionId}`);
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
  private scanExistingSessions(sessionsDir: string, agentId: string = 'default'): void {
    try {
      const sessionsJsonPath = path.join(sessionsDir, 'sessions.json');
      if (fs.existsSync(sessionsJsonPath)) {
        const content = fs.readFileSync(sessionsJsonPath, 'utf-8');
        const sessions = JSON.parse(content);

        for (const [sessionKey, sessionData] of Object.entries(sessions)) {
          const data = sessionData as any;
          if (data.sessionId) {
            this.knownSessionFiles.add(data.sessionId);

            // 记录初始文件位置，用于增量推送
            const sessionFile = data.sessionFile || data.sessionId + '.jsonl';
            const filePath = path.isAbsolute(sessionFile)
              ? sessionFile
              : path.join(sessionsDir, sessionFile);
            if (fs.existsSync(filePath)) {
              const stats = fs.statSync(filePath);
              const fileContent = fs.readFileSync(filePath, 'utf-8');
              const lines = fileContent
                .trim()
                .split('\n')
                .filter((line) => line.trim());
              const lastLine = lines.length > 0 ? lines[lines.length - 1] : '';

              this.sessionFilePositions.set(data.sessionId, {
                size: stats.size,
                lastLine,
              });

              this.logger.debug(
                `Recorded initial position for ${data.sessionId}: ${stats.size} bytes`,
              );
            }
          }
        }

        this.logger.log(
          `Scanned ${this.knownSessionFiles.size} existing sessions for agent ${agentId}`,
        );
      }
    } catch (error) {
      this.logger.error('Error scanning existing sessions:', error as Error);
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
        this.logger.log(`New session file detected: ${sessionId} (agent: ${agentId})`);

        // 记录初始文件位置，不推送历史消息
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
        });

        this.logger.debug(
          `Recorded initial position for new session ${sessionId}: ${stats.size} bytes`,
        );

        // 读取文件获取会话信息（但不推送历史消息）
        this.parseNewSessionFile(filePath, sessionId, agentId);
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
      await this.onSessionStart({
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
  async onSessionStart(sessionData: Partial<SessionEvent>): Promise<void> {
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
  getSession(sessionId: string): any | undefined {
    return this.sessionState.getSession(sessionId);
  }

  /**
   * 获取所有活跃会话
   */
  getActiveSessions(): any[] {
    return this.sessionState.getActiveSessions();
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
