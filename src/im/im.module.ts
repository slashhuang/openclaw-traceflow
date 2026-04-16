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
import { ErrorDetector } from './error-detector';
import { ErrorAlertService } from './error-alert.service';

/**
 * IM 推送模块（简化版 - 内存队列）
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
    ErrorDetector,
    ErrorAlertService,
    // 注册所有 Channel 插件
    {
      provide: 'CHANNEL_PLUGINS',
      useFactory: (
        feishuChannel: FeishuChannel,
        dingtalkChannel: DingTalkChannel,
      ) => [feishuChannel, dingtalkChannel],
      inject: [FeishuChannel, DingTalkChannel],
    },
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
    ErrorDetector,
    ErrorAlertService,
  ],
})
export class ImModule {}
