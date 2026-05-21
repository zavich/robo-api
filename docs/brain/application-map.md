# Application Map

## Estado

Documento inicial de scan geral. Mapas detalhados de feature ficam em `features/`.

## Modulos

### Process (modulo central)

`src/modules/process/` - maior modulo do sistema.

- Controller: CRUD de processos, webhooks, atividades, documentos, metricas, bulk.
- Queues/Workers (BullMQ): insert-process, process-validation, solvency-validation, extract-document, initial-petition.
- Crons: loss-revalidation (revalidacao diaria de processos LOSS com RISCO_TESE ou RISCO_PRAZO).
- Services: create-process, webhook, webhook-pipedrive, lawsuit (find, list, update), activity (create, complete, change-assigned, update-notes), documents (find-insights, find-one, delete-insights), counters, mark-as-read, run-lawsuit-validation, insert-execution, change-stage, remove-provisional-lawsuit-number, bulk-update, loss-reasons, saved-movements, metrics, upload-xlsx.
- Schemas: Process, ProcessStatus, ProcessDecisions, ProcessOwner, ClaimedProcesses, Complainant, Company, Step, Prompt.

### Authentication

`src/modules/authentication/` - autenticacao JWT e API Key.

- Controller: login, signup.
- Guards: JwtStrategy, ApiKeyAuth.
- Services: login, signup.

### Company

`src/modules/company/` - gestao de empresas.

- Controller: CRUD, webhooks, upload XLSX.
- Services: list, find, upload-xlsx, webhook, update, sharepoint.

### Notification

`src/modules/notification/` - notificacoes real-time.

- Controller: CRUD de notificacoes.
- Schema: Notification (tipo: ACTIVITY, SYSTEM_NOTIFICATION).
- Services: create, list, read, delete.
- Gateway: `src/gateway/notifications.gateway.ts` (Socket.io).

### Pipedrive

`src/modules/pipedrive/` - integracao CRM.

- Controller: adicionar notas.
- Services: add-notes.

### User

`src/modules/user/` - gestao de usuarios.

- Controller: listagem, update.
- Schema: User (email, password legado, role, isActive, name).

### Prompts

`src/modules/prompts/` - gestao de prompts AI.

- Controller: CRUD de prompts.
- Services: list, update, delete.

### Reason Loss

`src/modules/reason-loss/` - motivos de rejeicao.

- Controller: CRUD.
- Schema: ReasonLoss.

### Steps

`src/modules/steps/` - esteiras de workflow.

- Controller: listagem.

### Observation

`src/modules/observation/` - observacoes em processos.

- Controller: CRUD.
- Schema: Observation.

## Services compartilhados

- `src/service/aws/`: S3 (upload, signed URLs), SES (email), SNS (SMS), Secrets Manager.
- `src/service/brapi/`: integracao com API brasileira de dados judiciais.
- `src/service/next-steps/`: service de proximos passos.
- `src/service/pipedrive/`: client Pipedrive (deals, activities, notes, stages, custom fields).
- `src/service/vertex/`: Vertex AI/Gemini (analise de documentos com retry e rate-limit handling).
- `src/service/redis-health.service.ts`: health check do Redis.

## Endpoints principais

- `GET /health`: health check.
- `POST /v1/auth/login`: login.
- `POST /v1/auth/signup`: signup.
- `GET/POST/PATCH /v1/process`: CRUD de processos.
- `GET/POST/PATCH/DELETE /v1/notification`: notificacoes.
- `GET/PATCH /v1/user`: usuarios.
- `GET/POST/PATCH/DELETE /v1/company`: empresas.
- `GET/PATCH/DELETE /v1/prompts`: prompts AI.
- `GET/POST/PATCH/DELETE /v1/reason-refusal`: motivos de rejeicao.
- `GET /v1/steps`: esteiras.
