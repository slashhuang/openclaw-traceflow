import { Module } from '@nestjs/common';
import { LogsGateway } from './logs.gateway';
import { LogsService } from './logs.service';
import { LogsController } from './logs.controller';

@Module({
  providers: [LogsGateway, LogsService],
  controllers: [LogsController],
  exports: [LogsService],
})
export class LogsModule {}
