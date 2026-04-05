/**
 * IM Channel 基础接口
 * 所有 IM 平台必须实现此接口
 */
export interface ImChannel {
  /**
   * Channel 类型标识
   */
  readonly type: string;

  /**
   * 初始化 Channel
   * @param config Channel 配置
   */
  initialize(config: Record<string, any>): Promise<void>;

  /**
   * 发送消息
   * @param content 消息内容
   * @param options 发送选项
   */
  send(
    content: FormattedMessage,
    options?: SendMessageOptions,
  ): Promise<SendResult>;

  /**
   * 更新消息（某些 IM 支持）
   * @param messageId 消息 ID
   * @param content 新消息内容
   */
  update?(messageId: string, content: FormattedMessage): Promise<void>;

  /**
   * 关闭 Channel
   */
  destroy(): void;

  /**
   * 健康检查
   */
  healthCheck(): Promise<HealthStatus>;
}

/**
 * 格式化后的消息
 */
export interface FormattedMessage {
  msg_type: string;
  content: Record<string, any>;
  metadata?: {
    sessionId?: string;
    timestamp?: number;
    [key: string]: any;
  };
}

/**
 * 发送选项
 */
export interface SendMessageOptions {
  /** 回复到指定消息（用于 Thread 聚合） */
  reply_id?: string;
  /** 会话/群聊 ID */
  chat_id?: string;
  /** 接收者 ID */
  receive_id?: string;
  /** 额外参数 */
  [key: string]: any;
}

/**
 * 发送结果
 */
export interface SendResult {
  /** 消息 ID */
  message_id: string;
  /** 会话 ID */
  chat_id?: string;
  /** 发送时间 */
  sent_at?: number;
  /** 额外信息 */
  [key: string]: any;
}

/**
 * 健康状态
 */
export interface HealthStatus {
  /** 是否健康 */
  healthy: boolean;
  /** 错误信息 */
  error?: string;
  /** 最后检查时间 */
  last_check: number;
  /** 额外信息 */
  [key: string]: any;
}
