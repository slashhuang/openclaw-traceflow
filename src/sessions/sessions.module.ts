import { Module } from '@nestjs/common';
import { SessionsController } from './sessions.controller';
import { SessionsService } from './sessions.service';
import { TokenMonitorService } from './token-monitor.service';
import { TokenMonitorController } from './token-monitor.controller';
import { OpenClawModule } from '../openclaw/openclaw.module';

@Module({
  imports: [OpenClawModule],
  controllers: [SessionsController, TokenMonitorController],
  providers: [SessionsService, TokenMonitorService],
  exports: [SessionsService, TokenMonitorService],
})
export class SessionsModule {}
