import { Controller, Get, Header } from '@nestjs/common';
import { HealthService, HealthStatus } from './health.service';
import { OpenClawService } from '../openclaw/openclaw.service';

/** 轻量探活（如负载均衡 health check）：不做 Gateway 连接，响应极快 */
@Controller('api/health')
export class HealthController {
  constructor(
    private readonly healthService: HealthService,
    private readonly openclawService: OpenClawService,
  ) {}

  @Get('live')
  @Header('Cache-Control', 'no-store')
  getLive(): { ok: true; uptimeSec: number } {
    return { ok: true, uptimeSec: Math.round(process.uptime()) };
  }

  @Get()
  async getHealth(): Promise<HealthStatus> {
    return this.healthService.getHealthStatus();
  }
}

@Controller('api')
export class StatusController {
  constructor(private readonly openclawService: OpenClawService) {}

  @Get('status')
  async getStatus() {
    const paths = await this.openclawService.getResolvedPaths();
    return {
      stateDir: paths.stateDir,
      configPath: paths.configPath,
      workspaceDir: paths.workspaceDir,
      source: paths.source,
    };
  }
}
