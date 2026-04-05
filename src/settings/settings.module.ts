import { Module } from '@nestjs/common';
import { PathConfigController } from './path-config.controller';
import { ImConfigController } from './im-config.controller';
import { ConfigModule } from '../config/config.module';
import { OpenClawModule } from '../openclaw/openclaw.module';
import { ImModule } from '../im/im.module';
import { FeishuChannel } from '../im/channels/feishu/feishu.channel';

/**
 * 设置模块
 */
@Module({
  imports: [ConfigModule, OpenClawModule, ImModule],
  controllers: [PathConfigController, ImConfigController],
  providers: [FeishuChannel],
})
export class SettingsModule {}
