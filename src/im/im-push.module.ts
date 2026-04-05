import { Module } from '@nestjs/common';
import { SessionsModule } from '../sessions/sessions.module';
import { SessionManager } from './session-manager';
import { ImPushService } from './im-push.service';
import { FeishuChannel } from './channels/feishu/feishu.channel';
import { FeishuMessageFormatter } from './channels/feishu/feishu.formatter';

/**
 * IM 推送模块
 * 注意：不再使用 @Global()，在 AppModule 中显式导入
 */
@Module({
  imports: [SessionsModule],
  providers: [
    SessionManager,
    ImPushService,
    FeishuChannel,
    FeishuMessageFormatter,
  ],
  exports: [ImPushService], // 只导出 ImPushService，不导出 SessionManager
})
export class ImPushModule {}
