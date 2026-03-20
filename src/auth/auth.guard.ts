import { Injectable, CanActivate, ExecutionContext, Logger } from '@nestjs/common';
import { ConfigService } from '../config/config.service';

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);

  constructor(private configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const config = this.configService.getConfig();
    const request = context.switchToHttp().getRequest();

    // local-only 模式：只允许本机访问
    if (config.accessMode === 'local-only') {
      const ip = request.ip || request.connection?.remoteAddress || '';
      const isLocal = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';

      if (!isLocal) {
        this.logger.warn(`Blocked non-local access from ${ip}`);
      }

      return isLocal;
    }

    // token 模式：验证 Access Token
    if (config.accessMode === 'token') {
      const authHeader = request.headers.authorization;
      const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : undefined;

      if (!token || !this.configService.validateToken(token)) {
        this.logger.warn(`Blocked unauthorized access from ${request.ip}`);
        return false;
      }

      return true;
    }

    // none 模式：允许所有访问
    return true;
  }
}
