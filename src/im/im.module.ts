import { Module } from '@nestjs/common';
import { ConfigModule } from '../config/config.module';
import { ChannelManager } from './channel-manager';
import { ImPushService } from './im-push.service';
import { ImController } from './im.controller';
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
    ChannelManager,
    ImPushService,
    FeishuMessageFormatter,
    // 注册所有 Channel 插件
    {
      provide: 'CHANNEL_PLUGINS',
      useFactory: (
        feishuChannel: FeishuChannel,
        dingtalkChannel: DingTalkChannel,
      ) => [
        feishuChannel,
        dingtalkChannel,
      ],
      inject: [FeishuChannel, DingTalkChannel],
    },
    FeishuChannel,
    DingTalkChannel,
  ],
  exports: [ChannelManager, ImPushService],
})
export class ImModule {}
