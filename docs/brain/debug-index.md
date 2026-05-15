# Debug Index

Use este indice quando a task vier como sintoma operacional.

## Job preso na fila ou nao processa

Leia:

- `features/process-queue.md`
- `engineering/infrastructure.md`

Checar:

- Bull Board em `/bull-board` (non-prod) para status dos jobs.
- Redis conectividade.
- Worker registrado no module.
- Payload do job (pode ter campo faltando).
- Retry count e backoff configurado.
- Se ha jobs em estado `failed` ou `stalled`.

## Validacao de solvencia incorreta

Leia:

- `features/process-queue.md`
- `features/process-management.md`

Checar:

- `src/modules/process/queues/process/services/solvency-validation.service.ts`.
- Dados da empresa no schema Company.
- Se empresa foi buscada e persistida corretamente.
- Se o campo `specialRule` (solvente/insolvente) esta correto.

## Notificacao nao entregue

Leia:

- `features/notifications.md`
- `runtime/websocket.md`

Checar:

- WebSocket gateway em `src/gateway/notifications.gateway.ts`.
- Se o usuario esta conectado (room por userId).
- Se a notificacao foi criada no banco (collection notifications).
- Tipo da notificacao (ACTIVITY, SYSTEM_NOTIFICATION).

## Vertex AI retorna erro ou JSON invalido

Leia:

- `features/document-insights.md`
- `engineering/infrastructure.md`

Checar:

- `src/service/vertex/vertex-AI.service.ts`.
- Se o modelo Gemini esta configurado (`GOOGLE_VERTEX_MODEL`).
- Se as credenciais Google estao corretas.
- Rate limit (429) e retry com backoff exponencial.
- Se o JSON retornado foi parseado corretamente.
- Se o arquivo PDF esta acessivel no S3.

## Pipedrive diverge do banco

Leia:

- `features/pipedrive-integration.md`
- `features/process-management.md`

Checar:

- `src/modules/process/services/webhook-pipedrive.service.ts`.
- `src/service/pipedrive/` (client de deals, stages, notes).
- Se o webhook do Pipedrive esta configurado e acessivel.
- Se o dealId esta correto.

## Auth falha ou token invalido

Leia:

- `features/auth-users.md`

Checar:

- `src/modules/authentication/guards/jwt-strategy.guard.ts`.
- `JWT_SECRET_KEY` e `JWT_EXPIRES_IN` no env.
- Se o token nao expirou.
- Se o header Authorization esta presente.

## Cron de revalidacao nao executa

Leia:

- `features/process-management.md`

Checar:

- `src/modules/process/crons/loss-revalidation.cron.ts`.
- Se `@nestjs/schedule` esta importado no module.
- Se o cron esta decorado com `@Cron()`.
- Logs do cron no stdout.
