# Workflow: Debug Process Queue

## Quando usar

Use quando jobs na fila BullMQ estiverem presos, falhando ou nao sendo processados.

## Entradas necessarias

- Nome da fila ou tipo de job.
- ID do job se disponivel.
- Sintoma: stuck, failed, stalled.

## Passos

1. Acessar Bull Board em `/bull-board` (non-prod) para verificar status das filas.
2. Identificar jobs em estado `failed`, `stalled` ou `waiting` por muito tempo.
3. Verificar logs do worker no stdout.
4. Checar conectividade Redis (`redis-health.service.ts`).
5. Verificar payload do job (campos obrigatorios presentes).
6. Checar retry count e backoff configurado no worker.
7. Se o erro for de Vertex AI, ler `features/document-insights.md`.
8. Se o erro for de MongoDB, checar schema e conexao.
9. Atualizar brain se a causa raiz for reutilizavel.

## Arquivos comuns

- `src/modules/process/queues/process/index.ts`
- `src/modules/process/queues/process/services/`
- `src/connection/redis.module.ts`
- `src/service/redis-health.service.ts`

## Riscos

- Nao reprocessar jobs sem entender a causa da falha.
- Jobs duplicados podem causar dados inconsistentes.
