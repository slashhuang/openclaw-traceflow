import { Injectable, Logger } from '@nestjs/common';
import { FormattedMessage } from '../../base.channel';

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
    const statusIcon = status === 'completed' ? '✅' : '🟢';
    const statusText = status === 'completed' ? '已完成' : '进行中';

    const text = `【审计·会话】${session.user.name} @ ${this.formatTime(session.startTime)} ${statusIcon}
━━━━━━━━━━━━━━━━━━━━━━
👤 用户：${session.user.name} (${session.user.id})
🤖 账号：${session.account}
💬 会话：${session.sessionId}
📊 状态：${statusText}

${
  status === 'completed'
    ? `
【会话摘要】
• 消息数：${session.messageCount} 条
• 总耗时：${this.formatDuration(session.endTime! - session.startTime)}
• Token：输入 ${session.tokenInput || 0}，输出 ${session.tokenOutput || 0}
`
    : ''
}
【首条消息】
"${session.firstMessage || '...'}"

━━━━━━━━━━━━━━━━━━━━━━
📎 点击展开查看完整对话
🔗 在 TraceFlow 中查看：${this.getTraceflowUrl(session.sessionId)}
`;

    return {
      msg_type: 'text',
      content: { text },
    };
  }

  /**
   * 格式化用户消息
   */
  formatUserMessage(message: UserMessage): FormattedMessage {
    const text = `💬 【用户消息】
📅 ${this.formatTime(message.timestamp, true)}

${message.content}

---
📎 消息 ID: ${message.messageId}
`;

    return {
      msg_type: 'text',
      content: { text },
    };
  }

  /**
   * 格式化 AI 回复
   */
  formatAssistantMessage(message: AssistantMessage): FormattedMessage {
    const text = `🤖 【AI 回复】
📅 ${this.formatTime(message.timestamp, true)}
🧠 模型：${message.model}
🪙 Token: ${message.tokens.input} → ${message.tokens.output}
⏱️ 耗时：${this.formatDuration(message.durationMs)}

${message.content}

---
🔧 技能：${message.skillsUsed?.join(', ') || '无'}
`;

    return {
      msg_type: 'text',
      content: { text },
    };
  }

  /**
   * 格式化技能开始
   */
  formatSkillStart(message: SkillStartMessage): FormattedMessage {
    const text = `🔧 【技能开始】
📅 ${this.formatTime(message.timestamp, true)}
📦 技能：${message.skillName}
📝 动作：${message.action}

【输入】
\`\`\`json
${this.truncateJson(message.input)}
\`\`\`
`;

    return {
      msg_type: 'text',
      content: { text },
    };
  }

  /**
   * 格式化技能结束
   */
  formatSkillEnd(message: SkillEndMessage): FormattedMessage {
    const statusIcon = message.status === 'success' ? '✅' : '❌';
    const text = `✅ 【技能结束】
📅 ${this.formatTime(message.timestamp, true)}
📦 技能：${message.skillName}
${statusIcon} 状态：${message.status}
⏱️ 耗时：${this.formatDuration(message.durationMs)}

【输出】
\`\`\`json
${this.truncateJson(message.output)}
\`\`\`
`;

    return {
      msg_type: 'text',
      content: { text },
    };
  }

  /**
   * 格式化会话结束
   */
  formatSessionEnd(session: SessionData): FormattedMessage {
    const text = `✅ 【会话结束】
📅 ${this.formatTime(session.endTime!, true)}
📊 统计：
  • 总消息：${session.messageCount} 条
  • 总耗时：${this.formatDuration(session.endTime! - session.startTime)}
  • Token：输入 ${session.tokenInput || 0}，输出 ${session.tokenOutput || 0}
`;

    return {
      msg_type: 'text',
      content: { text },
    };
  }

  /**
   * 格式化 ERROR 日志告警
   */
  formatErrorLog(log: LogEntry): FormattedMessage {
    const text = `❌【审计·错误告警】
━━━━━━━━━━━━━━━━━━━━━━
📅 ${this.formatTime(log.timestamp)}
📦 组件：${log.component}
💬 会话：${log.sessionId || 'N/A'}

【错误内容】
${log.message}

【堆栈跟踪】
\`\`\`
${log.stack || '无堆栈信息'}
\`\`\`

━━━━━━━━━━━━━━━━━━━━━━
🔗 在 TraceFlow 中查看：${this.getTraceflowLogsUrl()}
`;

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
   * 截断 JSON（避免消息过长）
   */
  private truncateJson(obj: any, maxLength = 500): string {
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
