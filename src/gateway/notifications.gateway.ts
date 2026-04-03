import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: { origin: '*' },
})
export class NotificationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  // Broadcast geral
  broadcast(notification: any) {
    this.server.emit('notification', notification);
  }

  // Broadcast para usuário específico
  notificationUser(notification: any, userId: string) {
    this.server.to(userId).emit('notification', notification);
  }

  handleConnection(client: Socket) {
    const userId = client.handshake.auth.userId;
    if (userId) {
      client.join(userId); // adiciona o usuário em uma "room" com seu ID
    }
    console.log(`Cliente conectado: ${client.id}, userId: ${userId}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`Cliente desconectado: ${client.id}`);
  }
}
