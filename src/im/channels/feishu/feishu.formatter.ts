import { Injectable, Logger } from '@nestjs/common';
import { FormattedMessage } from '../../channel.interface';

export interface SessionData {
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
}

export interface UserMessage {
  type: 'user';
  content: string;
  timestamp: number;
  messageId: string;
  senderId: string;
  senderName: string;
}

export interface AssistantMessage {
  type: 'assistant';
  content: string;
  timestamp: number;
  model: string;
  tokens: { input: number; output: number };
  durationMs: number;
  skillsUsed?: string[];
}

export interface SkillStartMessage {
  type: 'skill:start';
  skillName: string;
  action: string;
  input: any;
  timestamp: number;
}

export interface SkillEndMessage {
  type: 'skill:end';
  skillName: string;
  status: 'success' | 'error';
  output: any;
  durationMs: number;
  timestamp: number;
}

export interface LogEntry {
  level: 'info' | 'warn' | 'error' | 'debug';
  component: string;
  message: string;
  stack?: string;
  timestamp: number;
  sessionId?: string;
}

/**
 * 飞书消息格式化器
 */
@Injectable()
export class FeishuMessageFormatter {
  private readonly logger = new Logger(FeishuMessageFormatter.name);

  /**
   * 格式化会话父消息
   */
  formatSessionParent(
    session: SessionData,
    status: 'active' | 'completed',
  ): FormattedMessage {
    const text = `💬 会话开始：${session.user.name}`;

    return {
      msg_type: 'text',
      content: { text },
    };
  }

  /**
   * 格式化用户消息
   */
  formatUserMessage(message: {
    type: 'user';
    content: { text: string } | string;
    timestamp: number;
    messageId?: string;
    senderId?: string;
    senderName?: string;
  }): FormattedMessage {
    // 兼容两种格式：{ text: string } 或直接是 string
    const textContent =
      typeof message.content === 'string'
        ? message.content
        : message.content?.text || '[无内容]';

    const text = `👤 ${textContent}`;

    return {
      msg_type: 'text',
      content: { text },
    };
  }

  /**
   * 格式化 AI 回复
   */
  formatAssistantMessage(message: {
    type: 'assistant';
    content: { text: string } | string;
    timestamp: number;
    model?: string;
    tokens?: { input: number; output: number };
    durationMs?: number;
    skillsUsed?: string[];
  }): FormattedMessage {
    // 兼容两种格式：{ text: string } 或直接是 string
    const textContent =
      typeof message.content === 'string'
        ? message.content
        : message.content?.text || '[无内容]';

    const text = `🤖 ${textContent}`;

    return {
      msg_type: 'text',
      content: { text },
    };
  }

  /**
   * 格式化技能开始（审计关键信息：动作 + 输入）
   */
  formatSkillStart(message: SkillStartMessage): FormattedMessage {
    const text = `🔧 ${message.skillName}: ${message.action}

【输入参数】
${this.truncateJson(message.input, 2000)}`;

    return {
      msg_type: 'text',
      content: { text },
    };
  }

  /**
   * 格式化技能结束（审计关键信息：状态 + 输出 + 耗时）
   */
  formatSkillEnd(message: SkillEndMessage): FormattedMessage {
    const statusIcon = message.status === 'success' ? '✅' : '❌';
    const text = `${statusIcon} ${message.skillName}: ${message.status} (${this.formatDuration(message.durationMs)})

【输出结果】
${this.truncateJson(message.output, 2000)}`;

    return {
      msg_type: 'text',
      content: { text },
    };
  }

  /**
   * 格式化会话结束
   */
  formatSessionEnd(session: SessionData): FormattedMessage {
    const text = `✅ 会话结束：${session.messageCount} 条消息，${this.formatDuration(session.endTime! - session.startTime)}`;

    return {
      msg_type: 'text',
      content: { text },
    };
  }

  /**
   * 格式化 ERROR 日志告警
   */
  formatErrorLog(log: LogEntry): FormattedMessage {
    const text = `❌ ${log.component}: ${log.message}`;

    return {
      msg_type: 'text',
      content: { text },
    };
  }

  /**
   * 格式化时间
   */
  private formatTime(timestamp: number, includeMs = false): string {
    const date = new Date(timestamp);
    const base = date.toLocaleString('zh-CN', {
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    if (includeMs) {
      const ms = date.getMilliseconds().toString().padStart(3, '0');
      return `${base}.${ms}`;
    }

    return base;
  }

  /**
   * 格式化时长
   */
  private formatDuration(ms: number): string {
    const seconds = ms / 1000;
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = (seconds % 60).toFixed(1);
    return `${minutes}m ${remainingSeconds}s`;
  }

  /**
   * 截断 JSON（避免消息过长，审计场景下尽量保留完整信息）
   */
  private truncateJson(obj: any, maxLength = 4000): string {
    const json = JSON.stringify(obj, null, 2);
    if (json.length <= maxLength) return json;
    return json.substring(0, maxLength) + '\n... (truncated)';
  }

  /**
   * 生成 TraceFlow URL
   */
  private getTraceflowUrl(sessionId: string): string {
    const baseUrl = process.env.TRACEFLOW_WEB_URL || 'http://localhost:3001';
    return `${baseUrl}/sessions/${encodeURIComponent(sessionId)}`;
  }

  private getTraceflowLogsUrl(): string {
    const baseUrl = process.env.TRACEFLOW_WEB_URL || 'http://localhost:3001';
    return `${baseUrl}/logs?level=error`;
  }
}
