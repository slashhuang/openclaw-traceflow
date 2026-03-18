import { Injectable, Logger } from '@nestjs/common';
import { OpenClawService } from '../openclaw/openclaw.service';

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
}

/** 从 sessionKey 推断任务类型（heartbeat、cron、wave 等） */
function inferSessionTypeLabel(sessionKey: string, sessionId: string): string {
  const key = sessionKey || sessionId || '';
  const full = key.includes('/') ? key.split('/').pop() || key : key;
  if (full.endsWith(':main') || full === 'main') return 'heartbeat';
  if (full.includes(':cron:')) return 'cron';
  if (full.includes(':wave:')) return 'Wave 用户';
  if (full.includes(':slack:')) return 'Slack';
  if (full.includes(':telegram:')) return 'Telegram';
  if (full.includes(':discord:')) return 'Discord';
  if (full.includes(':feishu:')) return '飞书';
  if (full.includes(':cron')) return 'cron';
  return '用户';
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
  events: Array<{
    type: string;
    timestamp: number;
    payload: any;
  }>;
}

@Injectable()
export class SessionsService {
  private readonly logger = new Logger(SessionsService.name);

  constructor(private openclawService: OpenClawService) {}

  async listSessions(): Promise<Session[]> {
    try {
      const sessions = await this.openclawService.listSessions();

      return sessions.map((s) => ({
        sessionKey: s.sessionKey,
        sessionId: s.sessionId,
        user: s.userId || 'unknown',
        typeLabel: inferSessionTypeLabel(s.sessionKey, s.sessionId),
        status: s.status,
        lastActive: s.lastActiveAt,
        duration: Date.now() - s.createdAt,
        totalTokens: s.totalTokens,
        contextTokens: s.contextTokens,
        model: s.model,
        tokenUsage: s.tokenUsage && 'limit' in s.tokenUsage && s.tokenUsage.limit
          ? {
              ...s.tokenUsage,
              utilization: Math.round((s.tokenUsage.total / s.tokenUsage.limit) * 100),
            }
          : (s.tokenUsage as Session['tokenUsage']),
      }));
    } catch (error) {
      this.logger.error('Failed to list sessions:', error);
      return [];
    }
  }

  async getSessionById(id: string): Promise<SessionDetail | null> {
    try {
      const detail = await this.openclawService.getSessionDetail(id);

      if (!detail) {
        return null;
      }

      return {
        sessionKey: detail.sessionKey,
        sessionId: detail.sessionId,
        user: detail.userId || 'unknown',
        typeLabel: inferSessionTypeLabel(detail.sessionKey, detail.sessionId),
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
        events: detail.events || [],
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
}
