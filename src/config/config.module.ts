import { Module, Global, forwardRef } from '@nestjs/common';
import { ConfigService } from './config.service';
import { OnboardingModule } from '../onboarding/onboarding.module';

@Global()
@Module({
  providers: [ConfigService],
  exports: [ConfigService],
  imports: [forwardRef(() => OnboardingModule)],
})
export class ConfigModule {}
