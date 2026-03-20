/**
 * Storage 模块
 * 
 * 提供会话存储抽象层的依赖注入
 */

import { Module, Global } from '@nestjs/common';
import { FileSystemSessionStorage, type SessionStorage } from './session-storage';

@Global()
@Module({
  providers: [
    {
      provide: 'SessionStorage',
      useClass: FileSystemSessionStorage,
    },
  ],
  exports: ['SessionStorage'],
})
export class StorageModule {}
