import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import type { Server, Socket } from 'socket.io';
import { LogsService, type LogEntry } from './logs.service';

type LogsSubscribePayload = {
  limit?: number;
};

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class LogsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  private readonly server!: Server;

  private readonly logger = new Logger(LogsGateway.name);
  private cleanupByClientId = new Map<string, () => void>();

  constructor(private readonly logsService: LogsService) {}

  handleConnection(client: Socket): void {
    this.logger.debug(`client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket): void {
    const cleanup = this.cleanupByClientId.get(client.id);
    cleanup?.();
    this.cleanupByClientId.delete(client.id);
    this.logger.debug(`client disconnected: ${client.id}`);
  }

  @SubscribeMessage('logs:subscribe')
  async onSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload?: LogsSubscribePayload,
  ): Promise<void> {
    const existingCleanup = this.cleanupByClientId.get(client.id);
    if (existingCleanup) {
      return;
    }

    const limit = payload?.limit;
    const stop = this.logsService.subscribeGatewayLogs(
      (entry: LogEntry) => {
        // Send to this specific client only
        this.server.to(client.id).emit('logs:new', entry);
      },
      { limit },
    );

    this.cleanupByClientId.set(client.id, stop);
  }

  @SubscribeMessage('logs:unsubscribe')
  async onUnsubscribe(@ConnectedSocket() client: Socket): Promise<void> {
    const cleanup = this.cleanupByClientId.get(client.id);
    cleanup?.();
    this.cleanupByClientId.delete(client.id);
  }
}

