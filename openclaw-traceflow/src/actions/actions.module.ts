import { Module } from '@nestjs/common';
import { ActionsController } from './actions.controller';
import { ActionsService } from './actions.service';
import { ConfigModule } from '../config/config.module';

@Module({
  controllers: [ActionsController],
  providers: [ActionsService],
  imports: [ConfigModule],
})
export class ActionsModule {}
