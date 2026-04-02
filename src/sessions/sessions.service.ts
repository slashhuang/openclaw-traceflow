import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '../config/config.service';
import {
  OpenClawService,
  type OpenClawSession,
} from '../openclaw/openclaw.service';
import { LIST_SESSION_JSONL_MAX_SCAN_LINES } from '../openclaw/streaming-jsonl-reader';
import {
  inferSessionTypeLabel,
  resolveDisplayUser,
} from '../common/session-user-resolver';

export interface Session {
  sessionKey: string;
  sessionId: string;
  user: string;
  /** 按 transcript / 消息出现顺序去重后的参与者（展示串,与消息抽取同源） */
  participants?: string[];
  participantSummary?: string;
  /** @deprecated 与 participants 同源，保留兼容 */
  participantIds?: string[];
  typeLabel?: string;
  status: 'active' | 'idle' | 'completed' | 'failed';
  lastActive: number;
  duration: number;
  model?: string;
  totalTokens?: number;
  tokenUsage?: OpenClawSession['tokenUsage'];
  tokenUsageMeta?: OpenClawSession['tokenUsageMeta'];
  usageCost?: OpenClawSession['usageCost'];
  messageCount?: number;
  messageCountCapped?: boolean;
  messageCountScanMaxLines?: number;
  transcriptFileSizeBytes?: number;
}

export interface SessionDetail extends Session {
  tokenUsage?: OpenClawSession['tokenUsage'];
  tokenUsageMeta?: OpenClawSession['tokenUsageMeta'];
  messages: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: number;
    sender?: string;
  }>;
  toolCalls: Array<{
    name: string;
    input?: any;
    output?: any;
    durationMs: number;
    success: boolean;
    error?: string;
    timestamp?: number;
  }>;
  invokedSkills?: Array<{ skillName: string; readCount: number }>;
  events: Array<{ type: string; timestamp: number; payload: any }>;
  transcriptFileSizeBytes?: number;
  transcriptParseMode?: 'full' | 'head_tail';
  transcriptJsonlLineCount?: number;
  transcriptHeadJsonlLineCount?: number;
  transcriptTailJsonlLineCount?: number;
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
    private configService: ConfigService,
  ) {}

  async listSessions(): Promise<Session[]> {
    const sessions = await this.openclawService.listSessions();
    return sessions.map((s) => {
      const typeLabel = inferSessionTypeLabel(s.sessionKey, s.sessionId);
      const singleParticipant =
        s.participantIds?.length === 1 ? s.participantIds[0].trim() : '';
      return {
        sessionKey: s.sessionKey,
        sessionId: s.sessionId,
        user:
          s.participantSummary ||
          singleParticipant ||
          resolveDisplayUser(s.userId, typeLabel, s.systemSent),
        ...(s.participantIds?.length
          ? {
              participants: [...s.participantIds],
              participantIds: [...s.participantIds],
            }
          : {}),
        ...(s.participantSummary
          ? { participantSummary: s.participantSummary }
          : {}),
        typeLabel,
        status: s.status,
        lastActive: s.lastActiveAt,
        duration: Date.now() - s.createdAt,
        model: s.model,
        ...(s.totalTokens != null ? { totalTokens: s.totalTokens } : {}),
        ...(s.tokenUsage ? { tokenUsage: s.tokenUsage } : {}),
        ...(s.tokenUsageMeta ? { tokenUsageMeta: s.tokenUsageMeta } : {}),
        ...(s.usageCost ? { usageCost: s.usageCost } : {}),
        ...(s.messageCount != null ? { messageCount: s.messageCount } : {}),
        ...(s.transcriptFileSizeBytes != null
          ? { transcriptFileSizeBytes: s.transcriptFileSizeBytes }
          : {}),
        ...(s.messageCountCapped
          ? {
              messageCountCapped: true,
              messageCountScanMaxLines:
                s.messageCountScanMaxLines ?? LIST_SESSION_JSONL_MAX_SCAN_LINES,
            }
          : {}),
      };
    });
  }

  async listSessionsPaged(
    page: number,
    pageSize: number,
    filter: string = 'all',
  ): Promise<{
    items: Session[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const all = await this.listSessions();
    let filtered: Session[] = all;
    if (filter === 'archived') {
      // 归档会话：查找带有 .reset. 标记的会话文件
      const archivedSessions = await this.openclawService.listArchivedSessions();
      filtered = archivedSessions as Session[];
    } else if (filter === 'stale_index') {
      // 过期索引：tokenUsageMeta.totalTokensFresh === false 的会话
      filtered = all.filter((s) => s.tokenUsageMeta?.totalTokensFresh === false);
    } else if (filter !== 'all') {
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

  /**
   * 获取所有会话（不分页），供 audit.controller 使用
   */
  async getAllSessions(filter: string = 'all'): Promise<{
    items: Session[];
    total: number;
  }> {
    const result = await this.listSessionsPaged(1, 1000, filter);
    return {
      items: result.items,
      total: result.total,
    };
  }

  async getSessionById(
    id: string,
    resetTimestamp?: string,
  ): Promise<SessionDetail | null> {
    const detail = await this.openclawService.getSessionDetail(
      id,
      resetTimestamp?.trim()
        ? { resetTimestamp: resetTimestamp.trim() }
        : undefined,
    );
    if (!detail) return null;

    const typeLabel = inferSessionTypeLabel(
      detail.sessionKey,
      detail.sessionId,
    );
    const singleParticipant =
      detail.participantIds?.length === 1
        ? detail.participantIds[0].trim()
        : '';
    return {
      sessionKey: detail.sessionKey,
      sessionId: detail.sessionId,
      user:
        detail.participantSummary ||
        singleParticipant ||
        resolveDisplayUser(detail.userId, typeLabel, detail.systemSent),
      ...(detail.participantIds?.length
        ? {
            participants: [...detail.participantIds],
            participantIds: [...detail.participantIds],
          }
        : {}),
      ...(detail.participantSummary
        ? { participantSummary: detail.participantSummary }
        : {}),
      typeLabel,
      status: detail.status,
      lastActive: detail.lastActiveAt,
      duration: Date.now() - detail.createdAt,
      model: detail.model,
      tokenUsage: detail.tokenUsage,
      tokenUsageMeta: detail.tokenUsageMeta,
      messages: detail.messages || [],
      toolCalls: detail.toolCalls || [],
      invokedSkills: detail.invokedSkills || [],
      events: detail.events || [],
      transcriptFileSizeBytes: detail.transcriptFileSizeBytes,
      transcriptParseMode: detail.transcriptParseMode,
      transcriptJsonlLineCount: detail.transcriptJsonlLineCount,
      transcriptHeadJsonlLineCount: detail.transcriptHeadJsonlLineCount,
      transcriptTailJsonlLineCount: detail.transcriptTailJsonlLineCount,
      archiveResetTimestamp: detail.archiveResetTimestamp,
      archiveEpochs: detail.archiveEpochs,
    };
  }

  async getSessionStatus(
    id: string,
  ): Promise<'active' | 'idle' | 'completed' | 'failed'> {
    const session = await this.getSessionById(id);
    return session?.status || 'completed';
  }

  async killSession(id: string): Promise<boolean> {
    return this.openclawService.killSession(id);
  }

  async getConfiguredModels(): Promise<{
    models: string[];
    source?: string;
  } | null> {
    return this.openclawService.getConfiguredModels();
  }

  async listArchiveEpochs(id: string): Promise<
    Array<{
      resetTimestamp: string;
      totalTokens: number;
      inputTokens: number;
      outputTokens: number;
    }>
  > {
    const detail = await this.openclawService.getSessionDetail(id);
    return detail?.archiveEpochs || [];
  }
}
