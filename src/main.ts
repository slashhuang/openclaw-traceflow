import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from './config/config.service';
import { LogsService } from './logs/logs.service';
import * as express from 'express';
import * as path from 'path';

/** 开发/watch 重启时旧进程可能尚未释放端口；短暂重试可避免 EADDRINUSE */
async function listenWithDevRetry(
  app: { listen: (port: number, host: string) => Promise<unknown> },
  port: number,
  host: string,
): Promise<void> {
  const isProd = process.env.NODE_ENV === 'production';
  const maxAttempts = isProd ? 1 : 15;
  const delayMs = 200;
  let lastErr: unknown;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      await app.listen(port, host);
      if (i > 0) {
        console.log(`[bootstrap] Port ${port} available after ${i} retry(ies).`);
      }
      return;
    } catch (e: unknown) {
      lastErr = e;
      const code =
        e && typeof e === 'object' && 'code' in e
          ? (e as { code?: string }).code
          : undefined;
      if (code !== 'EADDRINUSE' || i === maxAttempts - 1) {
        throw e;
      }
      console.warn(
        `[bootstrap] Port ${port} busy (hot reload?), retry ${i + 1}/${maxAttempts} in ${delayMs}ms...`,
      );
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();

  // 启用 CORS
  app.enableCors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // 配置静态资源服务 - 服务前端构建产物
  const staticPath = path.join(process.cwd(), 'public', 'app');
  app.use(express.static(staticPath));

  // 添加 SPA 回退路由 - 所有非 API 路径都返回 index.html
  app.use((req, res, next) => {
    // 如果是 API 路径，跳过
    if (req.path.startsWith('/api')) {
      return next();
    }
    // 返回 index.html
    res.sendFile(path.join(staticPath, 'index.html'));
  });

  // 获取配置
  const configService = app.get(ConfigService);
  const config = configService.getConfig();

  // 启动日志追踪（弱依赖，静默失败）
  const logsService = app.get(LogsService);
  logsService.startTailing(config.openclawLogPath);

  // 监听配置的主机/端口
  const port = config.port;
  const host = config.host;

  const shutdown = async () => {
    try {
      await app.close();
    } catch {
      /* ignore */
    }
    process.exit(0);
  };
  process.once('SIGTERM', () => void shutdown());
  process.once('SIGINT', () => void shutdown());

  await listenWithDevRetry(app, port, host);

  console.log(`
╔═══════════════════════════════════════════════════════════╗
║           OpenClaw Monitor UI                             ║
╠═══════════════════════════════════════════════════════════╣
║  Running on: http://${host}:${port}
║  Gateway URL: ${config.openclawGatewayUrl}
║  Access Mode: ${config.accessMode}${config.accessMode === 'token' ? ' (token required)' : ''}
║                                                           ║
║  Open http://localhost:${port} in your browser           ║
╚═══════════════════════════════════════════════════════════╝
  `);
}

bootstrap();
