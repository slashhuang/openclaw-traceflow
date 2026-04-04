import { Controller, Get, Post, Param, Query } from '@nestjs/common';
import {
  SessionsService,
  Session,
  SessionDetail,
  type ListSessionsPagedOptions,
} from './sessions.service';

@Controller('api/sessions')
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  private parsePage(v: unknown, fallback: number): number {
    const n = Number.parseInt(String(v ?? ''), 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  }

  private parseCsvQuery(v: unknown): string[] | undefined {
    if (typeof v !== 'string' || !v.trim()) return undefined;
    const parts = v
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return parts.length ? parts : undefined;
  }

  @Get()
  async listSessions(
    @Query('page') pageQuery?: number,
    @Query('pageSize') pageSizeQuery?: number,
    @Query('filter') filterQuery?: string,
    @Query('agentId') agentIdQuery?: string,
    @Query('sortBy') sortByQuery?: string,
    @Query('sortOrder') sortOrderQuery?: string,
    @Query('statuses') statusesQuery?: string,
    @Query('typeLabels') typeLabelsQuery?: string,
    @Query('chatKinds') chatKindsQuery?: string,
    @Query('q') qQuery?: string,
  ): Promise<
    | Session[]
    | { items: Session[]; total: number; page: number; pageSize: number }
  > {
    const page = this.parsePage(pageQuery, 1);
    const pageSize = Math.min(200, this.parsePage(pageSizeQuery, 20));
    const filter = typeof filterQuery === 'string' ? filterQuery : 'all';
    const agentId =
      typeof agentIdQuery === 'string' ? agentIdQuery : undefined;
    if (
      pageQuery == null &&
      pageSizeQuery == null &&
      filterQuery == null &&
      agentId == null &&
      sortByQuery == null &&
      sortOrderQuery == null &&
      statusesQuery == null &&
      typeLabelsQuery == null &&
      chatKindsQuery == null &&
      qQuery == null
    ) {
      return this.sessionsService.listSessions();
    }
    const listOptions: ListSessionsPagedOptions = {
      sortBy: typeof sortByQuery === 'string' ? sortByQuery : undefined,
      sortOrder:
        sortOrderQuery === 'asc'
          ? 'asc'
          : sortOrderQuery === 'desc'
            ? 'desc'
            : undefined,
      statuses: this.parseCsvQuery(statusesQuery),
      typeLabels: this.parseCsvQuery(typeLabelsQuery),
      chatKinds: this.parseCsvQuery(chatKindsQuery),
      search: typeof qQuery === 'string' && qQuery.trim() ? qQuery : undefined,
    };
    return this.sessionsService.listSessionsPaged(
      page,
      pageSize,
      filter,
      agentId,
      listOptions,
    );
  }

  /** 静态子路径放在 :id 之前，避免被误匹配 */
  @Get('agent-overview')
  async getAgentOverview() {
    return this.sessionsService.getAgentSessionOverview();
  }

  /** 筛选统计（供前端筛选项显示计数） */
  @Get('filter-stats')
  async getFilterStats() {
    return this.sessionsService.getFilterStats();
  }

  @Get('config/models')
  async getConfiguredModels(): Promise<{
    models: string[];
    source?: string;
  } | null> {
    return this.sessionsService.getConfiguredModels();
  }

  /** 会话归档轮次（*.jsonl.reset.*），须在 @Get(':id') 之前注册 */
  @Get(':id/archive-epochs')
  async listArchiveEpochs(@Param('id') id: string) {
    return this.sessionsService.listArchiveEpochs(id);
  }

  @Get(':id')
  async getSession(
    @Param('id') id: string,
    @Query('resetTimestamp') resetTimestamp?: string,
  ): Promise<SessionDetail | null> {
    return this.sessionsService.getSessionById(id, resetTimestamp);
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
