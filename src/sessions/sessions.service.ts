import { Injectable, Logger } from '@nestjs/common';
import { OpenClawService } from '../openclaw/openclaw.service';

export interface Session {
  sessionKey: string;
  sessionId: string;
  user: string;
  status: 'active' | 'idle' | 'completed' | 'failed';
  lastActive: number;
  duration: number;
  tokenUsage?: {
    input: number;
    output: number;
    total: number;
    limit?: number;
    utilization?: number; // 0-100%
  };
}

export interface SessionDetail extends Session {
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
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
        status: s.status,
        lastActive: s.lastActiveAt,
        duration: Date.now() - s.createdAt,
        tokenUsage: s.tokenUsage && 'limit' in s.tokenUsage && s.tokenUsage.limit
          ? {
              ...s.tokenUsage,
              utilization: Math.round((s.tokenUsage.total / s.tokenUsage.limit) * 100),
            }
          : s.tokenUsage as any,
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
        status: detail.status,
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
