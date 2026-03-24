import { Module } from '@nestjs/common';
import { SetupController } from './setup.controller';

@Module({
  controllers: [SetupController],
})
export class SetupModule {}
