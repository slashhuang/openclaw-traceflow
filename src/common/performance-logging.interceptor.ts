import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

/**
 * 性能日志拦截器 — 统一拦截所有 HTTP REST API
 * 
 * 功能：
 * - 记录每个 API 请求的总耗时
 * - 慢查询警告（>1s）
 * - 结构化日志输出（JSON 格式）
 * 
 * @see PRD: docs/prd-traceflow-logging-2026-03-24.md
 */
@Injectable()
export class PerformanceLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('PerformanceLogger');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const startTime = Date.now();
    const requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    
    // 请求开始日志
    this.logger.debug(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'DEBUG',
        module: 'PerformanceLoggingInterceptor',
        operation: 'http_request_start',
        requestId,
        method: request.method,
        url: request.url,
        ip: request.ip,
        userAgent: request.headers['user-agent'],
      }),
    );

    return next.handle().pipe(
      // 成功响应
      tap(() => {
        const durationMs = Date.now() - startTime;
        const statusCode = response.statusCode;
        
        // 请求结束日志
        const logData: any = {
          timestamp: new Date().toISOString(),
          level: durationMs > 1000 ? 'WARN' : 'DEBUG',
          module: 'PerformanceLoggingInterceptor',
          operation: 'http_request_end',
          requestId,
          method: request.method,
          url: request.url,
          statusCode,
          durationMs,
        };

        // 慢查询警告
        if (durationMs > 1000) {
          this.logger.warn(
            `Slow API: ${request.method} ${request.url} - ${durationMs}ms (status: ${statusCode})`,
          );
        }

        this.logger.debug(JSON.stringify(logData));
      }),
      // 错误处理
      tap({
        error: (error) => {
          const durationMs = Date.now() - startTime;
          const logData = {
            timestamp: new Date().toISOString(),
            level: 'ERROR',
            module: 'PerformanceLoggingInterceptor',
            operation: 'http_request_error',
            requestId,
            method: request.method,
            url: request.url,
            durationMs,
            error: error.message,
            stack: error.stack,
          };
          this.logger.error(JSON.stringify(logData));
        },
      }),
    );
  }
}
