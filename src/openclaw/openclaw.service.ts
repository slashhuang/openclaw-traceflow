import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '../config/config.service';
import {
  resolveOpenClawPaths,
  type OpenClawResolvedPaths,
} from './openclaw-paths.resolver';
import { fetchRuntimePathsFromGateway } from './gateway-ws-paths';
import {
  fetchStatusOverview,
  type StatusOverviewResult,
} from './gateway-rpc';
import * as fs from 'fs';
import * as path from 'path';

export interface OpenClawSession {
  sessionKey: string;
  sessionId: string;
  userId?: string;
  status: 'active' | 'idle' | 'completed' | 'failed';
  createdAt: number;
  lastActiveAt: number;
  /** 总 token 数（来自 sessions.json） */
  totalTokens?: number;
  /** 模型 context 上限（用于计算利用率） */
  contextTokens?: number;
  /** 使用的模型 */
  model?: string;
  tokenUsage?: {
    input: number;
    output: number;
    total: number;
    limit?: number;
    utilization?: number;
  };
}

export interface OpenClawSessionDetail extends OpenClawSession {
  messages: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: number;
    tokenCount?: number;
    /** 发送者标识（从消息内容中提取，仅 user 消息可能有） */
    sender?: string;
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

/**
 * 从消息内容中提取 sender（用户标识）。
 * 消息可能包含：1) senderLabel 属性 2) 元数据块 3) 群聊格式 "SenderName: body"
 */
function extractSenderFromMessageContent(text: string): string | null {
  if (!text || typeof text !== 'string') return null;
  const trimmed = text.trim();
  if (!trimmed) return null;

  // 1. Sender (untrusted metadata) 块
  const senderBlockMatch = trimmed.match(
    /Sender \(untrusted metadata\):\s*\n```json\s*\n([\s\S]*?)\n```/
  );
  if (senderBlockMatch) {
    try {
      const obj = JSON.parse(senderBlockMatch[1]);
      const v = obj?.label || obj?.name || obj?.username || obj?.e164 || obj?.id;
      if (typeof v === 'string' && v.trim()) return v.trim();
    } catch {
      /* ignore */
    }
  }

  // 2. Conversation info 块中的 sender
  const convBlockMatch = trimmed.match(
    /Conversation info \(untrusted metadata\):\s*\n```json\s*\n([\s\S]*?)\n```/
  );
  if (convBlockMatch) {
    try {
      const obj = JSON.parse(convBlockMatch[1]);
      const v = obj?.sender;
      if (typeof v === 'string' && v.trim()) return v.trim();
    } catch {
      /* ignore */
    }
  }

  // 3. 群聊 envelope 格式: [Channel from ts] SenderName: body 或 SenderName: body
  const afterEnvelope = trimmed.replace(/^\[[^\]]+\]\s*/, '');
  const colonMatch = afterEnvelope.match(/^([^:\n]+):\s/);
  if (colonMatch) {
    const sender = colonMatch[1].trim();
    if (sender === '(self)') return 'self';
    if (sender.length > 0 && sender.length < 200) return sender;
  }

  return null;
}

function extractSenderFromMessageEntry(entry: {
  message?: { role?: string; content?: unknown; senderLabel?: string };
  user?: string;
}): string | null {
  if (entry?.user && typeof entry.user === 'string' && entry.user.trim()) {
    return entry.user.trim();
  }
  const msg = entry?.message;
  if (!msg) return null;
  if (typeof msg.senderLabel === 'string' && msg.senderLabel.trim()) {
    return msg.senderLabel.trim();
  }
  if (msg.role !== 'user') return null;
  const content = msg.content;
  let text = '';
  if (typeof content === 'string') text = content;
  else if (Array.isArray(content)) {
    for (const item of content) {
      if (item?.type === 'text' && typeof item.text === 'string') {
        text += item.text;
      }
    }
  }
  return extractSenderFromMessageContent(text) || null;
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

  /** 清除路径缓存（配置更新后调用） */
  clearPathsCache(): void {
    this.pathsCache = null;
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
      explicitWorkspaceDir: cfg.openclawWorkspaceDir,
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
   * 参考 openclaw 的 control-ui：通过 WebSocket connect 握手验证，包含 token/password 鉴权
   */
  async checkConnection(): Promise<{ connected: boolean; error?: string }> {
    const cfg = this.configService.getConfig();
    const gatewayUrl = cfg.openclawGatewayUrl?.trim();
    if (!gatewayUrl) {
      return { connected: false, error: 'Gateway URL 未配置' };
    }

    const token = cfg.openclawGatewayToken?.trim();
    const password = cfg.openclawGatewayPassword?.trim();
    const result = await fetchRuntimePathsFromGateway({
      gatewayHttpUrl: gatewayUrl,
      token: token || undefined,
      password: password || undefined,
      timeoutMs: 5000,
    });

    if (result.ok) {
      return { connected: true };
    }

    // Gateway 在未提供 token/password 时会返回 "device identity required"
    // 提示用户配置并保存鉴权信息
    const isDeviceIdentityRequired = result.error
      ?.toLowerCase()
      .includes('device identity required');
    const hasNoAuth = !token && !password;
    if (isDeviceIdentityRequired && hasNoAuth) {
      return {
        connected: false,
        error:
          'Gateway 需要鉴权：请在「设置」中配置 openclawGatewayToken（或 password）并点击「保存」',
      };
    }

    return { connected: false, error: result.error };
  }

  /**
   * 获取 Status 概览（version、status、usage），用于仪表盘展示
   */
  async getStatusOverview(): Promise<StatusOverviewResult | null> {
    const cfg = this.configService.getConfig();
    const gatewayUrl = cfg.openclawGatewayUrl?.trim();
    if (!gatewayUrl) {
      return null;
    }
    const result = await fetchStatusOverview({
      gatewayHttpUrl: gatewayUrl,
      token: cfg.openclawGatewayToken || undefined,
      password: cfg.openclawGatewayPassword || undefined,
      timeoutMs: 8000,
    });
    if (result.ok) {
      return result.payload;
    }
    this.logger.debug(`Status overview failed: ${result.error}`);
    return null;
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
   * 从 sessions.json 读取 session 的 totalTokens/model/contextTokens，以及 store 中的 key（用于类型推断）
   */
  private loadStoreEntryForSession(
    dir: string,
    agent: string,
    sessionId: string,
  ): { storeKey?: string; totalTokens?: number; inputTokens?: number; outputTokens?: number; contextTokens?: number; model?: string } | null {
    const storePath = path.join(dir, 'agents', agent, 'sessions', 'sessions.json');
    if (!fs.existsSync(storePath)) return null;
    try {
      const raw = fs.readFileSync(storePath, 'utf-8');
      const store = JSON.parse(raw) as Record<
        string,
        { sessionId?: string; totalTokens?: number; inputTokens?: number; outputTokens?: number; contextTokens?: number; model?: string }
      >;
      for (const [key, entry] of Object.entries(store)) {
        if (entry?.sessionId === sessionId) {
          return {
            storeKey: key,
            totalTokens: typeof entry.totalTokens === 'number' ? entry.totalTokens : undefined,
            inputTokens: typeof entry.inputTokens === 'number' ? entry.inputTokens : undefined,
            outputTokens: typeof entry.outputTokens === 'number' ? entry.outputTokens : undefined,
            contextTokens: typeof entry.contextTokens === 'number' ? entry.contextTokens : undefined,
            model: typeof entry.model === 'string' ? entry.model : undefined,
          };
        }
      }
    } catch {
      /* ignore */
    }
    return null;
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

          // 读取前几行以获取 user：首行可能只有 session header，user 可能在后续消息中
          const allLines = fs.readFileSync(filePath, 'utf-8').split('\n').filter((l) => l.trim());
          let userId: string = 'unknown';
          let sessionData: Record<string, unknown> | null = null;
          const firstLine = allLines[0];
          if (firstLine) {
            try {
              sessionData = JSON.parse(firstLine) as Record<string, unknown>;
              userId = (sessionData?.user as string)?.trim() || 'unknown';
            } catch {
              /* ignore */
            }
          }
          // 若首行无 user，从前几条消息中提取 sender
          if (userId === 'unknown' && allLines.length > 1) {
            for (let i = 1; i < Math.min(allLines.length, 15); i++) {
              try {
                const entry = JSON.parse(allLines[i]);
                const sender = extractSenderFromMessageEntry(entry);
                if (sender) {
                  userId = sender;
                  break;
                }
              } catch {
                /* ignore */
              }
            }
          }

          // 从 sessions.json 读取 totalTokens/model/contextTokens（比 transcript 更准确）
          // storeKey（如 agent:main:main）用于类型推断，比 agent/sessionId 更准确
          const storeEntry = this.loadStoreEntryForSession(dir, agent, sessionId);
          const sessionKey = storeEntry?.storeKey ?? `${agent}/${sessionId}`;
          const totalTokens = storeEntry?.totalTokens;
          const contextTokens = storeEntry?.contextTokens;
          const model = storeEntry?.model;
          const parsedFromTranscript = this.parseTokenUsage(sessionData?.tokenUsage);
          const limit = contextTokens ?? parsedFromTranscript?.limit;
          const input =
            storeEntry?.inputTokens ?? parsedFromTranscript?.input ?? 0;
          const output =
            storeEntry?.outputTokens ?? parsedFromTranscript?.output ?? 0;
          const tokenUsage =
            totalTokens != null && limit != null
              ? {
                  input,
                  output,
                  total: totalTokens,
                  limit,
                  utilization: Math.round((totalTokens / limit) * 100),
                }
              : parsedFromTranscript
                ? { ...parsedFromTranscript, input, output }
                : { input, output, total: totalTokens ?? 0, limit };

          try {
            sessions.push({
              sessionKey,
              sessionId: sessionId,
              userId,
              status: this.inferSessionStatus(sessionData, stats.mtimeMs),
              createdAt: stats.birthtimeMs,
              lastActiveAt: stats.mtimeMs,
              totalTokens,
              contextTokens,
              model,
              tokenUsage,
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

  private parseTokenUsage(val: unknown): OpenClawSession['tokenUsage'] | undefined {
    if (!val || typeof val !== 'object') return undefined;
    const o = val as Record<string, unknown>;
    if (typeof o.input !== 'number' || typeof o.output !== 'number' || typeof o.total !== 'number') return undefined;
    return {
      input: o.input,
      output: o.output,
      total: o.total,
      limit: typeof o.limit === 'number' ? o.limit : undefined,
      utilization: typeof o.utilization === 'number' ? o.utilization : undefined,
    };
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

          // 提取用户信息：优先 entry.user，否则从消息内容中提取 sender
          if (!firstUserData) {
            const sender = extractSenderFromMessageEntry(entry);
            if (sender) {
              firstUserData = { user: sender };
            } else if (entry.user) {
              firstUserData = entry;
            }
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

            const role = entry.message.role as 'user' | 'assistant' | 'system';
            const sender =
              role === 'user'
                ? (entry.message.senderLabel as string) || extractSenderFromMessageContent(contentText)
                : undefined;
            messages.push({
              role,
              content: contentText,
              timestamp: entry.timestamp || Date.now(),
              tokenCount: entry.message.tokenCount,
              ...(sender ? { sender } : {}),
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
      const agent = sessionFile.sessionId.split('/')[0];
      const dir = await this.stateDir();
      const storeEntry = dir ? this.loadStoreEntryForSession(dir, agent, sessionId) : null;
      const base = { ...tokenUsage };
      if (storeEntry) {
        if (storeEntry.totalTokens != null) base.total = storeEntry.totalTokens;
        if (storeEntry.inputTokens != null) base.input = storeEntry.inputTokens;
        if (storeEntry.outputTokens != null) base.output = storeEntry.outputTokens;
        if (storeEntry.contextTokens != null) base.limit = storeEntry.contextTokens;
        if (base.total != null && (base.limit ?? tokenUsage?.limit)) {
          base.utilization = Math.round((base.total / (base.limit ?? tokenUsage?.limit ?? 1)) * 100);
        }
      }
      const mergedTokenUsage = base;
      const sessionKey = storeEntry?.storeKey ?? sessionFile.sessionId;

      return {
        sessionKey,
        sessionId: sessionFile.sessionId,
        userId: firstUserData?.user || 'unknown',
        status: this.inferSessionStatus(firstUserData, stats.mtimeMs),
        createdAt: stats.birthtimeMs,
        lastActiveAt: stats.mtimeMs,
        totalTokens: storeEntry?.totalTokens,
        contextTokens: storeEntry?.contextTokens,
        model: storeEntry?.model,
        tokenUsage: mergedTokenUsage,
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
