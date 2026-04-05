import { Module, Global } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { SessionsModule } from '../sessions/sessions.module';
import { SessionManager } from './session-manager';
import { ImPushService } from './im-push.service';
import { FeishuChannel } from './channels/feishu/feishu.channel';
import { FeishuMessageFormatter } from './channels/feishu/feishu.formatter';

/**
 * IM 推送模块
 */
@Global()
@Module({
  imports: [EventEmitterModule.forRoot(), SessionsModule],
  providers: [
    SessionManager,
    ImPushService,
    FeishuChannel,
    FeishuMessageFormatter,
  ],
  exports: [SessionManager, ImPushService],
})
export class ImPushModule {}
