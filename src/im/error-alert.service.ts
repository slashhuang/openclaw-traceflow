import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '../config/config.service';
import { ChannelManager } from './channel-manager';
import type { FormattedMessage } from './channel.interface';
import type { DetectedError } from './error-detector';

interface ErrorAggregation {
  errors: DetectedError[];
  timer: NodeJS.Timeout;
}

const SEVERITY_ORDER = { critical: 0, warning: 1, info: 2 };

/**
 * 错误告警服务
 *
 * 监听 audit.session.error 事件，按 severity 过滤，
 * 在聚合窗口内合并同会话错误，通过 IM Channel 推送告警。
 */
@Injectable()
export class ErrorAlertService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ErrorAlertService.name);

  // 每会话错误聚合：sessionId -> { errors[], timer }
  private aggregations = new Map<string, ErrorAggregation>();

  // 已注册的事件监听器标记（用于重载时去重）
  private eventListenersRegistered = false;

  constructor(
    private eventEmitter: EventEmitter2,
    private configService: ConfigService,
    private channelManager: ChannelManager,
  ) {}

  onModuleInit(): void {
    this.initializeEventListeners();
  }

  onModuleDestroy(): void {
    this.removeEventListeners();
    // 清理所有聚合定时器
    for (const agg of this.aggregations.values()) {
      clearTimeout(agg.timer);
    }
    this.aggregations.clear();
  }

  private initializeEventListeners(): void {
    const config = this.configService.getConfig();

    if (this.eventListenersRegistered) {
      this.removeEventListeners();
    }

    const errorMonitorConfig = config.im?.errorMonitor;
    if (!config.im?.enabled || !errorMonitorConfig?.enabled) {
      this.logger.log(
        'Error Monitor disabled in config, skipping initialization',
      );
      this.eventListenersRegistered = false;
      return;
    }

    this.eventEmitter.on('audit.session.error', (data: any) => {
      void this.handleSessionError(data);
    });

    this.eventListenersRegistered = true;
    this.logger.log('Error Alert Service initialized');
  }

  private removeEventListeners(): void {
    this.eventEmitter.removeAllListeners('audit.session.error');
    this.eventListenersRegistered = false;
  }

  /**
   * 处理检测到的错误
   * 使用聚合窗口合并同会话短时间内的多个错误
   */
  private async handleSessionError(data: {
    errors: DetectedError[];
    sessionId: string;
    timestamp: number;
  }): Promise<void> {
    const config = this.configService.getConfig();
    const errorMonitorConfig = config.im?.errorMonitor;
    if (!errorMonitorConfig) return;

    // 过滤启用的 pattern
    const enabledPatterns = errorMonitorConfig.patterns || {
      promptError: true,
      toolStatusError: true,
      nonZeroExit: true,
      stackTrace: true,
      consecutiveFailures: true,
    };

    const patternMap: Record<string, string> = {
      'prompt-error': 'promptError',
      'tool-status-error': 'toolStatusError',
      'non-zero-exit': 'nonZeroExit',
      'stack-trace': 'stackTrace',
      'consecutive-failures': 'consecutiveFailures',
    };

    // 过滤 severity
    const minSeverity = errorMonitorConfig.minSeverity || 'warning';
    const minSeverityLevel = SEVERITY_ORDER[minSeverity] ?? 1;

    const filteredErrors = data.errors.filter((err) => {
      // 检查 pattern 是否启用
      const configKey = patternMap[err.pattern];
      if (configKey && !enabledPatterns[configKey]) return false;

      // 检查 severity 是否达到阈值
      return SEVERITY_ORDER[err.severity] <= minSeverityLevel;
    });

    if (filteredErrors.length === 0) return;

    const sessionId = data.sessionId;
    const aggregateWindowMs = errorMonitorConfig.aggregateWindowMs || 30000;

    // 加入聚合
    let aggregation = this.aggregations.get(sessionId);
    if (!aggregation) {
      aggregation = { errors: [], timer: undefined as any };
      aggregation.timer = setTimeout(() => {
        this.aggregations.delete(sessionId);
        void this.flushAggregation(sessionId, aggregation!.errors);
      }, aggregateWindowMs);
      this.aggregations.set(sessionId, aggregation);
    }

    aggregation.errors.push(...filteredErrors);
    this.logger.log(
      `Aggregated ${filteredErrors.length} error(s) for session ${sessionId.slice(0, 8)}...`,
    );
  }

  /**
   * 刷新聚合窗口，将收集到的错误发送为一条告警
   */
  private async flushAggregation(
    sessionId: string,
    errors: DetectedError[],
  ): Promise<void> {
    if (errors.length === 0) return;

    this.logger.log(
      `Flushing ${errors.length} error(s) for session ${sessionId.slice(0, 8)}...`,
    );

    // 按 severity 排序，critical 优先
    errors.sort(
      (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
    );

    const highestSeverity = errors[0].severity;

    // 构建告警消息
    const formattedMessage = this.buildAlertMessage(
      sessionId,
      errors,
      highestSeverity,
    );

    // 构建发送选项：如果配置了 errorMonitor.targetChatId，发送到群聊
    const config = this.configService.getConfig();
    const targetChatId = config.im?.errorMonitor?.targetChatId;
    const sendOptions: any = {};
    if (targetChatId) {
      sendOptions.receive_id = targetChatId;
      sendOptions.receive_id_type = 'chat_id';
    }

    try {
      await this.channelManager.sendToChannel(
        'feishu',
        formattedMessage,
        sendOptions,
      );
      this.logger.log(
        `Error alert sent to Feishu${targetChatId ? ` (group: ${targetChatId.slice(0, 16)}...)` : ''}: ${errors.length} error(s) for session ${sessionId.slice(0, 8)}...`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send error alert: ${(error as Error).message}`,
      );
    }
  }

  /**
   * 构建 IM 告警消息
   */
  private buildAlertMessage(
    sessionId: string,
    errors: DetectedError[],
    highestSeverity: string,
  ): FormattedMessage {
    const severityIcon =
      highestSeverity === 'critical'
        ? '🚨'
        : highestSeverity === 'warning'
          ? '⚠️'
          : 'ℹ️';

    const sessionShort = sessionId.slice(0, 8);
    const timeStr = new Date().toLocaleString('zh-CN', {
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    // 构建错误列表
    const errorLines = errors
      .map((err, i) => {
        const sev =
          err.severity === 'critical'
            ? '🔴'
            : err.severity === 'warning'
              ? '🟡'
              : '🔵';
        return `${i + 1}. ${sev} [${err.pattern}] ${err.toolName}: ${err.errorMessage}`;
      })
      .join('\n');

    const traceflowUrl = this.getTraceflowUrl(sessionId);

    const text = `${severityIcon} 错误监控告警

会话: ${sessionShort}...
严重级别: ${highestSeverity}
错误数量: ${errors.length}
时间: ${timeStr}

${errorLines}

查看会话: ${traceflowUrl}`;

    return {
      msg_type: 'text',
      content: { text },
    };
  }

  private getTraceflowUrl(sessionId: string): string {
    const baseUrl = process.env.TRACEFLOW_WEB_URL || 'http://localhost:3001';
    return `${baseUrl}/sessions/${encodeURIComponent(sessionId)}`;
  }

  /**
   * 从配置重新加载
   */
  reloadFromConfig(): void {
    this.logger.log('ErrorAlertService reloading from config...');
    this.initializeEventListeners();
  }
}
