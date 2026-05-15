# Feature: Notifications

## Quando usar

Use este mapa quando a task envolver notificacoes, WebSocket, Socket.io ou alertas real-time.

## Pontos de entrada

- `src/modules/notification/notification.controller.ts`
- `src/gateway/notifications.gateway.ts`

## Arquivos relacionados

- `src/modules/notification/services/create.service.ts`
- `src/modules/notification/services/list.service.ts`
- `src/modules/notification/services/read.service.ts`
- `src/modules/notification/services/delete.service.ts`
- `src/modules/notification/schema/notication.schema.ts`

## Fluxo resumido

1. Notificacao criada via service (trigger interno ou externo).
2. Persistida no MongoDB (collection notifications).
3. Gateway WebSocket emite evento para room do userId.
4. Frontend recebe via Socket.io e exibe notificacao.
5. Usuario pode marcar como lida ou deletar.

## Conceitos

- Tipos: ACTIVITY (atividade criada/concluida), SYSTEM_NOTIFICATION (alerta do sistema).
- Rooms: cada usuario tem uma room (userId) no Socket.io.
- Gateway: `@WebSocketGateway()` do NestJS com Socket.io.

## Riscos e cuidados

- Usuario desconectado nao recebe notificacao real-time (apenas ao reconectar e listar).
- Schema tem typo no nome do arquivo (`notication.schema.ts`).
