import { Controller, Get } from '@nestjs/common';
import { HealthService, HealthStatus } from './health.service';
import { OpenClawService } from '../openclaw/openclaw.service';

@Controller('api/health')
export class HealthController {
  constructor(
    private readonly healthService: HealthService,
    private readonly openclawService: OpenClawService,
  ) {}

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
    const overview = await this.openclawService.getStatusOverview();
    return overview ?? { error: 'Gateway 未连接或不可用' };
  }
}
