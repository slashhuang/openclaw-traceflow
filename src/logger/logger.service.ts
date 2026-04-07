import {
  Injectable,
  LoggerService as NestLoggerService,
  LogLevel,
} from '@nestjs/common';
import winston from 'winston';
import 'winston-daily-rotate-file';
import * as path from 'path';

export interface LoggerOptions {
  dataDir: string;
  maxFiles: string; // 保留多少天的日志，如 '7d'
  level: string; // 日志级别：error, warn, info, http, verbose, debug, silly
  enableConsole: boolean;
}

const DEFAULT_OPTIONS: LoggerOptions = {
  dataDir: './data',
  maxFiles: '7d',
  level: 'info',
  enableConsole: true,
};

/**
 * Winston 日志服务
 *
 * 特性：
 * - 按天轮转日志文件
 * - 自动清理旧日志（默认保留 7 天）
 * - 支持多级别日志
 * - 可选控制台输出
 */
@Injectable()
export class WinstonLoggerService implements NestLoggerService {
  private readonly logger: winston.Logger;

  constructor(options: Partial<LoggerOptions> = {}) {
    const config = { ...DEFAULT_OPTIONS, ...options };

    // 确保数据目录存在
    const dataDir = path.resolve(config.dataDir);

    // 创建 winston logger
    this.logger = winston.createLogger({
      level: config.level,
      format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.printf(
          ({ timestamp, level, message, context, stack }) => {
            let log = `[${timestamp}] [${level.toUpperCase()}]`;
            if (context) {
              log += ` [${context}]`;
            }
            log += ` ${message}`;
            if (stack) {
              log += `\n${stack}`;
            }
            return log;
          },
        ),
      ),
      transports: [
        // 文件轮转传输 - 按天分割
        new winston.transports.DailyRotateFile({
          filename: path.join(dataDir, 'traceflow-%DATE%.log'),
          datePattern: 'YYYY-MM-DD',
          maxSize: '20m', // 单个文件最大 20MB
          maxFiles: config.maxFiles, // 保留 7 天的日志
          frequency: '1d', // 每天轮转
          auditFile: path.join(dataDir, '.traceflow-log-rotate.json'), // 轮转状态文件
          zippedArchive: false, // 不压缩旧日志（便于直接查看）
        }),
        // 错误日志单独记录
        new winston.transports.DailyRotateFile({
          filename: path.join(dataDir, 'traceflow-error-%DATE%.log'),
          datePattern: 'YYYY-MM-DD',
          maxSize: '20m',
          maxFiles: config.maxFiles,
          frequency: '1d',
          level: 'error',
          auditFile: path.join(dataDir, '.traceflow-error-log-rotate.json'),
          zippedArchive: false,
        }),
      ],
    });

    // 可选：控制台输出
    if (config.enableConsole) {
      this.logger.add(
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple(),
          ),
        }),
      );
    }
  }

  log(message: string, context?: string): void {
    this.logger.info(message, { context });
  }

  error(message: string, stack?: string, context?: string): void {
    this.logger.error(message, { context, stack });
  }

  warn(message: string, context?: string): void {
    this.logger.warn(message, { context });
  }

  debug(message: string, context?: string): void {
    this.logger.debug(message, { context });
  }

  verbose(message: string, context?: string): void {
    this.logger.verbose(message, { context });
  }

  /**
   * 获取 winston logger 实例（用于高级用法）
   */
  getLogger(): winston.Logger {
    return this.logger;
  }
}
