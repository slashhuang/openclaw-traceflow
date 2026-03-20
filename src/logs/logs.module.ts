import { Module } from '@nestjs/common';
import { LogsController } from './logs.controller';
import { LogsGateway } from './logs.gateway';
import { LogsService } from './logs.service';
import { ConfigModule } from '../config/config.module';

@Module({
  controllers: [LogsController],
  providers: [LogsService, LogsGateway],
  exports: [LogsService],
  imports: [ConfigModule],
})
export class LogsModule {}
