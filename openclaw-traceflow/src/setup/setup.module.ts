import { Module } from '@nestjs/common';
import { SetupController } from './setup.controller';
import { SkillsModule } from '../skills/skills.module';

@Module({
  imports: [SkillsModule],
  controllers: [SetupController],
})
export class SetupModule {}
