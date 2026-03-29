import { Module, Global } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { OpenClawService } from './openclaw.service';
import { GatewayConnectionService } from './gateway-connection.service';
import { SystemPromptController } from './system-prompt.controller';

@Global()
@Module({
  providers: [OpenClawService, GatewayConnectionService, AuthGuard],
  controllers: [SystemPromptController],
  exports: [OpenClawService, GatewayConnectionService],
})
export class OpenClawModule {}
