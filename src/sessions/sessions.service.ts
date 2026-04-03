import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '../config/config.service';
import {
  OpenClawService,
  type OpenClawSession,
} from '../openclaw/openclaw.service';
import { LIST_SESSION_JSONL_MAX_SCAN_LINES } from '../openclaw/streaming-jsonl-reader';
import {
  inferSessionChatKind,
  inferSessionTypeLabel,
  resolveDisplayUser,
} from '../common/session-user-resolver';
import {
  estimateTokensFromTranscriptBytes,
  shouldOfferLogSizeTokenEstimate,
} from '../common/estimated-tokens-from-log';

export interface Session {
  sessionKey: string;
  sessionId: string;
  /** OpenClaw agents/<agentId>/sessions 下的目录名 */
  agentId?: string;
  user: string;
  /** 按 transcript / 消息出现顺序去重后的参与者（展示串,与消息抽取同源） */
  participants?: string[];
  participantSummary?: string;
  /** @deprecated 与 participants 同源，保留兼容 */
  participantIds?: string[];
  typeLabel?: string;
  status: 'active' | 'idle' | 'completed' | 'failed' | 'archived';
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
  /** 群聊 / 频道 / 单聊；无则字段省略 */
  chatKind?: 'group' | 'channel' | 'direct';
  /** 日志字节启发式 token（与 estimated-tokens-from-log 一致） */
  estimatedTokensFromLog?: number;
}

const LIST_SESSIONS_SORT_KEYS = new Set([
  'agentId',
  'lastActive',
  'duration',
  'totalTokens',
  'messageCount',
  'transcriptFileSizeBytes',
  'estimatedTokensFromLog',
  'utilization',
  'status',
  'user',
  'sessionKey',
  'typeLabel',
]);

export type ListSessionsPagedOptions = {
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  /** 列筛选：运行态，多选为 OR 与行内 status 匹配 */
  statuses?: string[];
  /** 与 typeLabel 展示字符串完全一致（如 主会话、cron） */
  typeLabels?: string[];
  /** group | channel | direct | _none（无形态/系统会话） */
  chatKinds?: string[];
  /** sessionKey / sessionId / user 等子串，大小写不敏感 */
  search?: string;
};

function utilizationPercentForSort(s: Session): number | null {
  const u = s.tokenUsage;
  if (!u?.limit) return null;
  if (u.contextUtilizationReliable === false) return null;
  if (typeof u.utilization === 'number') {
    return Math.min(100, Math.max(0, u.utilization));
  }
  if (typeof u.total === 'number' && u.limit > 0) {
    return Math.min(100, Math.max(0, Math.round((u.total / u.limit) * 100)));
  }
  return null;
}

function sortValueForSession(s: Session, key: string): string | number {
  switch (key) {
    case 'agentId':
      return String(s.agentId || 'unknown').toLowerCase();
    case 'lastActive':
      return s.lastActive ?? 0;
    case 'duration':
      return s.duration ?? 0;
    case 'totalTokens':
      return s.totalTokens ?? -1;
    case 'messageCount':
      return s.messageCount ?? -1;
    case 'transcriptFileSizeBytes':
      return s.transcriptFileSizeBytes ?? -1;
    case 'estimatedTokensFromLog':
      return s.estimatedTokensFromLog ?? -1;
    case 'utilization':
      return utilizationPercentForSort(s) ?? -1;
    case 'status':
      return String(s.status || '');
    case 'user':
      return String(s.user || '').toLowerCase();
    case 'sessionKey':
      return String(s.sessionKey || s.sessionId || '').toLowerCase();
    case 'typeLabel':
      return String(s.typeLabel || '');
    default:
      return s.lastActive ?? 0;
  }
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
      const chatKind = inferSessionChatKind(s.sessionKey, s.sessionId);
      const singleParticipant =
        s.participantIds?.length === 1 ? s.participantIds[0].trim() : '';
      const offerEst = shouldOfferLogSizeTokenEstimate({
        tokenUsage: s.tokenUsage,
        tokenUsageMeta: s.tokenUsageMeta,
        transcriptFileSizeBytes: s.transcriptFileSizeBytes,
      });
      const estimatedTokensFromLog = offerEst
        ? estimateTokensFromTranscriptBytes(s.transcriptFileSizeBytes)
        : undefined;
      return {
        sessionKey: s.sessionKey,
        sessionId: s.sessionId,
        ...(s.agentId ? { agentId: s.agentId } : {}),
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
        ...(chatKind ? { chatKind } : {}),
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
        ...(estimatedTokensFromLog != null
          ? { estimatedTokensFromLog }
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

  /**
   * 按 agent 聚合的会话概览（磁盘 sessions + 归档计数，PRD §3.2.1 / §3.2.3）
   */
  async getAgentSessionOverview(): Promise<
    Array<{
      agentId: string;
      sessionCount: number;
      activeCount: number;
      idleCount: number;
      archivedCount: number;
      lastActivityMs: number;
    }>
  > {
    const [all, archivedByAgent] = await Promise.all([
      this.listSessions(),
      this.openclawService.getArchivedUniqueSessionCountByAgent().catch(() => ({})),
    ]);
    const map = new Map<
      string,
      {
        sessionCount: number;
        activeCount: number;
        idleCount: number;
        last: number;
      }
    >();
    for (const s of all) {
      const aid = (s.agentId || 'unknown').trim() || 'unknown';
      const cur = map.get(aid) ?? {
        sessionCount: 0,
        activeCount: 0,
        idleCount: 0,
        last: 0,
      };
      cur.sessionCount += 1;
      if (s.status === 'active') cur.activeCount += 1;
      if (s.status === 'idle') cur.idleCount += 1;
      cur.last = Math.max(cur.last, s.lastActive);
      map.set(aid, cur);
    }
    const agentIds = new Set([
      ...map.keys(),
      ...Object.keys(archivedByAgent),
    ]);
    const rows: Array<{
      agentId: string;
      sessionCount: number;
      activeCount: number;
      idleCount: number;
      archivedCount: number;
      lastActivityMs: number;
    }> = [];
    for (const agentId of agentIds) {
      const m = map.get(agentId);
      const archivedCount = archivedByAgent[agentId] ?? 0;
      rows.push({
        agentId,
        sessionCount: m?.sessionCount ?? 0,
        activeCount: m?.activeCount ?? 0,
        idleCount: m?.idleCount ?? 0,
        archivedCount,
        lastActivityMs: m?.last ?? 0,
      });
    }
    rows.sort((a, b) => b.lastActivityMs - a.lastActivityMs);
    return rows;
  }

  async listSessionsPaged(
    page: number,
    pageSize: number,
    filter: string = 'all',
    agentIdFilter?: string,
    listOptions?: ListSessionsPagedOptions,
  ): Promise<{
    items: Session[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const all = await this.listSessions();
    let filtered: Session[] = all;
    if (filter === 'archived') {
      const archivedSessions = await this.openclawService.listArchivedSessions();
      filtered = archivedSessions.map((row) => {
        const s = row as unknown as Session;
        const ck = inferSessionChatKind(s.sessionKey, s.sessionId);
        return {
          ...s,
          ...(ck ? { chatKind: ck } : {}),
        };
      });
    } else if (filter === 'stale_index') {
      // 过期索引：tokenUsageMeta.totalTokensFresh === false 的会话
      filtered = all.filter((s) => s.tokenUsageMeta?.totalTokensFresh === false);
    } else if (filter !== 'all') {
      filtered = all.filter((s) => s.status === filter);
    }
    const aidTrim = agentIdFilter?.trim();
    if (aidTrim) {
      filtered = filtered.filter((s) => (s.agentId || 'unknown') === aidTrim);
    }

    if (listOptions?.statuses?.length) {
      const set = new Set(listOptions.statuses.map((x) => String(x)));
      filtered = filtered.filter((s) => set.has(String(s.status)));
    }
    if (listOptions?.typeLabels?.length) {
      const set = new Set(listOptions.typeLabels.map((x) => String(x)));
      filtered = filtered.filter((s) => set.has(String(s.typeLabel ?? '')));
    }
    if (listOptions?.chatKinds?.length) {
      const set = new Set(listOptions.chatKinds.map((x) => String(x)));
      filtered = filtered.filter((s) => {
        const ck = s.chatKind;
        if (ck == null) return set.has('_none');
        return set.has(ck);
      });
    }
    if (listOptions?.search?.trim()) {
      const q = listOptions.search.trim().toLowerCase();
      filtered = filtered.filter((s) => {
        const hay = [
          s.sessionKey,
          s.sessionId,
          s.user,
          s.typeLabel,
          s.participantSummary,
          ...(s.participants ?? []),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return hay.includes(q);
      });
    }

    const sortBy =
      listOptions?.sortBy && LIST_SESSIONS_SORT_KEYS.has(listOptions.sortBy)
        ? listOptions.sortBy
        : 'lastActive';
    const sortOrder = listOptions?.sortOrder === 'asc' ? 'asc' : 'desc';
    const mul = sortOrder === 'asc' ? 1 : -1;
    const sorted = [...filtered].sort((a, b) => {
      const va = sortValueForSession(a, sortBy);
      const vb = sortValueForSession(b, sortBy);
      if (typeof va === 'number' && typeof vb === 'number') {
        return (va - vb) * mul;
      }
      return String(va).localeCompare(String(vb)) * mul;
    });

    const start = (Math.max(page, 1) - 1) * pageSize;
    return {
      items: sorted.slice(start, start + pageSize),
      total: sorted.length,
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
      ...(detail.agentId ? { agentId: detail.agentId } : {}),
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
    const st = session?.status ?? 'completed';
    if (st === 'archived') return 'completed';
    return st;
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
