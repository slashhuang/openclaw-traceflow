import { Module, Global } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ConfigModule } from '../config/config.module';
import { OpenClawFileWatcher } from './file-watcher.adapter';

/**
 * OpenClaw 数据源适配器模块
 */
@Global()
@Module({
  imports: [EventEmitterModule.forRoot(), ConfigModule],
  providers: [OpenClawFileWatcher],
  exports: [OpenClawFileWatcher],
})
export class OpenClawAdapterModule {}
