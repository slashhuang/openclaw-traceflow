import { Module, Global } from '@nestjs/common';
import { OpenClawService } from './openclaw.service';

@Global()
@Module({
  providers: [OpenClawService],
  exports: [OpenClawService],
})
export class OpenClawModule {}
