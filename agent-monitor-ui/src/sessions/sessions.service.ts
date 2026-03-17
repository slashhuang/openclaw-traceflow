import { Injectable } from '@nestjs/common';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface Session {
  sessionKey: string;
  sessionId: string;
  user: string;
  status: 'active' | 'idle' | 'completed' | 'failed';
  lastActive: number;
  duration: number;
}

export interface SessionDetail extends Session {
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
  }>;
  toolCalls: Array<{
    tool: string;
    duration: number;
    success: boolean;
  }>;
}

@Injectable()
export class SessionsService {
  async listSessions(): Promise<Session[]> {
    try {
      // TODO: 调用 OpenClaw sessions_list API
      // 暂时返回模拟数据
      return [
        {
          sessionKey: 'calm-lagoon',
          sessionId: 'session_001',
          user: 'ou_31fd1b6d3639ffaf1e4d70c5de2f5ef4',
          status: 'active',
          lastActive: Date.now(),
          duration: 120000,
        },
        {
          sessionKey: 'tidal-bloom',
          sessionId: 'session_002',
          user: 'ou_31fd1b6d3639ffaf1e4d70c5de2f5ef4',
          status: 'completed',
          lastActive: Date.now() - 300000,
          duration: 300000,
        },
      ];
    } catch (error) {
      console.error('Failed to list sessions:', error);
      return [];
    }
  }

  async getSessionById(id: string): Promise<SessionDetail | null> {
    try {
      // TODO: 调用 OpenClaw sessions_history API
      return {
        sessionKey: 'calm-lagoon',
        sessionId: id,
        user: 'ou_31fd1b6d3639ffaf1e4d70c5de2f5ef4',
        status: 'active',
        lastActive: Date.now(),
        duration: 120000,
        messages: [
          {
            role: 'user',
            content: '你好',
            timestamp: Date.now() - 120000,
          },
          {
            role: 'assistant',
            content: '你好！我是阿布，有什么可以帮你的吗？',
            timestamp: Date.now() - 119000,
          },
        ],
        toolCalls: [
          {
            tool: 'memory_search',
            duration: 150,
            success: true,
          },
        ],
      };
    } catch (error) {
      console.error('Failed to get session:', error);
      return null;
    }
  }

  async getSessionStatus(id: string): Promise<'active' | 'idle' | 'completed' | 'failed'> {
    const session = await this.getSessionById(id);
    return session?.status || 'completed';
  }

  async killSession(id: string): Promise<boolean> {
    try {
      // TODO: 调用 OpenClaw sessions_kill API
      console.log('Killing session:', id);
      return true;
    } catch (error) {
      console.error('Failed to kill session:', error);
      return false;
    }
  }
}
