import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL
      ? process.env.FRONTEND_URL.split(',')
      : ['http://localhost:3000'],
    credentials: true,
  },
})
export class NotificationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(NotificationsGateway.name);

  // Broadcast geral
  broadcast(notification: Record<string, unknown>) {
    this.server.emit('notification', notification);
  }

  // Broadcast para usuário específico
  notificationUser(notification: Record<string, unknown>, userId: string) {
    this.server.to(userId).emit('notification', notification);
  }

  handleConnection(client: Socket) {
    const userId = client.handshake.auth.userId as string | undefined;
    if (userId) {
      client.join(userId);
    }
    this.logger.debug(`Cliente conectado: ${client.id}, userId: ${userId}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`Cliente desconectado: ${client.id}`);
  }
}
