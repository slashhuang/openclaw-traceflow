import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { OpenClawFileWatcher } from './file-watcher.adapter';
import { SessionManager } from '../session-manager';

/**
 * OpenClaw 事件桥接服务
 * 将 FileWatcher 事件转换为 SessionManager 事件
 */
@Injectable()
export class OpenClawEventBridge implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OpenClawEventBridge.name);

  constructor(
    private eventEmitter: EventEmitter2,
    private fileWatcher: OpenClawFileWatcher,
    private sessionManager: SessionManager,
  ) {}

  onModuleInit(): void {
    // 监听 FileWatcher 的 session:start 事件
    this.eventEmitter.on('session:start', (data) =>
      this.handleSessionStart(data),
    );

    // 监听 FileWatcher 的 session:message 事件
    this.eventEmitter.on('session:message', (data) =>
      this.handleSessionMessage(data),
    );

    this.logger.log('OpenClaw Event Bridge initialized');
  }

  /**
   * 处理会话开始事件
   */
  private async handleSessionStart(data: {
    sessionKey: string;
    sessionId: string;
    sessionFile: string;
  }): Promise<void> {
    try {
      // 从 sessionKey 解析用户信息
      const userInfo = this.parseUserInfoFromSessionKey(data.sessionKey);

      // 触发 SessionManager 的会话开始
      await this.sessionManager.onSessionStart({
        sessionId: data.sessionKey,
        sessionKey: data.sessionKey,
        user: userInfo,
        account: userInfo.account,
        messageCount: 0,
        status: 'active',
      });

      this.logger.debug(`Session started: ${data.sessionKey}`);
    } catch (error) {
      this.logger.error(
        `Failed to handle session start: ${data.sessionKey}`,
        error as Error,
      );
    }
  }

  /**
   * 处理会话消息事件
   */
  private async handleSessionMessage(data: {
    sessionKey: string;
    sessionId: string;
    record: any;
  }): Promise<void> {
    try {
      // 转换 JSONL 记录为 SessionManager 消息格式
      const message = this.convertRecordToMessage(data.record);

      // 触发 SessionManager 的消息事件
      await this.sessionManager.onSessionMessage(data.sessionKey, message);

      this.logger.debug(`Message processed: ${data.sessionKey}`);
    } catch (error) {
      this.logger.error(
        `Failed to handle session message: ${data.sessionKey}`,
        error as Error,
      );
    }
  }

  /**
   * 从 sessionKey 解析用户信息
   */
  private parseUserInfoFromSessionKey(sessionKey: string): {
    id: string;
    name: string;
    account: string;
  } {
    // sessionKey 格式：agent:main:feishu:direct:ou_xxx
    const parts = sessionKey.split(':');
    const account = parts[2] || 'unknown';
    const userId = parts[parts.length - 1] || 'unknown';

    return {
      id: userId,
      name: userId, // 名字需要从 sessions.json 获取，这里先用 ID
      account,
    };
  }

  /**
   * 转换 JSONL 记录为消息格式
   */
  private convertRecordToMessage(record: any): {
    type: 'user' | 'assistant' | 'skill:start' | 'skill:end';
    content: any;
    timestamp: number;
  } {
    switch (record.type) {
      case 'user':
        return {
          type: 'user',
          content: record,
          timestamp: record.timestamp,
        };
      case 'assistant':
        return {
          type: 'assistant',
          content: record,
          timestamp: record.timestamp,
        };
      case 'skill':
        // 根据是否有 output 判断是开始还是结束
        if (record.output !== undefined) {
          return {
            type: 'skill:end',
            content: record,
            timestamp: record.timestamp,
          };
        } else {
          return {
            type: 'skill:start',
            content: record,
            timestamp: record.timestamp,
          };
        }
      default:
        // 未知类型，当作普通消息
        return {
          type: 'user',
          content: record,
          timestamp: record.timestamp,
        };
    }
  }

  onModuleDestroy(): void {
    this.logger.log('OpenClaw Event Bridge destroyed');
  }
}
