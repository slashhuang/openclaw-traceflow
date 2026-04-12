import { Injectable } from '@nestjs/common';

@Injectable()
export class HealthService {
  getUptimeSec(): number {
    return Math.round(process.uptime());
  }
}
