import { Controller, Post, Param, Body } from '@nestjs/common';
import { ActionsService } from './actions.service';

@Controller('api/actions')
export class ActionsController {
  constructor(private readonly actionsService: ActionsService) {}

  @Post('restart')
  async restartGateway(): Promise<{ success: boolean; message: string }> {
    return this.actionsService.restartGateway();
  }

  @Post('kill-session/:id')
  async killSession(@Param('id') id: string): Promise<{ success: boolean; message: string }> {
    return this.actionsService.killSession(id);
  }

  @Post('update-concurrency')
  async updateConcurrency(
    @Body('maxConcurrent') maxConcurrent: number,
  ): Promise<{ success: boolean; message: string }> {
    return this.actionsService.updateConcurrency(maxConcurrent);
  }

  @Post('cleanup-logs')
  async cleanupLogs(): Promise<{ success: boolean; message: string }> {
    return this.actionsService.cleanupLogs();
  }
}
