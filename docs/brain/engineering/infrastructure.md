# Infrastructure

## MongoDB / Mongoose

- Conexao via `src/database/database.module.ts`.
- Connection string: `DATABASE_URL` env var.
- 13 schemas Mongoose (ver `data-model.md`).

## BullMQ / Redis

- Conexao Redis via `src/connection/redis.module.ts` (ioredis, maxRetriesPerRequest: null).
- Filas: insert-process, process-validation, solvency-validation, extract-document, initial-petition.
- Bull Board: `/bull-board` (non-prod only).
- Redis URL: `REDIS_URL` env var.

## WebSocket / Socket.io

- Gateway: `src/gateway/notifications.gateway.ts`.
- Auth: userId via handshake.
- Rooms: uma por userId.
- Ver `runtime/websocket.md`.

## AWS

- S3: upload de documentos, signed URLs. Bucket via `AWS_S3_BUCKET_NAME`.
- SES: envio de email.
- SNS: envio de SMS.
- Secrets Manager: credenciais.
- Service: `src/service/aws/aws.service.ts`.

## Google Vertex AI

- Service: `src/service/vertex/vertex-AI.service.ts`.
- Modelo: `GOOGLE_VERTEX_MODEL` (Gemini).
- Retry com backoff exponencial para 429.
- Credenciais: `GOOGLE_PROJECT_ID`, `GOOGLE_CLIENT_EMAIL`, `GOOGLE_PRIVATE_KEY`.

## Pipedrive

- Client: `src/service/pipedrive/` (deals, activities, notes, stages, custom fields).
- Comunicacao via Axios.

## Docker

- Dockerfile multi-stage: Node 18-Alpine.
- Build: `npm ci` + `npm run build`.
- Runtime: `node dist/src/main.js`.
- Docker Compose: Redis 7 (porta 6381) + NestJS app (porta 8080).
- Traefik como reverse proxy.

## ECS (AWS)

- Deployment via GitHub Actions.
- `task-definition.json` e mantido como template anonimo com placeholders.
- Renderizacao do template: `yarn render:task-definition [arquivo-destino]`.
- Placeholders obrigatorios atuais: `TASK_FAMILY`, `AWS_ACCOUNT_ID`, `AWS_REGION`, `IMAGE_NAME`, `IMAGE_TAG`, `EXECUTION_ROLE`, `TASK_ROLE`, `SECRET_NAME`, `SERVICE_NAME`.

## Swagger

- Disponivel em `/api`.
- Bearer token auth documentado.
