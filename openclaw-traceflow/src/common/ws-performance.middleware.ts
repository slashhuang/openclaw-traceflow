import { Injectable, Logger } from '@nestjs/common';
import { Socket } from 'socket.io';

/**
 * WebSocket 性能监控中间件 — 覆盖所有 WebSocket 事件
 * 
 * 功能：
 * - 记录连接建立/断开
 * - 记录消息收发时间、大小
 * - 心跳检测
 * - 慢事件警告（>500ms）
 * 
 * @see PRD: docs/prd-traceflow-logging-2026-03-24.md
 */
@Injectable()
export class WsPerformanceMiddleware {
  private readonly logger = new Logger('WsPerformance');

  use(socket: Socket, next: (err?: Error) => void) {
    const clientId = socket.id;
    const connectTime = Date.now();

    // 连接建立日志
    this.logger.debug(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'DEBUG',
        module: 'WsPerformanceMiddleware',
        operation: 'ws_connect',
        clientId,
        ip: socket.handshake.address,
      }),
    );

    // 拦截 emit（服务器→客户端）— 支持异步处理
    const originalEmit = socket.emit.bind(socket);
    const self = this; // 保存 this 引用，避免 Promise 回调中丢失上下文
    
    socket.emit = function (event: string, ...args: any[]) {
      const emitStart = Date.now();
      const result = originalEmit(event, ...args);
      
      // 处理 Promise 情况（异步 emit）
      if (result instanceof Promise) {
        return result.then(res => {
          const durationMs = Date.now() - emitStart;
          const dataSize = JSON.stringify(args).length;
          
          const logData = {
            timestamp: new Date().toISOString(),
            level: durationMs > 500 ? 'WARN' : 'DEBUG',
            module: 'WsPerformanceMiddleware',
            operation: 'ws_emit',
            clientId,
            event,
            durationMs,
            dataSize,
          };

          // 慢事件警告
          if (durationMs > 500) {
            self.logger.warn(
              `Slow WS emit "${event}" to ${clientId}: ${durationMs}ms, ${dataSize}bytes`,
            );
          }

          self.logger.debug(JSON.stringify(logData));
          return res;
        }).catch(err => {
          self.logger.error(
            JSON.stringify({
              timestamp: new Date().toISOString(),
              level: 'ERROR',
              module: 'WsPerformanceMiddleware',
              operation: 'ws_emit_error',
              clientId,
              event,
              error: err.message,
            }),
          );
          throw err;
        });
      }
      
      // 同步情况
      const durationMs = Date.now() - emitStart;
      const dataSize = JSON.stringify(args).length;

      const logData = {
        timestamp: new Date().toISOString(),
        level: durationMs > 500 ? 'WARN' : 'DEBUG',
        module: 'WsPerformanceMiddleware',
        operation: 'ws_emit',
        clientId,
        event,
        durationMs,
        dataSize,
      };

      // 慢事件警告
      if (durationMs > 500) {
        self.logger.warn(
          `Slow WS emit "${event}" to ${clientId}: ${durationMs}ms, ${dataSize}bytes`,
        );
      }

      self.logger.debug(JSON.stringify(logData));
      return result;
    };

    // 监听客户端消息（客户端→服务器）
    socket.onAny((event: string, ...args: any[]) => {
      const dataSize = JSON.stringify(args).length;
      const logData = {
        timestamp: new Date().toISOString(),
        level: 'DEBUG',
        module: 'WsPerformanceMiddleware',
        operation: 'ws_receive',
        clientId,
        event,
        dataSize,
      };
      this.logger.debug(JSON.stringify(logData));
    });

    // 心跳检测（仅记录收到 ping 事件，不计算 latency）
    socket.on('ping', () => {
      const logData = {
        timestamp: new Date().toISOString(),
        level: 'DEBUG',
        module: 'WsPerformanceMiddleware',
        operation: 'ws_ping',
        clientId,
      };
      this.logger.debug(JSON.stringify(logData));
    });

    // 断开连接
    socket.on('disconnect', (reason: string) => {
      const sessionDuration = Date.now() - connectTime;
      const logData = {
        timestamp: new Date().toISOString(),
        level: 'INFO',
        module: 'WsPerformanceMiddleware',
        operation: 'ws_disconnect',
        clientId,
        reason,
        sessionDurationMs: sessionDuration,
      };
      this.logger.log(JSON.stringify(logData));
    });

    // 错误处理
    socket.on('error', (error: Error) => {
      const logData = {
        timestamp: new Date().toISOString(),
        level: 'ERROR',
        module: 'WsPerformanceMiddleware',
        operation: 'ws_error',
        clientId,
        error: error.message,
        stack: error.stack,
      };
      this.logger.error(JSON.stringify(logData));
    });

    next();
  }
}
