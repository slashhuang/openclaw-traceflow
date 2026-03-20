import { Controller, Get, Post, Param, Body } from '@nestjs/common';
import { SessionsService, Session, SessionDetail } from './sessions.service';

@Controller('api/sessions')
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Get()
  async listSessions(): Promise<Session[]> {
    return this.sessionsService.listSessions();
  }

  @Get(':id')
  async getSession(@Param('id') id: string): Promise<SessionDetail | null> {
    return this.sessionsService.getSessionById(id);
  }

  @Get(':id/status')
  async getSessionStatus(
    @Param('id') id: string,
  ): Promise<{ status: 'active' | 'idle' | 'completed' | 'failed' }> {
    const status = await this.sessionsService.getSessionStatus(id);
    return { status };
  }

  @Post(':id/kill')
  async killSession(@Param('id') id: string): Promise<{ success: boolean }> {
    const success = await this.sessionsService.killSession(id);
    return { success };
  }

  @Get('config/models')
  async getConfiguredModels(): Promise<{ models: string[]; source?: string } | null> {
    return this.sessionsService.getConfiguredModels();
  }
}
