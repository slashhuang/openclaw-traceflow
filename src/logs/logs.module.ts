import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { LogsController } from './logs.controller';
import { LogsService } from './logs.service';
import { ConfigModule } from '../config/config.module';

@Module({
  controllers: [LogsController],
  providers: [LogsService],
  exports: [LogsService],
  imports: [ConfigModule, EventEmitterModule.forRoot()],
})
export class LogsModule {}
