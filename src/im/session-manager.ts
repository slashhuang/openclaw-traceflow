import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

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
  parentId?: string; // 飞书父消息 ID
}

/**
 * 会话管理器
 * 管理会话生命周期，检测会话开始/结束
 */
@Injectable()
export class SessionManager implements OnModuleDestroy {
  private readonly logger = new Logger(SessionManager.name);

  // 活跃会话映射：sessionId → SessionEvent
  private activeSessions = new Map<string, SessionEvent>();

  // 会话结束超时（5 分钟无活动）
  private readonly SESSION_END_TIMEOUT_MS = 5 * 60 * 1000;

  // 定时器检查会话结束
  private cleanupInterval?: NodeJS.Timeout;

  constructor(
    private eventEmitter: EventEmitter2,
  ) {
    this.startCleanupTimer();
  }

  /**
   * 会话开始
   */
  async onSessionStart(sessionData: Partial<SessionEvent>): Promise<void> {
    const sessionId = sessionData.sessionId!;

    const session: SessionEvent = {
      sessionId,
      sessionKey: sessionData.sessionKey!,
      user: sessionData.user!,
      account: sessionData.account!,
      startTime: Date.now(),
      messageCount: 0,
      status: 'active',
      lastActivity: Date.now(),
      ...sessionData,
    };

    this.activeSessions.set(sessionId, session);
    this.logger.debug(`Session started: ${sessionId}`);

    // 触发推送事件
    this.eventEmitter.emit('audit.session.start', session);
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
    let session = this.activeSessions.get(sessionId);

    if (!session) {
      // 会话不存在，尝试恢复
      this.logger.warn(
        `Session not found: ${sessionId}, attempting to recover`,
      );
      await this.recoverSession(sessionId);
      session = this.activeSessions.get(sessionId);

      if (!session) {
        this.logger.error(`Failed to recover session: ${sessionId}`);
        return;
      }
    }

    session.messageCount++;
    session.lastActivity = Date.now();

    // 更新 Token 信息（如果是 AI 回复）
    if (message.type === 'assistant') {
      session.tokenInput = message.content.tokens?.input;
      session.tokenOutput = message.content.tokens?.output;
    }

    // 触发推送事件
    this.eventEmitter.emit('audit.session.message', {
      sessionId,
      message,
      session,
    });
  }

  /**
   * 获取会话
   */
  getSession(sessionId: string): SessionEvent | undefined {
    return this.activeSessions.get(sessionId);
  }

  /**
   * 获取所有活跃会话
   */
  getActiveSessions(): SessionEvent[] {
    return Array.from(this.activeSessions.values());
  }

  /**
   * 检测会话结束（超时机制）
   */
  private startCleanupTimer(): void {
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();

      for (const [sessionId, session] of this.activeSessions.entries()) {
        if (session.status === 'completed') continue;

        const inactiveTime = now - (session.lastActivity || session.startTime);
        if (inactiveTime > this.SESSION_END_TIMEOUT_MS) {
          this.completeSession(sessionId);
        }
      }
    }, 60000); // 每分钟检查一次

    this.logger.debug('Session cleanup timer started');
  }

  /**
   * 完成会话
   */
  private async completeSession(sessionId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session || session.status === 'completed') return;

    session.status = 'completed';
    session.endTime = Date.now();

    this.logger.log(`Session completed: ${sessionId}`);

    // 触发推送事件
    this.eventEmitter.emit('audit.session.end', session);

    // 从活跃会话移除
    this.activeSessions.delete(sessionId);
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
    // agent:main:feishu:direct:ou_xxx -> feishu
    const parts = sessionKey.split(':');
    return parts[2] || 'unknown';
  }

  onModuleDestroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.logger.log('SessionManager destroyed');
  }
}
