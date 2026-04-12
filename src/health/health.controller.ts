import { Controller, Get } from '@nestjs/common';
import { HealthService } from './health.service';
import { ConfigService } from '../config/config.service';

@Controller('api/health')
export class HealthController {
  constructor(
    private readonly healthService: HealthService,
    private readonly configService: ConfigService,
  ) {}

  @Get()
  getHealth() {
    const config = this.configService.getConfig();
    return {
      uptimeSec: this.healthService.getUptimeSec(),
      stateDir: config.openclawStateDir?.trim() || null,
      workspaceDir: config.openclawWorkspaceDir?.trim() || null,
    };
  }
}
