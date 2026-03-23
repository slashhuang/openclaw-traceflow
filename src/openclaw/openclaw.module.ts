import { Module, Global } from '@nestjs/common';
import { OpenClawService } from './openclaw.service';
import { GatewayConnectionService } from './gateway-connection.service';

@Global()
@Module({
  providers: [OpenClawService, GatewayConnectionService],
  exports: [OpenClawService, GatewayConnectionService],
})
export class OpenClawModule {}
