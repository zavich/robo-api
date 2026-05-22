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
    origin: (process.env.CORS_ORIGINS || process.env.FRONTEND_URL)
      ? (process.env.CORS_ORIGINS || process.env.FRONTEND_URL)!
          .split(',')
          .map((origin) => origin.trim())
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

  // Notifica todos os clientes sobre atualização de processo
  processUpdated(processNumber: string) {
    this.server.emit('process:updated', { number: processNumber });
    this.logger.debug(`Emitido process:updated para ${processNumber}`);
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
