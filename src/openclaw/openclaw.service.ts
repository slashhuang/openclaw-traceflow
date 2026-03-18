import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '../config/config.service';
import {
  resolveOpenClawPaths,
  type OpenClawResolvedPaths,
} from './openclaw-paths.resolver';
import * as fs from 'fs';
import * as path from 'path';

export interface OpenClawSession {
  sessionKey: string;
  sessionId: string;
  userId?: string;
  status: 'active' | 'idle' | 'completed' | 'failed';
  createdAt: number;
  lastActiveAt: number;
  tokenUsage?: {
    input: number;
    output: number;
    total: number;
    limit?: number;
  };
}

export interface OpenClawSessionDetail extends OpenClawSession {
  messages: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: number;
    tokenCount?: number;
  }>;
  toolCalls: Array<{
    name: string;
    input: any;
    output: any;
    durationMs: number;
    success: boolean;
    error?: string;
  }>;
  events: Array<{
    type: string;
    timestamp: number;
    payload: any;
  }>;
}

export interface OpenClawHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  uptime: number;
  memoryUsage: number;
  activeSessions: number;
  maxConcurrentSessions: number;
  skills: Array<{
    name: string;
    enabled: boolean;
    lastCalledAt?: number;
  }>;
}

interface SessionFile {
  sessionId: string;
  filePath: string;
  createdAt: number;
  updatedAt: number;
}

@Injectable()
export class OpenClawService {
  private readonly logger = new Logger(OpenClawService.name);
  private baseUrl: string;
  /** 解析缓存，避免每次请求都 exec openclaw */
  private pathsCache: { at: number; paths: OpenClawResolvedPaths } | null = null;
  private static readonly PATHS_TTL_MS = 60_000;

  constructor(private configService: ConfigService) {
    this.baseUrl = this.configService.getConfig().openclawGatewayUrl;
  }

  /**
   * 解析 OpenClaw 的 stateDir / configPath / workspaceDir（CLI + 环境变量 + 启发式）
   */
  async getResolvedPaths(forceRefresh = false): Promise<OpenClawResolvedPaths> {
    if (
      !forceRefresh &&
      this.pathsCache &&
      Date.now() - this.pathsCache.at < OpenClawService.PATHS_TTL_MS
    ) {
      return this.pathsCache.paths;
    }
    const cfg = this.configService.getConfig();
    const paths = await resolveOpenClawPaths({
      explicitStateDir: cfg.openclawStateDir,
      gatewayHttpUrl: cfg.openclawGatewayUrl,
      gatewayToken: cfg.openclawGatewayToken,
      gatewayPassword: cfg.openclawGatewayPassword,
    });
    this.pathsCache = { at: Date.now(), paths };
    if (paths.stateDir) {
      this.logger.debug(
        `OpenClaw paths: stateDir=${paths.stateDir} config=${paths.configPath ?? 'n/a'} workspace=${paths.workspaceDir ?? 'n/a'} (${JSON.stringify(paths.source)})`,
      );
    } else if (paths.cliHint) {
      this.logger.warn(`OpenClaw path discovery: ${paths.cliHint}`);
    }
    if (paths.gatewayHint && paths.source.stateDir !== 'gateway') {
      this.logger.debug(`Gateway path hint: ${paths.gatewayHint}`);
    }
    return paths;
  }

  private async stateDir(): Promise<string> {
    const p = await this.getResolvedPaths();
    return p.stateDir ?? '';
  }

  /**
   * 检查 OpenClaw Gateway 连接状态
   */
  async checkConnection(): Promise<{ connected: boolean; error?: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        return { connected: false, error: `HTTP ${response.status}` };
      }

      return { connected: true };
    } catch (error: any) {
      return { connected: false, error: error.message || 'Connection failed' };
    }
  }

  /**
   * 获取 Gateway 健康状态
   */
  async getHealth(): Promise<OpenClawHealth> {
    try {
      const response = await fetch(`${this.baseUrl}/health`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return response.json();
    } catch (error) {
      this.logger.error('Failed to get health:', error);
      throw error;
    }
  }

  /**
   * 获取会话列表（从文件系统读取）
   */
  async listSessions(): Promise<OpenClawSession[]> {
    const dir = await this.stateDir();
    if (!dir) {
      this.logger.warn(
        'State directory unknown: set OPENCLAW_STATE_DIR or install `openclaw` CLI so we can run `openclaw config file`',
      );
      return [];
    }

    try {
      const agentsDir = path.join(dir, 'agents');
      if (!fs.existsSync(agentsDir)) {
        return [];
      }

      const sessions: OpenClawSession[] = [];

      // 读取所有 agent 目录
      const agentDirs = fs.readdirSync(agentsDir);
      for (const agent of agentDirs) {
        const sessionsDir = path.join(agentsDir, agent, 'sessions');
        if (!fs.existsSync(sessionsDir)) {
          continue;
        }

        // 读取所有会话文件
        const files = fs.readdirSync(sessionsDir);
        for (const file of files) {
          if (!file.endsWith('.jsonl') || file.includes('.reset.')) {
            continue; // 跳过重置文件
          }

          const sessionId = file.replace('.jsonl', '');
          const filePath = path.join(sessionsDir, file);
          const stats = fs.statSync(filePath);

          // 读取第一行获取会话信息
          const firstLine = fs.readFileSync(filePath, 'utf-8').split('\n')[0];
          if (!firstLine) {
            continue;
          }

          try {
            const sessionData = JSON.parse(firstLine);
            sessions.push({
              sessionKey: `${agent}/${sessionId}`,
              sessionId: sessionId,
              userId: sessionData?.user || 'unknown',
              status: this.inferSessionStatus(sessionData, stats.mtimeMs),
              createdAt: stats.birthtimeMs,
              lastActiveAt: stats.mtimeMs,
              tokenUsage: sessionData?.tokenUsage,
            });
          } catch (e) {
            // 跳过无法解析的文件
          }
        }
      }

      // 按最后活跃时间排序
      return sessions.sort((a, b) => b.lastActiveAt - a.lastActiveAt);
    } catch (error) {
      this.logger.error('Failed to list sessions from filesystem:', error);
      return [];
    }
  }

  private inferSessionStatus(lastMessage: any, mtimeMs: number): 'active' | 'idle' | 'completed' | 'failed' {
    const now = Date.now();
    const fiveMinutesAgo = now - 5 * 60 * 1000;

    if (lastMessage?.type === 'agent:final') {
      return 'completed';
    }

    if (mtimeMs > fiveMinutesAgo) {
      return 'active';
    }

    return 'idle';
  }

  /**
   * 获取会话详情（从文件系统读取）
   */
  async getSessionDetail(sessionId: string): Promise<OpenClawSessionDetail | null> {
    if (!(await this.stateDir())) {
      this.logger.warn('State directory not configured');
      return null;
    }

    try {
      // 查找会话文件
      const sessionFile = await this.findSessionFile(sessionId);
      if (!sessionFile) {
        return null;
      }

      const content = fs.readFileSync(sessionFile.filePath, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim());

      if (lines.length === 0) {
        return null;
      }

      const messages: OpenClawSessionDetail['messages'] = [];
      const toolCalls: OpenClawSessionDetail['toolCalls'] = [];
      const events: OpenClawSessionDetail['events'] = [];

      let firstUserData: any = null;
      let tokenUsage: any = null;

      for (const line of lines) {
        try {
          const entry = JSON.parse(line);

          // 提取用户信息
          if (!firstUserData && entry.user) {
            firstUserData = entry;
          }

          // 提取 token 使用
          if (entry.tokenUsage) {
            tokenUsage = entry.tokenUsage;
          }

          // 提取消息
          if (entry.message) {
            const messageContent = entry.message.content;
            // 处理 content 可能是数组或字符串的情况
            let contentText = '';
            if (Array.isArray(messageContent)) {
              // 从 content 数组中提取 toolCall 信息和文本
              for (const item of messageContent) {
                if (item.type === 'toolCall') {
                  toolCalls.push({
                    name: item.name || item.toolName || 'unknown',
                    input: item.arguments || item.input || {},
                    output: item.result || item.output || {},
                    durationMs: item.durationMs || 0,
                    success: true,
                    error: item.error,
                  });
                } else if (item.type === 'text') {
                  contentText += item.text || '';
                } else if (item.type === 'thinking') {
                  // 跳过 thinking 内容，不显示
                }
              }
              // 如果没有提取到 text，则显示简洁的工具调用摘要
              if (!contentText && toolCalls.length > 0) {
                contentText = '[工具调用：' + toolCalls.map(t => t.name).join(', ') + ']';
              } else if (!contentText) {
                contentText = '[无内容]';
              }
            } else {
              contentText = typeof messageContent === 'string' ? messageContent : JSON.stringify(messageContent);
            }

            messages.push({
              role: entry.message.role as 'user' | 'assistant' | 'system',
              content: contentText,
              timestamp: entry.timestamp || Date.now(),
              tokenCount: entry.message.tokenCount,
            });
          }

          // 提取工具调用（兼容旧的 toolUse 格式）
          if (entry.toolUse && !toolCalls.some(tc => tc.name === entry.toolUse.name)) {
            toolCalls.push({
              name: entry.toolUse.name,
              input: entry.toolUse.input || {},
              output: entry.toolUse.output || {},
              durationMs: entry.toolUse.durationMs || 0,
              success: entry.toolUse.success !== false,
              error: entry.toolUse.error,
            });
          }

          // 提取事件
          if (entry.type && !entry.message && !entry.toolUse) {
            events.push({
              type: entry.type,
              timestamp: entry.timestamp || Date.now(),
              payload: entry,
            });
          }
        } catch (e) {
          // 跳过无法解析的行
        }
      }

      const stats = fs.statSync(sessionFile.filePath);

      return {
        sessionKey: sessionFile.sessionId,
        sessionId: sessionFile.sessionId,
        userId: firstUserData?.user || 'unknown',
        status: this.inferSessionStatus(firstUserData, stats.mtimeMs),
        createdAt: stats.birthtimeMs,
        lastActiveAt: stats.mtimeMs,
        tokenUsage: tokenUsage,
        messages,
        toolCalls,
        events,
      };
    } catch (error) {
      this.logger.error('Failed to get session detail:', error);
      return null;
    }
  }

  private async findSessionFile(sessionId: string): Promise<SessionFile | null> {
    const dir = await this.stateDir();
    const agentsDir = path.join(dir, 'agents');
    if (!fs.existsSync(agentsDir)) {
      return null;
    }

    const agentDirs = fs.readdirSync(agentsDir);
    for (const agent of agentDirs) {
      const sessionsDir = path.join(agentsDir, agent, 'sessions');
      if (!fs.existsSync(sessionsDir)) {
        continue;
      }

      const filePath = path.join(sessionsDir, `${sessionId}.jsonl`);
      if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        return {
          sessionId: `${agent}/${sessionId}`,
          filePath,
          createdAt: stats.birthtimeMs,
          updatedAt: stats.mtimeMs,
        };
      }
    }

    return null;
  }

  /**
   * 终止会话（通过删除会话文件）
   */
  async killSession(sessionId: string): Promise<boolean> {
    if (!(await this.stateDir())) {
      this.logger.warn('State directory not configured');
      return false;
    }

    try {
      const sessionFile = await this.findSessionFile(sessionId);
      if (!sessionFile) {
        return false;
      }

      fs.unlinkSync(sessionFile.filePath);
      this.logger.log(`Killed session: ${sessionId}`);
      return true;
    } catch (error) {
      this.logger.error('Failed to kill session:', error);
      return false;
    }
  }

  /**
   * 获取最近日志（从 OpenClaw 日志文件读取）
   */
  async getRecentLogs(limit: number = 100): Promise<string[]> {
    const config = this.configService.getConfig();
    const logPath = config.openclawLogPath;

    if (!logPath) {
      this.logger.warn('Log file path not configured (OPENCLAW_LOG_PATH)');
      return [];
    }

    try {
      if (!fs.existsSync(logPath)) {
        return [];
      }

      const content = fs.readFileSync(logPath, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim());

      // 返回最后 N 行
      return lines.slice(-limit);
    } catch (error) {
      this.logger.error('Failed to get recent logs:', error);
      return [];
    }
  }

  /**
   * 更新配置（通过 openclaw CLI）
   */
  async updateConfig(config: Record<string, unknown>): Promise<boolean> {
    try {
      const { execFile } = await import('child_process');
      const util = await import('util');
      const execFileAsync = util.promisify(execFile);
      const cli = process.env.OPENCLAW_CLI || 'openclaw';

      for (const [key, value] of Object.entries(config)) {
        const v =
          typeof value === 'string' ? value : JSON.stringify(value ?? '');
        await execFileAsync(cli, ['config', 'set', key, v], {
          env: process.env,
          timeout: 60_000,
        });
      }
      await this.getResolvedPaths(true);
      return true;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to update config:', msg);
      return false;
    }
  }
}
