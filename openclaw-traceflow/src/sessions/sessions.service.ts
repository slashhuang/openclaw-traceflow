import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '../config/config.service';
import { OpenClawService, type OpenClawSession } from '../openclaw/openclaw.service';
import { inferSessionTypeLabel, resolveDisplayUser } from '../common/session-user-resolver';

export interface Session {
  sessionKey: string;
  sessionId: string;
  user: string;
  participantSummary?: string;
  participantIds?: string[];
  typeLabel?: string;
  status: 'active' | 'idle' | 'completed' | 'failed';
  lastActive: number;
  duration: number;
  model?: string;
  messageCount?: number;
  transcriptFileSizeBytes?: number;
}

export interface SessionDetail extends Session {
  tokenUsage?: OpenClawSession['tokenUsage'];
  tokenUsageMeta?: OpenClawSession['tokenUsageMeta'];
  messages: Array<{ role: 'user' | 'assistant'; content: string; timestamp: number; sender?: string }>;
  toolCalls: Array<{ name: string; input?: any; output?: any; duration: number; success: boolean; error?: string; timestamp?: number }>;
  invokedSkills?: Array<{ skillName: string; readCount: number }>;
  events: Array<{ type: string; timestamp: number; payload: any }>;
  transcriptFileSizeBytes?: number;
  transcriptParseMode?: 'full' | 'head_tail';
  transcriptJsonlLineCount?: number;
  transcriptHeadJsonlLineCount?: number;
  transcriptTailJsonlLineCount?: number;
  archiveResetTimestamp?: string;
  archiveEpochs?: Array<{ resetTimestamp: string; totalTokens: number; inputTokens: number; outputTokens: number }>;
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
    return sessions.map((s) => ({
      sessionKey: s.sessionKey,
      sessionId: s.sessionId,
      user: s.participantSummary || resolveDisplayUser(s.userId, inferSessionTypeLabel(s.sessionKey, s.sessionId), s.systemSent),
      ...(s.participantSummary ? { participantSummary: s.participantSummary } : {}),
      typeLabel: inferSessionTypeLabel(s.sessionKey, s.sessionId),
      status: s.status,
      lastActive: s.lastActiveAt,
      duration: Date.now() - s.createdAt,
      model: s.model,
    }));
  }

  async listSessionsPaged(page: number, pageSize: number, filter: string = 'all'): Promise<{ items: Session[]; total: number; page: number; pageSize: number }> {
    const all = await this.listSessions();
    let filtered = all;
    if (filter === 'archived' || filter === 'stale_index') {
      filtered = [];
    } else if (filter !== 'all') {
      filtered = all.filter((s) => s.status === filter);
    }
    const start = (Math.max(page, 1) - 1) * pageSize;
    return { items: filtered.slice(start, start + pageSize), total: filtered.length, page: Math.max(page, 1), pageSize };
  }

  async getSessionById(id: string, resetTimestamp?: string): Promise<SessionDetail | null> {
    const detail = await this.openclawService.getSessionDetail(id, resetTimestamp?.trim() ? { resetTimestamp: resetTimestamp.trim() } : undefined);
    if (!detail) return null;

    const typeLabel = inferSessionTypeLabel(detail.sessionKey, detail.sessionId);
    return {
      sessionKey: detail.sessionKey,
      sessionId: detail.sessionId,
      user: resolveDisplayUser(detail.userId, typeLabel, detail.systemSent),
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

  async getSessionStatus(id: string): Promise<'active' | 'idle' | 'completed' | 'failed'> {
    const session = await this.getSessionById(id);
    return session?.status || 'completed';
  }

  async killSession(id: string): Promise<boolean> {
    return this.openclawService.killSession(id);
  }

  async getConfiguredModels(): Promise<{ models: string[]; source?: string } | null> {
    return this.openclawService.getConfiguredModels();
  }

  async listArchiveEpochs(id: string): Promise<Array<{ resetTimestamp: string; totalTokens: number; inputTokens: number; outputTokens: number }>> {
    const detail = await this.openclawService.getSessionDetail(id);
    return detail?.archiveEpochs || [];
  }
}
