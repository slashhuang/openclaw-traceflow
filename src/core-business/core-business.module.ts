import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { SessionManager } from './session-manager';

/**
 * 核心业务模块（全局）
 * 提供 SessionManager 等核心服务
 */
@Module({
  imports: [EventEmitterModule], // 注意：不是 forRoot()
  providers: [SessionManager],
  exports: [SessionManager],
})
export class CoreBusinessModule {}
