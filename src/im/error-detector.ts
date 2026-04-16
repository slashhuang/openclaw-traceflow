import { Injectable, Logger } from '@nestjs/common';

export interface DetectedError {
  sessionId: string;
  severity: 'critical' | 'warning' | 'info';
  pattern:
    | 'prompt-error'
    | 'tool-status-error'
    | 'non-zero-exit'
    | 'stack-trace'
    | 'consecutive-failures';
  toolName: string;
  errorMessage: string;
  rawEntry: any;
  timestamp: number;
}

interface FailureRecord {
  toolName: string;
  errorMessage: string;
  timestamp: number;
}

const STACK_TRACE_REGEX = /Error:\s+.+\n\s+at\s+/;
const ERROR_KEYWORDS = [
  'EADDRINUSE',
  'ECONNREFUSED',
  'ENOENT',
  'ETIMEDOUT',
  'EACCES',
  'EBUSY',
  'Bad credentials',
  'fetch failed',
  'extraction failed',
  'preflight',
];

/**
 * 错误检测引擎
 *
 * 识别 JSONL session 记录中的隐藏错误模式，超越 isError 字段。
 * 支持 5 种错误 pattern：
 * 1. prompt-error - LLM 超时/模型错误 (custom 事件)
 * 2. tool-status-error - 工具返回 JSON 中的 status: error
 * 3. non-zero-exit - shell 命令非零退出码
 * 4. stack-trace - 输出中的堆栈跟踪
 * 5. consecutive-failures - 连续重试检测
 */
@Injectable()
export class ErrorDetector {
  private readonly logger = new Logger(ErrorDetector.name);

  // 连续失败跟踪：key = sessionId，value = 最近的失败记录
  private failureHistory = new Map<string, FailureRecord[]>();

  // 连续失败阈值：同一工具在最近的 N 条工具结果中失败 N 次
  private readonly CONSECUTIVE_THRESHOLD = 3;

  analyzeLine(line: any, sessionId: string): DetectedError[] {
    const errors: DetectedError[] = [];

    // Pattern 1: openclaw:prompt-error custom events
    if (line.type === 'custom' && line.customType === 'openclaw:prompt-error') {
      const error = this.extractPromptError(line, sessionId);
      if (error) errors.push(error);
    }

    // Pattern 2-5: toolResult 分析
    if (this.isToolResult(line)) {
      const toolResultErrors = this.analyzeToolResult(line, sessionId);
      errors.push(...toolResultErrors);
    }

    return errors;
  }

  clearSession(sessionId: string): void {
    this.failureHistory.delete(sessionId);
  }

  // ----------------------------------------------------------------
  // 内部方法
  // ----------------------------------------------------------------

  private isToolResult(entry: any): boolean {
    return (
      entry.type === 'message' &&
      (entry.role === 'toolResult' || (entry.toolName && !entry.message?.role))
    );
  }

  /**
   * Pattern 1: LLM prompt error (custom event)
   */
  private extractPromptError(
    entry: any,
    sessionId: string,
  ): DetectedError | null {
    const errorText = entry.data?.error || '';
    if (!errorText) return null;

    const severity = this.classifySeverity(errorText, 'prompt-error');

    return {
      sessionId,
      severity,
      pattern: 'prompt-error',
      toolName: 'llm',
      errorMessage: errorText,
      rawEntry: entry,
      timestamp: entry.data?.timestamp || Date.now(),
    };
  }

  /**
   * Pattern 2-5: 分析 toolResult 中的错误
   */
  private analyzeToolResult(entry: any, sessionId: string): DetectedError[] {
    const errors: DetectedError[] = [];
    const toolName = entry.toolName || entry.message?.toolCallId || 'unknown';
    const content = entry.content || entry.message?.content;
    const isError = entry.isError ?? false;

    // 如果 isError 已经为 true，不需要额外检测（已在原有逻辑中处理）
    // 但我们仍然检测其他 pattern

    const textContent = this.extractTextContent(content);

    // Pattern 2: JSON 中的 status: error
    const statusError = this.checkStatusError(content, toolName, sessionId);
    if (statusError) errors.push(statusError);

    // Pattern 3: 非零退出码
    const exitCodeError = this.checkNonZeroExit(entry, toolName, sessionId);
    if (exitCodeError) errors.push(exitCodeError);

    // Pattern 4: 堆栈跟踪
    const stackError = this.checkStackTrace(textContent, toolName, sessionId);
    if (stackError) errors.push(stackError);

    // Pattern 5: 连续失败跟踪
    if (statusError || exitCodeError || isError) {
      this.recordFailure(
        sessionId,
        toolName,
        statusError?.errorMessage ||
          exitCodeError?.errorMessage ||
          'unknown error',
      );
      const consecutiveError = this.checkConsecutiveFailures(
        sessionId,
        toolName,
      );
      if (consecutiveError) errors.push(consecutiveError);
    } else {
      // 成功则清除该工具的历史失败记录
      this.recordSuccess(sessionId, toolName);
    }

    return errors;
  }

  /**
   * 从 content 数组中提取纯文本
   */
  private extractTextContent(content: any): string {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content
        .filter(
          (item: any) => item?.type === 'text' && typeof item.text === 'string',
        )
        .map((item: any) => item.text)
        .join('\n');
    }
    return '';
  }

  /**
   * Pattern 2: JSON 中的 status: error 或 error 字段
   */
  private checkStatusError(
    content: any,
    toolName: string,
    sessionId: string,
  ): DetectedError | null {
    const textContent = this.extractTextContent(content);

    // 尝试解析为 JSON
    let parsed: any;
    try {
      parsed = JSON.parse(textContent);
    } catch {
      return null;
    }

    // 检查 status: error
    if (parsed.status === 'error' && parsed.error) {
      const severity = this.classifySeverity(parsed.error, 'tool-status-error');
      return {
        sessionId,
        severity,
        pattern: 'tool-status-error',
        toolName,
        errorMessage: parsed.error,
        rawEntry: {
          type: 'toolResult',
          toolName,
          status: 'error',
          error: parsed.error,
        },
        timestamp: Date.now(),
      };
    }

    // 检查空结果（可能的数据缺失）
    if (
      Array.isArray(parsed.results) &&
      parsed.results.length === 0 &&
      parsed.provider === 'none'
    ) {
      return {
        sessionId,
        severity: 'info',
        pattern: 'tool-status-error',
        toolName,
        errorMessage: `Empty results from ${parsed.provider} provider`,
        rawEntry: {
          type: 'toolResult',
          toolName,
          status: 'empty',
          provider: parsed.provider,
        },
        timestamp: Date.now(),
      };
    }

    return null;
  }

  /**
   * Pattern 3: 非零退出码
   */
  private checkNonZeroExit(
    entry: any,
    toolName: string,
    sessionId: string,
  ): DetectedError | null {
    const exitCode = entry.details?.exitCode;
    if (exitCode === undefined || exitCode === null || exitCode === 0) {
      return null;
    }

    // 从 content 中提取错误信息
    const textContent = this.extractTextContent(
      entry.content || entry.message?.content,
    );
    const errorMessage =
      this.extractErrorMessageFromOutput(textContent) ||
      `Command exited with code ${exitCode}`;

    return {
      sessionId,
      severity: 'critical',
      pattern: 'non-zero-exit',
      toolName,
      errorMessage,
      rawEntry: { type: 'toolResult', toolName, exitCode },
      timestamp: Date.now(),
    };
  }

  /**
   * Pattern 4: 堆栈跟踪
   */
  private checkStackTrace(
    textContent: string,
    toolName: string,
    sessionId: string,
  ): DetectedError | null {
    if (!textContent) return null;

    // 检测堆栈跟踪模式
    if (STACK_TRACE_REGEX.test(textContent)) {
      // 提取错误消息（第一行 Error: ...）
      const errorMatch = textContent.match(/Error:\s+(.+)/);
      const errorMessage = errorMatch
        ? errorMatch[1]
        : 'Unknown stack trace error';

      return {
        sessionId,
        severity: 'critical',
        pattern: 'stack-trace',
        toolName,
        errorMessage,
        rawEntry: { type: 'toolResult', toolName, hasStackTrace: true },
        timestamp: Date.now(),
      };
    }

    // 检测已知错误码（即使没有完整堆栈）
    for (const keyword of ERROR_KEYWORDS) {
      if (textContent.includes(keyword)) {
        return {
          sessionId,
          severity: 'warning',
          pattern: 'stack-trace',
          toolName,
          errorMessage: keyword,
          rawEntry: { type: 'toolResult', toolName, keyword },
          timestamp: Date.now(),
        };
      }
    }

    return null;
  }

  /**
   * Pattern 5: 连续失败检测
   */
  private recordFailure(
    sessionId: string,
    toolName: string,
    errorMessage: string,
  ): void {
    let history = this.failureHistory.get(sessionId);
    if (!history) {
      history = [];
      this.failureHistory.set(sessionId, history);
    }
    history.push({ toolName, errorMessage, timestamp: Date.now() });

    // 只保留最近 10 条记录
    if (history.length > 10) {
      history.splice(0, history.length - 10);
    }
  }

  private recordSuccess(sessionId: string, toolName: string): void {
    const history = this.failureHistory.get(sessionId);
    if (!history) return;

    // 清除该工具的成功前的失败记录（打断连续计数）
    // 从后往前找到第一个非该工具的记录，截断
    let lastNonMatchingIndex = -1;
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].toolName !== toolName) {
        lastNonMatchingIndex = i;
        break;
      }
    }
    if (lastNonMatchingIndex >= 0) {
      history.splice(0, lastNonMatchingIndex + 1);
    } else {
      history.length = 0;
    }
  }

  private checkConsecutiveFailures(
    sessionId: string,
    toolName: string,
  ): DetectedError | null {
    const history = this.failureHistory.get(sessionId);
    if (!history || history.length < this.CONSECUTIVE_THRESHOLD) return null;

    // 检查最后 N 条是否都是同一工具
    const recent = history.slice(-this.CONSECUTIVE_THRESHOLD);
    const allSameTool = recent.every((r) => r.toolName === toolName);
    if (!allSameTool) return null;

    return {
      sessionId,
      severity: 'critical',
      pattern: 'consecutive-failures',
      toolName,
      errorMessage: `${toolName} failed ${recent.length} times consecutively`,
      rawEntry: {
        type: 'consecutive-failures',
        toolName,
        count: recent.length,
      },
      timestamp: Date.now(),
    };
  }

  /**
   * 从输出中提取人类可读的错误信息
   */
  private extractErrorMessageFromOutput(text: string): string | null {
    if (!text) return null;

    // 尝试匹配 "Error: ..." 或 "Message: ..."
    const patterns = [/Error:\s*(.+)/, /Message:\s*(.+)/, /failed:\s*(.+)/];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return match[1].trim().substring(0, 200);
      }
    }

    // 尝试匹配 JSON 中的 message 字段
    const jsonMatch = text.match(/"message":\s*"([^"]+)"/);
    if (jsonMatch) {
      return jsonMatch[1].substring(0, 200);
    }

    return null;
  }

  /**
   * 根据错误内容分类严重程度
   */
  private classifySeverity(
    message: string,
    pattern: string,
  ): 'critical' | 'warning' | 'info' {
    const lower = message.toLowerCase();

    // Critical: 认证失败、连接拒绝、地址占用、超时
    if (
      lower.includes('bad credentials') ||
      lower.includes('econnrefused') ||
      lower.includes('eaddrinuse') ||
      lower.includes('timed out') ||
      lower.includes('timeout') ||
      lower.includes('unauthorized') ||
      lower.includes('forbidden')
    ) {
      return 'critical';
    }

    // Warning: 获取失败、提取失败、404、权限拒绝
    if (
      lower.includes('fetch failed') ||
      lower.includes('extraction failed') ||
      lower.includes('404') ||
      lower.includes('blocked') ||
      lower.includes('preflight') ||
      lower.includes('no content') ||
      lower.includes('empty results')
    ) {
      return 'warning';
    }

    return 'info';
  }
}
