import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from './config/config.service';
import { LogsService } from './logs/logs.service';
import * as express from 'express';
import * as path from 'path';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

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

  // 启动日志追踪
  const logsService = app.get(LogsService);

  // 尝试启动日志追踪（如果日志文件存在）
  try {
    await logsService.startTailing(config.openclawLogPath);
    if (config.openclawLogPath) {
      console.log(`Started tailing logs from: ${config.openclawLogPath}`);
    }
  } catch (error) {
    console.warn(`Failed to start log tailing: ${error}. Logs will be available when OpenClaw is running.`);
  }

  // 监听配置的主机/端口
  const port = config.port;
  const host = config.host;

  await app.listen(port, host);

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
