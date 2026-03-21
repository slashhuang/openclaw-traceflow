import { Injectable, Logger } from '@nestjs/common';
import { OpenClawService, type OpenClawSession } from '../openclaw/openclaw.service';
import { inferSessionTypeLabel, resolveDisplayUser } from '../common/session-user-resolver';

export interface Session {
  sessionKey: string;
  sessionId: string;
  user: string;
  /** 任务类型：heartbeat | cron | wave用户 | 其他 channel */
  typeLabel?: string;
  status: 'active' | 'idle' | 'completed' | 'failed';
  lastActive: number;
  duration: number;
  totalTokens?: number;
  contextTokens?: number;
  model?: string;
  tokenUsage?: {
    input: number;
    output: number;
    total: number;
    limit?: number;
    utilization?: number; // 0-100%
  };
  usageCost?: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    total: number;
  };

  tokenUsageMeta?: OpenClawSession['tokenUsageMeta'];
  messageCount?: number;
  transcriptFileSizeBytes?: number;
}

export interface InvokedSkill {
  skillName: string;
  readCount: number;
}

export interface SessionDetail extends Session {
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
    sender?: string;
  }>;
  toolCalls: Array<{
    name: string;
    input?: any;
    output?: any;
    duration: number;
    success: boolean;
    error?: string;
  }>;
  /** 基于 read path 反推的 skill 调用 */
  invokedSkills?: InvokedSkill[];
  events: Array<{
    type: string;
    timestamp: number;
    payload: any;
  }>;
  /** 会话 .jsonl 文件大小（字节）；可与 tokenUsageMeta.sessionLogFileSizeBytes 互为补充 */
  transcriptFileSizeBytes?: number;
  /** full：全量解析；head_tail：仅首尾字节窗口内的 JSONL 行 */
  transcriptParseMode?: 'full' | 'head_tail';
  transcriptJsonlLineCount?: number;
  transcriptHeadJsonlLineCount?: number;
  transcriptTailJsonlLineCount?: number;
}

@Injectable()
export class SessionsService {
  private readonly logger = new Logger(SessionsService.name);

  constructor(private openclawService: OpenClawService) {}

  async listSessions(): Promise<Session[]> {
    try {
      const sessions = await this.openclawService.listSessions();

      return sessions.map((s) => {
        const typeLabel = inferSessionTypeLabel(s.sessionKey, s.sessionId);
        return {
          sessionKey: s.sessionKey,
          sessionId: s.sessionId,
          user: resolveDisplayUser(s.userId, typeLabel, s.systemSent),
          typeLabel,
        status: s.status,
        lastActive: s.lastActiveAt,
        duration: Date.now() - s.createdAt,
        totalTokens: s.totalTokens,
        contextTokens: s.contextTokens,
        model: s.model,
          usageCost: s.usageCost,
        tokenUsage: s.tokenUsage && 'limit' in s.tokenUsage && s.tokenUsage.limit
          ? {
              ...s.tokenUsage,
              utilization: Math.round((s.tokenUsage.total / s.tokenUsage.limit) * 100),
            }
          : (s.tokenUsage as Session['tokenUsage']),
        messageCount: s.messageCount,
        transcriptFileSizeBytes: s.transcriptFileSizeBytes,
        };
      });
    } catch (error) {
      this.logger.error('Failed to list sessions:', error);
      return [];
    }
  }

  async listSessionsPaged(
    page: number,
    pageSize: number,
    filter: string = 'all',
  ): Promise<{ items: Session[]; total: number; page: number; pageSize: number }> {
    const all = await this.listSessions();
    const filtered = filter === 'all' ? all : all.filter((s) => s.status === filter);
    const start = (Math.max(page, 1) - 1) * pageSize;
    return {
      items: filtered.slice(start, start + pageSize),
      total: filtered.length,
      page: Math.max(page, 1),
      pageSize,
    };
  }

  async getSessionById(id: string): Promise<SessionDetail | null> {
    try {
      const detail = await this.openclawService.getSessionDetail(id);

      if (!detail) {
        return null;
      }

      const fromCache = await this.openclawService.getTranscriptFileSizeFromSessionCache(id);
      let transcriptBytes: number | undefined =
        detail.transcriptFileSizeBytes ??
        detail.tokenUsageMeta?.sessionLogFileSizeBytes ??
        fromCache;
      if (transcriptBytes === undefined) {
        transcriptBytes = await this.openclawService.getTranscriptFileStatBytes(id);
      }
      const tokenUsageMetaMerged =
        detail.tokenUsageMeta && typeof transcriptBytes === 'number'
          ? {
              ...detail.tokenUsageMeta,
              sessionLogFileSizeBytes:
                detail.tokenUsageMeta.sessionLogFileSizeBytes ?? transcriptBytes,
            }
          : detail.tokenUsageMeta;

      const typeLabel = inferSessionTypeLabel(detail.sessionKey, detail.sessionId);
      return {
        sessionKey: detail.sessionKey,
        sessionId: detail.sessionId,
        user: resolveDisplayUser(detail.userId, typeLabel, detail.systemSent),
        typeLabel,
        status: detail.status,
        model: detail.model,
        contextTokens: detail.contextTokens,
        lastActive: detail.lastActiveAt,
        duration: Date.now() - detail.createdAt,
        tokenUsage: detail.tokenUsage && 'limit' in detail.tokenUsage && detail.tokenUsage.limit
          ? {
              ...detail.tokenUsage,
              utilization: Math.round((detail.tokenUsage.total / detail.tokenUsage.limit) * 100),
            }
          : detail.tokenUsage as any,
        usageCost: detail.usageCost,
        tokenUsageMeta: tokenUsageMetaMerged,
        messages: (detail.messages || []).map((m: any) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
          timestamp: m.timestamp,
          ...(m.sender ? { sender: m.sender } : {}),
        })),
        toolCalls: (detail.toolCalls || []).map((t: any) => ({
          name: t.name,
          input: t.input,
          output: t.output,
          duration: t.durationMs,
          success: t.success,
          error: t.error,
        })),
        invokedSkills: detail.invokedSkills || [],
        events: detail.events || [],
        transcriptFileSizeBytes: transcriptBytes,
        transcriptParseMode: detail.transcriptParseMode,
        ...(detail.transcriptJsonlLineCount != null
          ? { transcriptJsonlLineCount: detail.transcriptJsonlLineCount }
          : {}),
        ...(detail.transcriptHeadJsonlLineCount != null
          ? { transcriptHeadJsonlLineCount: detail.transcriptHeadJsonlLineCount }
          : {}),
        ...(detail.transcriptTailJsonlLineCount != null
          ? { transcriptTailJsonlLineCount: detail.transcriptTailJsonlLineCount }
          : {}),
      };
    } catch (error) {
      this.logger.error('Failed to get session detail:', error);
      return null;
    }
  }

  async getSessionStatus(id: string): Promise<'active' | 'idle' | 'completed' | 'failed'> {
    const session = await this.getSessionById(id);
    return session?.status || 'completed';
  }

  async killSession(id: string): Promise<boolean> {
    return this.openclawService.killSession(id);
  }

  /**
   * 获取 OpenClaw 配置文件中配置的模型列表
   */
  async getConfiguredModels(): Promise<{ models: string[]; source?: string } | null> {
    return this.openclawService.getConfiguredModels();
  }
}
