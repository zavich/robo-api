# WebSocket Runtime

## Gateway

- Arquivo: `src/gateway/notifications.gateway.ts`.
- Tecnologia: Socket.io via `@nestjs/websockets`.
- Transport: WebSocket.

## Autenticacao

- userId passado via `socket.handshake.auth.userId`.
- Cada usuario entra em uma room com seu userId.

## Eventos

- `notification`: emitido para room do usuario quando notificacao e criada.

## Lifecycle

- `handleConnection`: usuario entra na room.
- `handleDisconnect`: usuario sai da room.

## Integracao

- `NotificationCreateService` chama gateway para emitir evento apos persistir notificacao.
- Frontend conecta via socket.io-client e escuta evento `notification`.
