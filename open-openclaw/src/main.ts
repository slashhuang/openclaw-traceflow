import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { LogsService } from './logs/logs.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // 启用 CORS
  app.enableCors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // 启动日志追踪
  const logsService = app.get(LogsService);
  const logPath = '/root/.pm2/logs/openclaw-gateway-out.log';
  await logsService.startTailing(logPath);

  const port = process.env.PORT || 3001;
  await app.listen(port);
  console.log(`Agent Monitor UI running on: http://localhost:${port}`);
}

bootstrap();
