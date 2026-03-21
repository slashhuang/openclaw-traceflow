import { Controller, Get, Post, Param, Query } from '@nestjs/common';
import { SessionsService, Session, SessionDetail } from './sessions.service';

@Controller('api/sessions')
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  private parsePage(v: unknown, fallback: number): number {
    const n = Number.parseInt(String(v ?? ''), 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  }

  @Get()
  async listSessions(
    @Query('page') pageQuery?: number,
    @Query('pageSize') pageSizeQuery?: number,
    @Query('filter') filterQuery?: string,
  ): Promise<Session[] | { items: Session[]; total: number; page: number; pageSize: number }> {
    const page = this.parsePage(pageQuery, 1);
    const pageSize = Math.min(200, this.parsePage(pageSizeQuery, 20));
    const filter = typeof filterQuery === 'string' ? filterQuery : 'all';
    if (pageQuery == null && pageSizeQuery == null && filterQuery == null) {
      return this.sessionsService.listSessions();
    }
    return this.sessionsService.listSessionsPaged(page, pageSize, filter);
  }

  /** 静态子路径放在 :id 之前，避免被误匹配 */
  @Get('config/models')
  async getConfiguredModels(): Promise<{ models: string[]; source?: string } | null> {
    return this.sessionsService.getConfiguredModels();
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
}
