import { Module, Global } from '@nestjs/common';
import { OpenClawService } from './openclaw.service';
import { GatewayConnectionService } from './gateway-connection.service';
import { SystemPromptController } from './system-prompt.controller';

@Global()
@Module({
  providers: [OpenClawService, GatewayConnectionService],
  controllers: [SystemPromptController],
  exports: [OpenClawService, GatewayConnectionService],
})
export class OpenClawModule {}
