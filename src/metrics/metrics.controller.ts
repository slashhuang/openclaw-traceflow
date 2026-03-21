import { Controller, Get, Query } from '@nestjs/common';
import {
  MetricsService,
  LatencyMetrics,
  TokenSummaryMetrics,
  TokenUsageBySession,
  TokenUsageBySessionKey,
} from './metrics.service';
import { OpenClawService } from '../openclaw/openclaw.service';
import { inferInvokedSkillsFromToolCalls } from '../skill-invocation';

@Controller('api/metrics')
export class MetricsController {
  constructor(
    private readonly metricsService: MetricsService,
    private readonly openclawService: OpenClawService,
  ) {}

  @Get('latency')
  async getLatencyMetrics(
    @Query('timeRangeMs') timeRangeMs?: number,
  ): Promise<LatencyMetrics> {
    return this.metricsService.getLatencyMetrics(timeRangeMs ? parseInt(timeRangeMs.toString(), 10) : 3600000);
  }

  @Get('tools')
  async getToolStats(@Query('timeRangeMs') timeRangeMs?: number) {
    const range = timeRangeMs ? parseInt(timeRangeMs.toString(), 10) : 3600000;
    // 从 OpenClaw sessions 数据中实时提取工具调用统计 + read→SKILL.md 反推的 Skills
    try {
      const sessions = await this.openclawService.listSessions();
      const toolStats = new Map<string, { count: number; success: number }>();
      const skillStats = new Map<string, number>();

      for (const session of sessions) {
        const detail = await this.openclawService.getSessionDetail(session.sessionId);
        if (detail?.toolCalls) {
          for (const tool of detail.toolCalls) {
            const name = tool.name;
            if (!toolStats.has(name)) {
              toolStats.set(name, { count: 0, success: 0 });
            }
            const stats = toolStats.get(name)!;
            stats.count++;
            if (tool.success) stats.success++;
          }
          for (const { skillName, readCount } of inferInvokedSkillsFromToolCalls(detail.toolCalls)) {
            skillStats.set(skillName, (skillStats.get(skillName) ?? 0) + readCount);
          }
        }
      }

      const tools = Array.from(toolStats.entries())
        .map(([tool, data]) => ({
          tool,
          count: data.count,
          successRate: data.count > 0 ? (data.success / data.count) * 100 : 0,
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      const skills = Array.from(skillStats.entries())
        .map(([skill, count]) => ({ skill, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      return { tools, skills };
    } catch (error) {
      console.error('Failed to get tool stats from sessions:', error);
      const tools = await this.metricsService.getToolStats(range);
      return { tools: tools.slice(0, 5), skills: [] };
    }
  }

  @Get('concurrency')
  async getConcurrencyMetrics() {
    // TODO: 从 OpenClaw 获取并发数据
    return {
      currentConcurrent: 1,
      maxConcurrent: 10,
      queueLength: 0,
      activeSessions: 2,
    };
  }

  @Get('session-keys')
  async getSessionKeyStats(@Query('timeRangeMs') timeRangeMs?: number) {
    // TODO: 实现 Session Key 统计
    return [
      { sessionKey: 'calm-lagoon', requestCount: 15, avgDurationMs: 1200 },
      { sessionKey: 'tidal-bloom', requestCount: 8, avgDurationMs: 950 },
    ];
  }

  @Get('token-summary')
  async getTokenSummary(
    @Query('timeRangeMs') timeRangeMs?: number,
  ): Promise<TokenSummaryMetrics> {
    return this.metricsService.getTokenSummary(timeRangeMs ? parseInt(timeRangeMs.toString(), 10) : 86400000);
  }

  @Get('token-usage')
  async getTokenUsageBySession(
    @Query('timeRangeMs') timeRangeMs?: number,
  ): Promise<TokenUsageBySession[]> {
    return this.metricsService.getTokenUsageBySession(timeRangeMs ? parseInt(timeRangeMs.toString(), 10) : 86400000);
  }

  /** 按 sessionKey 聚合的 token 消耗（进行中 + 归档） */
  @Get('token-usage-by-session-key')
  async getTokenUsageBySessionKey(
    @Query('timeRangeMs') timeRangeMs?: number,
  ): Promise<TokenUsageBySessionKey[]> {
    return this.metricsService.getTokenUsageBySessionKey(
      timeRangeMs ? parseInt(timeRangeMs.toString(), 10) : 86400000,
    );
  }

  /** 每个 sessionKey 的归档次数（用于 sessions 列表） */
  @Get('archive-count-by-session-key')
  async getArchiveCountBySessionKey(): Promise<Record<string, number>> {
    return this.metricsService.getArchivedCountBySessionKey();
  }

  @Get('subagents')
  async getSubagentStats(@Query('timeRangeMs') timeRangeMs?: number) {
    // TODO: 实现子 Agent 统计
    return {
      totalSpawned: 5,
      successRate: 100,
      avgDurationMs: 3500,
    };
  }
}
