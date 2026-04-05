import { Module } from '@nestjs/common';
import { ConfigModule } from '../../config/config.module';
import { OpenClawFileWatcher } from './file-watcher.adapter';

/**
 * OpenClaw 数据源适配器模块
 * 注意：不再使用 @Global()，在 AppModule 中显式导入
 */
@Module({
  imports: [ConfigModule],
  providers: [OpenClawFileWatcher],
  exports: [OpenClawFileWatcher],
})
export class OpenClawAdapterModule {}
