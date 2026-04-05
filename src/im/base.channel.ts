/**
 * IM Channel 基础接口
 * 所有 IM 通道实现必须遵循此接口
 */
export interface ImChannel {
  /**
   * 通道类型（feishu, dingtalk, wecom 等）
   */
  readonly type: string;

  /**
   * 初始化通道
   */
  initialize(): Promise<void>;

  /**
   * 发送消息
   * @param content 消息内容
   * @param options 发送选项（如 reply_id 用于 Thread 回复）
   */
  send(
    content: FormattedMessage,
    options?: SendMessageOptions,
  ): Promise<SendResult>;

  /**
   * 更新消息
   * @param messageId 消息 ID
   * @param content 新消息内容
   */
  update(messageId: string, content: FormattedMessage): Promise<void>;

  /**
   * 关闭通道
   */
  destroy(): void;
}

/**
 * 格式化后的消息
 */
export interface FormattedMessage {
  msg_type: 'text' | 'interactive' | 'post';
  content: {
    text?: string;
    data?: any;
  };
}

/**
 * 发送选项
 */
export interface SendMessageOptions {
  /**
   * 回复到指定消息（用于 Thread 聚合）
   */
  reply_id?: string;

  /**
   * 会话 ID（某些 IM 需要）
   */
  chat_id?: string;
}

/**
 * 发送结果
 */
export interface SendResult {
  /**
   * 消息 ID
   */
  message_id: string;

  /**
   * 会话 ID（某些 IM 返回）
   */
  chat_id?: string;

  /**
   * Thread ID（某些 IM 返回）
   */
  thread_id?: string;
}

/**
 * IM 通道配置
 */
export interface ImChannelConfig {
  enabled: boolean;
  type: string;
  config: Record<string, any>;
  pushStrategy?: {
    sessionStart?: boolean;
    sessionMessages?: boolean;
    sessionEnd?: boolean;
    errorLogs?: boolean;
    warnLogs?: boolean;
  };
}
