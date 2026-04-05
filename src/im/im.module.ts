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

/**
 * IM 推送模块
 * 使用 Channel 插件架构
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
  exports: [ChannelManager, ImPushService, SessionManager, SessionStateService],
})
export class ImModule {}
