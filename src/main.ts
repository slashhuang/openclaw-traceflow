import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from './config/config.service';
import { LogsService } from './logs/logs.service';
import { PerformanceLoggingInterceptor } from './common/performance-logging.interceptor';
import * as express from 'express';
import * as path from 'path';

/** 开发/watch 重启时旧进程可能尚未释放端口；短暂重试可避免 EADDRINUSE */
async function listenWithDevRetry(
  app: { listen: (port: number, host: string) => Promise<unknown> },
  port: number,
  host: string,
): Promise<void> {
  const isProd = process.env.NODE_ENV === 'production';
  /** watch 热重载时偶发需更长时间释放端口；永久占用时再多重试也无用，失败提示见下方 */
  const maxAttempts = isProd ? 1 : 40;
  const delayMs = 250;
  let lastErr: unknown;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      await app.listen(port, host);
      if (i > 0) {
        console.log(
          `[bootstrap] Port ${port} available after ${i} retry(ies).`,
        );
      }
      return;
    } catch (e: unknown) {
      lastErr = e;
      const code =
        e && typeof e === 'object' && 'code' in e
          ? (e as { code?: string }).code
          : undefined;
      const lastAttempt = i === maxAttempts - 1;
      if (code !== 'EADDRINUSE' || lastAttempt) {
        if (!isProd && code === 'EADDRINUSE' && lastAttempt) {
          console.error(`
[bootstrap] 端口 ${port} 仍被占用（已重试 ${maxAttempts} 次，约 ${(maxAttempts * delayMs) / 1000}s）。
  · 若本机已有 TraceFlow / 其它服务占用：先结束该进程，或换端口启动：
      PORT=3003 pnpm run start:dev
    前端 Vite 需指向同一后端：
      VITE_API_PROXY_TARGET=http://localhost:3003 pnpm run dev:frontend
     macOS 查看占用：lsof -nP -iTCP:${port} -sTCP:LISTEN
`);
        }
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
  // 创建 TraceFlow 日志文件输出流
  const configForLogger = new ConfigService();
  const configData = configForLogger.getConfig();
  const traceflowLogPath = path.join(configData.dataDir, 'traceflow.log');
  const { createWriteStream } = await import('fs');
  const logStream = createWriteStream(traceflowLogPath, { flags: 'a' });

  // 自定义 Logger：同时输出到控制台和文件
  class FileConsoleLogger {
    // 格式化为北京时间 (Asia/Shanghai)
    private formatTime(date: Date): string {
      return date.toLocaleString('zh-CN', {
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });
    }

    log(message: string, context?: string) {
      const timestamp = this.formatTime(new Date());
      const formatted = `[${timestamp}] [INFO] ${context ? `[${context}] ` : ''}${message}\n`;
      console.log(message, context ? `[${context}]` : '');
      logStream.write(formatted);
    }
    error(message: string, trace?: string, context?: string) {
      const timestamp = this.formatTime(new Date());
      const formatted = `[${timestamp}] [ERROR] ${context ? `[${context}] ` : ''}${message}${trace ? `\n${trace}` : ''}\n`;
      console.error(
        message,
        trace ? `\n${trace}` : '',
        context ? `[${context}]` : '',
      );
      logStream.write(formatted);
    }
    warn(message: string, context?: string) {
      const timestamp = this.formatTime(new Date());
      const formatted = `[${timestamp}] [WARN] ${context ? `[${context}] ` : ''}${message}\n`;
      console.warn(message, context ? `[${context}]` : '');
      logStream.write(formatted);
    }
    debug(message: string, context?: string) {
      const timestamp = this.formatTime(new Date());
      const formatted = `[${timestamp}] [DEBUG] ${context ? `[${context}] ` : ''}${message}\n`;
      console.debug(message, context ? `[${context}]` : '');
      logStream.write(formatted);
    }
    verbose(message: string, context?: string) {
      const timestamp = this.formatTime(new Date());
      const formatted = `[${timestamp}] [VERBOSE] ${context ? `[${context}] ` : ''}${message}\n`;
      logStream.write(formatted);
    }
  }

  const app = await NestFactory.create(AppModule, {
    logger: new FileConsoleLogger(),
  });
  app.enableShutdownHooks();

  // ========== 性能日志拦截器（100% 覆盖所有 HTTP API）==========
  app.useGlobalInterceptors(new PerformanceLoggingInterceptor());

  // 注：WebSocket 性能日志需要在 WebSocketGateway 中实现，NestJS 不支持全局 WS 中间件

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
  app.use(
    (
      req: express.Request,
      res: express.Response,
      next: express.NextFunction,
    ) => {
      // 如果是 API 路径，跳过
      if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) {
        return next();
      }
      // 返回 index.html
      res.sendFile(path.join(staticPath, 'index.html'));
    },
  );

  // 获取配置
  const configService = app.get(ConfigService);
  const config = configService.getConfig();

  // 启动日志追踪（TraceFlow 日志）
  const logsService = app.get(LogsService);
  logsService.startTailing();

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
║           OpenClaw TraceFlow UI                             ║
╠═══════════════════════════════════════════════════════════╣
║  Running on: http://${host}:${port}
║  Access Mode: ${config.accessMode}${config.accessMode === 'token' ? ' (token required)' : ''}
║                                                           ║
║  Open http://localhost:${port} in your browser           ║
╚═══════════════════════════════════════════════════════════╝
  `);
}

bootstrap();
