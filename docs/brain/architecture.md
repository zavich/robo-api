# Architecture Map

## Estado

Documento inicial. Deve evoluir a partir de investigacoes confirmadas no codigo.

## Stack observada

- NestJS 10.
- TypeScript.
- MongoDB / Mongoose.
- BullMQ (filas).
- Redis / ioredis.
- Socket.io (WebSocket).
- Passport / JWT.
- Axios.
- Zod (validacao de env).
- Google Vertex AI (Gemini).
- AWS SDK v3 (S3, SES, SNS, Secrets Manager).
- xlsx, pdf-lib, marked, dayjs.
- Bull Board (visualizacao de filas).
- Swagger (@nestjs/swagger).

## Bootstrap e modulos

- `src/main.ts` carrega `AppModule`, configura Swagger em `/api`, habilita CORS e Bull Board (non-prod).
- `src/app.module.ts` importa DatabaseModule, RedisModule, todos os feature modules e service modules.
- `src/database/database.module.ts` configura conexao MongoDB via Mongoose.
- `src/connection/redis.module.ts` configura conexao Redis para BullMQ.
- API prefix: `/v1`.
- Porta: 8080 (configuravel via `PORT`).

## Diretorios principais

- `src/modules/`: feature modules (authentication, company, notification, observation, pipedrive, process, prompts, reason-loss, steps, user).
- `src/service/`: services compartilhados (aws, brapi, next-steps, pipedrive, vertex, redis-health).
- `src/gateway/`: WebSocket gateway para notificacoes.
- `src/config/`: configuracao de ambiente com Zod.
- `src/infra/`: configuracao de producao e secrets.
- `src/guards/`: API Key guard.
- `src/utils/`: utilitarios (datas, formatacao, arquivos, strings, sleep).

## Estrutura de modulo

Cada module segue o padrao:

```
module/
  {module}.controller.ts
  {module}.module.ts
  dto/
  schema/
  services/
  enums/ (opcional)
  interfaces/ (opcional)
  queues/ (opcional)
  crons/ (opcional)
  mock/ (opcional)
```

## Infraestrutura transversal

- MongoDB via Mongoose com 13 schemas.
- BullMQ para filas com Redis como backend.
- Bull Board em `/bull-board` (non-prod) para visualizacao.
- Socket.io gateway com rooms por userId.
- JWT auth com Passport e API Key guard.
- AWS S3 para storage, SES para email, SNS para SMS.
- Vertex AI (Gemini) para analise de documentos.
- Zod para validacao de variaveis de ambiente.

## Fronteiras confirmadas

- `process` e o modulo central, concentra CRUD, filas, atividades, documentos e metricas.
- `authentication` e `user` gerenciam identidade e acesso.
- `company` gerencia dados de empresa com integracao XLSX e SharePoint.
- `notification` gerencia alertas real-time via WebSocket.
- `service/` contem integracao com AWS, Pipedrive, BraAPI e Vertex AI.

## Pendencias de mapeamento

- Detalhar service de next-steps conforme tasks.
- Aprofundar integracao BraAPI e SharePoint quando forem foco.
