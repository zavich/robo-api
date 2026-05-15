# Redis Runtime

## Conexao

- Modulo: `src/connection/redis.module.ts`.
- Client: ioredis com `maxRetriesPerRequest: null` (requisito BullMQ).
- URL: `REDIS_URL` env var.
- Docker: Redis 7 na porta 6381.

## Uso principal

### BullMQ

- Backend de filas para jobs assincronos.
- Filas: insert-process, process-validation, solvency-validation, extract-document, initial-petition.
- Jobs persistidos no Redis com retry e backoff.

### Bull Board

- Dashboard em `/bull-board` (non-prod).
- Visualiza estado de todas as filas.

### Health check

- `src/service/redis-health.service.ts` para verificar conectividade.
