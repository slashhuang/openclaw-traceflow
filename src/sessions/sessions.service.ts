import { Injectable, Logger } from '@nestjs/common';
import { OpenClawService, type OpenClawSession } from '../openclaw/openclaw.service';
import { inferSessionTypeLabel, resolveDisplayUser } from '../common/session-user-resolver';
import { MetricsService } from '../metrics/metrics.service';

function mapTokenUsageForApi(u: OpenClawSession['tokenUsage'] | undefined): Session['tokenUsage'] | undefined {
  if (!u) return undefined;
  const limit = u.limit;
  if (u.contextUtilizationReliable === false) {
    return { ...u, utilization: undefined };
  }
  if (typeof limit === 'number' && limit > 0 && typeof u.total === 'number') {
    return { ...u, utilization: Math.round((u.total / limit) * 100) };
  }
  return u as Session['tokenUsage'];
}

export interface Session {
  sessionKey: string;
  sessionId: string;
  user: string;
  /** 多人会话时 transcript 去重后的参与者摘要（列表列优先展示） */
  participantSummary?: string;
  /** 详情页：与 participantSummary 同源的去重 id 列表（由会话缓存合并） */
  participantIds?: string[];
  /** 任务类型：主会话 | cron | wave用户 | 各 channel 等（与 session-user-resolver 一致） */
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
    /** false：勿将 utilization 当作可信的上下文占用率 */
    contextUtilizationReliable?: boolean;
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
    /** 调用时间（毫秒时间戳，来自 transcript 行） */
    timestamp?: number;
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
  /** 正在查看的归档 transcript（*.jsonl.reset.* 时间戳段） */
  archiveResetTimestamp?: string;
  archiveEpochs?: Array<{
    resetTimestamp: string;
    totalTokens: number;
    inputTokens: number;
    outputTokens: number;
  }>;
}

@Injectable()
export class SessionsService {
  private readonly logger = new Logger(SessionsService.name);

  constructor(
    private openclawService: OpenClawService,
    private metricsService: MetricsService,
  ) {}

  async listSessions(): Promise<Session[]> {
    try {
      const sessions = await this.openclawService.listSessions();

      return sessions.map((s) => {
        const typeLabel = inferSessionTypeLabel(s.sessionKey, s.sessionId);
        return {
          sessionKey: s.sessionKey,
          sessionId: s.sessionId,
          user: s.participantSummary || resolveDisplayUser(s.userId, typeLabel, s.systemSent),
          ...(s.participantSummary ? { participantSummary: s.participantSummary } : {}),
          typeLabel,
        status: s.status,
        lastActive: s.lastActiveAt,
        duration: Date.now() - s.createdAt,
        totalTokens: s.totalTokens,
        contextTokens: s.contextTokens,
        model: s.model,
          usageCost: s.usageCost,
        tokenUsage: mapTokenUsageForApi(s.tokenUsage),
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
    let filtered: Session[];
    if (filter === 'all') {
      filtered = all;
    } else if (filter === 'archived') {
      const archiveMap = await this.metricsService.getArchivedCountBySessionKey();
      filtered = all.filter((s) => (archiveMap[s.sessionKey] ?? 0) > 0);
    } else {
      filtered = all.filter((s) => s.status === filter);
    }
    const start = (Math.max(page, 1) - 1) * pageSize;
    return {
      items: filtered.slice(start, start + pageSize),
      total: filtered.length,
      page: Math.max(page, 1),
      pageSize,
    };
  }

  async getSessionById(id: string, resetTimestamp?: string): Promise<SessionDetail | null> {
    try {
      const detail = await this.openclawService.getSessionDetail(
        id,
        resetTimestamp?.trim() ? { resetTimestamp: resetTimestamp.trim() } : undefined,
      );

      if (!detail) {
        return null;
      }

      const fromCache = await this.openclawService.getTranscriptFileSizeFromSessionCache(id);
      let transcriptBytes: number | undefined =
        detail.transcriptFileSizeBytes ??
        detail.tokenUsageMeta?.sessionLogFileSizeBytes ??
        fromCache;
      if (transcriptBytes === undefined && !detail.archiveResetTimestamp) {
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

      let participantIds: string[] | undefined;
      let participantSummaryFromCache: string | undefined;
      try {
        const cached = await this.openclawService.getSession(detail.sessionKey);
        if (cached?.participantIds?.length) {
          participantIds = cached.participantIds;
        }
        if (cached?.participantSummary) {
          participantSummaryFromCache = cached.participantSummary;
        }
      } catch {
        /* ignore */
      }

      return {
        sessionKey: detail.sessionKey,
        sessionId: detail.sessionId,
        user:
          participantSummaryFromCache ||
          resolveDisplayUser(detail.userId, typeLabel, detail.systemSent),
        typeLabel,
        ...(participantSummaryFromCache ? { participantSummary: participantSummaryFromCache } : {}),
        ...(participantIds?.length ? { participantIds } : {}),
        status: detail.status,
        model: detail.model,
        contextTokens: detail.contextTokens,
        lastActive: detail.lastActiveAt,
        duration: Date.now() - detail.createdAt,
        tokenUsage: mapTokenUsageForApi(detail.tokenUsage),
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
          ...(typeof t.timestamp === 'number' ? { timestamp: t.timestamp } : {}),
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
        ...(detail.archiveEpochs?.length ? { archiveEpochs: detail.archiveEpochs } : {}),
        ...(detail.archiveResetTimestamp ? { archiveResetTimestamp: detail.archiveResetTimestamp } : {}),
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

  /** 某会话的归档轮次列表（供列表 Popover 与详情切换） */
  async listArchiveEpochs(id: string): Promise<
    Array<{ resetTimestamp: string; totalTokens: number; inputTokens: number; outputTokens: number }>
  > {
    return this.openclawService.listSessionArchiveEpochs(id);
  }
}
