# Task Router

Use este roteador apos ler `INDEX.md` para carregar o menor conjunto inicial de contexto.

## Sintomas operacionais

| Termos da task | Ler primeiro | Depois carregar |
|---|---|---|
| `fila`, `queue`, `BullMQ`, `worker`, `job`, `stuck` | `workflows/debug-process-queue.md` | `features/process-queue.md`, `runtime/redis.md` |
| `solvencia`, `empresa`, `insolvente`, `solvente` | `features/process-queue.md` | `features/process-management.md` |
| `Vertex`, `Gemini`, `AI`, `insight`, `prompt`, `extracao` | `features/document-insights.md` | `engineering/infrastructure.md` |
| `Pipedrive`, `deal`, `nota`, `stage`, `webhook` | `features/pipedrive-integration.md` | `features/process-management.md` |
| `notificacao`, `socket`, `WebSocket`, `real-time` | `features/notifications.md` | `runtime/websocket.md` |
| `login`, `JWT`, `auth`, `token`, `guard` | `features/auth-users.md` | `engineering/infrastructure.md` |
| `processo`, `CRUD`, `stage`, `atividade`, `bulk` | `features/process-management.md` | `features/process-queue.md` |
| `cron`, `revalidacao`, `LOSS`, `RISCO` | `features/process-management.md` | `debug-index.md` |
| `MongoDB`, `schema`, `Mongoose`, `migration` | `engineering/data-model.md` | `engineering/conventions.md` |
| `Docker`, `ECS`, `deploy`, `CI/CD` | `engineering/infrastructure.md` | `architecture.md` |
| `S3`, `SES`, `SNS`, `AWS` | `engineering/infrastructure.md` | `features/document-insights.md` |

## Mudancas de comportamento

| Mudanca | Ler primeiro | Testes provaveis |
|---|---|---|
| Novo campo no schema | `engineering/data-model.md` | Verificar DTOs, services e controller |
| Nova fila/worker | `features/process-queue.md` | Worker spec e integracao |
| Nova regra de validacao | `features/process-queue.md` | Spec de validation service |
| Novo endpoint | `engineering/conventions.md` | E2E e controller spec |
| Mudanca em Vertex AI | `features/document-insights.md` | Mock de provider e parsing |

## Quando nao houver rota clara

Use `workflows/investigacao-progressiva.md` e crie um mapa em `features/` se a area tiver controller e logica de negocio propria.
