import { Module, Global } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { OpenClawService } from './openclaw.service';
import { SystemPromptController } from './system-prompt.controller';

@Global()
@Module({
  providers: [OpenClawService, AuthGuard],
  controllers: [SystemPromptController],
  exports: [OpenClawService],
})
export class OpenClawModule {}
