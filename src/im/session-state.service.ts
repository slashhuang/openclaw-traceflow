import { Injectable, Logger } from '@nestjs/common';

/**
 * 会话状态数据
 */
export interface SessionState {
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
  parentId?: string; // 飞书父消息 ID
  lastActivity: number;
}

/**
 * 会话状态存储服务
 * 提供持久化的会话状态管理，解耦事件时序问题
 */
@Injectable()
export class SessionStateService {
  private readonly logger = new Logger(SessionStateService.name);

  // 内存中的会话状态映射
  private states = new Map<string, SessionState>();

  /**
   * 创建或更新会话状态
   */
  upsert(sessionId: string, state: Partial<SessionState>): SessionState {
    const existing = this.states.get(sessionId);
    const newState: SessionState = {
      sessionId,
      sessionKey: state.sessionKey || sessionId,
      user: state.user || { id: 'unknown', name: 'Unknown User' },
      account: state.account || 'unknown',
      startTime: state.startTime || Date.now(),
      messageCount: state.messageCount || 0,
      status: state.status || 'active',
      lastActivity: state.lastActivity || Date.now(),
      ...existing,
      ...state,
    };
    this.states.set(sessionId, newState);
    this.logger.debug(`Session state upserted: ${sessionId}`);
    return newState;
  }

  /**
   * 获取会话状态
   */
  getSession(sessionId: string): SessionState | undefined {
    return this.states.get(sessionId);
  }

  /**
   * 获取或创建会话状态
   */
  getOrCreate(sessionId: string): SessionState {
    const existing = this.states.get(sessionId);
    if (existing) {
      return existing;
    }
    return this.upsert(sessionId, { sessionId });
  }

  /**
   * 更新会话状态（部分字段）
   */
  update(sessionId: string, updates: Partial<SessionState>): SessionState | undefined {
    const existing = this.states.get(sessionId);
    if (!existing) {
      return undefined;
    }
    const updated: SessionState = {
      ...existing,
      ...updates,
      lastActivity: Date.now(),
    };
    this.states.set(sessionId, updated);
    return updated;
  }

  /**
   * 设置父消息 ID
   */
  setParentId(sessionId: string, parentId: string): boolean {
    const existing = this.states.get(sessionId);
    if (existing) {
      existing.parentId = parentId;
      this.logger.debug(`ParentId set for session ${sessionId}: ${parentId}`);
      return true;
    }
    // 如果会话不存在，先创建再设置
    this.upsert(sessionId, { sessionId, parentId });
    return true;
  }

  /**
   * 获取父消息 ID
   */
  getParentId(sessionId: string): string | undefined {
    return this.states.get(sessionId)?.parentId;
  }

  /**
   * 标记会话完成
   */
  complete(sessionId: string): SessionState | undefined {
    return this.update(sessionId, {
      status: 'completed',
      endTime: Date.now(),
    });
  }

  /**
   * 获取所有活跃会话
   */
  getActiveSessions(): SessionState[] {
    return Array.from(this.states.values()).filter(s => s.status === 'active');
  }

  /**
   * 获取所有会话
   */
  getAllSessions(): SessionState[] {
    return Array.from(this.states.values());
  }

  /**
   * 删除会话
   */
  delete(sessionId: string): void {
    this.states.delete(sessionId);
    this.logger.debug(`Session deleted: ${sessionId}`);
  }

  /**
   * 清理超时会话
   */
  cleanupTimeout(timeoutMs: number): SessionState[] {
    const now = Date.now();
    const completed: SessionState[] = [];

    for (const [sessionId, state] of this.states.entries()) {
      if (state.status === 'completed') continue;

      const inactiveTime = now - state.lastActivity;
      if (inactiveTime > timeoutMs) {
        const completedState = this.complete(sessionId);
        if (completedState) {
          completed.push(completedState);
        }
      }
    }

    return completed;
  }
}
