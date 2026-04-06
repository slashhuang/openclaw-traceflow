import { Module } from '@nestjs/common';
import { ConfigModule } from '../config/config.module';
import { ChannelManager } from './channel-manager';
import { ImPushService } from './im-push.service';
import { ImController } from './im.controller';
import { SessionManager } from './session-manager';
import { SessionStateService } from './session-state.service';
import { FeishuChannel } from './channels/feishu/feishu.channel';
import { DingTalkChannel } from './channels/dingtalk/dingtalk.channel';
import { FeishuMessageFormatter } from './channels/feishu/feishu.formatter';
import { MessageQueueService } from './message-queue.service';
import { CircuitBreakerService } from './circuit-breaker.service';
import { MessagePersistenceService } from './message-persistence.service';

/**
 * IM 推送模块
 * 使用 Channel 插件架构
 *
 * 增强特性（v1.2.0）：
 * - 每会话独立队列 - 保证消息顺序，互不阻塞
 * - 熔断器保护 - API 失败时快速失败
 * - 持久化存储 - 服务重启后恢复
 * - 指数退避重试 - 失败消息自动重试
 */
@Module({
  imports: [ConfigModule],
  controllers: [ImController],
  providers: [
    SessionStateService,
    SessionManager,
    ChannelManager,
    ImPushService,
    FeishuMessageFormatter,
    MessageQueueService,
    CircuitBreakerService,
    MessagePersistenceService,
    // 注册所有 Channel 插件
    {
      provide: 'CHANNEL_PLUGINS',
      useFactory: (
        feishuChannel: FeishuChannel,
        dingtalkChannel: DingTalkChannel,
      ) => [feishuChannel, dingtalkChannel],
      inject: [FeishuChannel, DingTalkChannel],
    },
    // 为 SessionManager 提供字符串别名，方便 OpenClawService 注入
    {
      provide: 'SessionManager',
      useExisting: SessionManager,
    },
    FeishuChannel,
    DingTalkChannel,
  ],
  exports: [
    ChannelManager,
    ImPushService,
    SessionManager,
    SessionStateService,
    MessageQueueService,
    CircuitBreakerService,
    MessagePersistenceService,
  ],
})
export class ImModule {}
