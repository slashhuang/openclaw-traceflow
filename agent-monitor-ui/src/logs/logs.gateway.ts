import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { LogsService, LogEntry } from './logs.service';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: 'logs',
})
export class LogsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(private readonly logsService: LogsService) {}

  handleConnection(client: Socket) {
    console.log('Client connected:', client.id);
    this.logsService.subscribe(client.id, (log: LogEntry) => {
      client.emit('logs:new', log);
    });
  }

  handleDisconnect(client: Socket) {
    console.log('Client disconnected:', client.id);
    this.logsService.unsubscribe(client.id);
  }

  @SubscribeMessage('logs:subscribe')
  handleSubscribe(@ConnectedSocket() client: Socket) {
    console.log('Client subscribed to logs:', client.id);
  }

  @SubscribeMessage('logs:unsubscribe')
  handleUnsubscribe(@ConnectedSocket() client: Socket) {
    console.log('Client unsubscribed from logs:', client.id);
    this.logsService.unsubscribe(client.id);
  }
}
