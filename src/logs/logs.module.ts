import { Module } from '@nestjs/common';
import { LogsController } from './logs.controller';
import { LogsService } from './logs.service';
import { ConfigModule } from '../config/config.module';

@Module({
  controllers: [LogsController],
  providers: [LogsService],
  exports: [LogsService],
  imports: [ConfigModule],
})
export class LogsModule {}
