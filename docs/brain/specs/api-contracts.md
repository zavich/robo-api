# API Contracts

## Base

- Framework: NestJS 10
- Prefixo global: `/v1`
- CORS origins (base, prod): `https://scraping-api.juri.capital`, `https://painel-robo.juri.capital`, `https://app.juri.capital` (SSO). `credentials: true`. Override por `CORS_ORIGINS`; `localhost`+`CORS_EXTRA_ORIGINS` só em `NODE_ENV=local`
- Cookie parser ativo. Body parser limit: 50MB
- Swagger UI: `/api`
- Bull Board: `/bull-board` (apenas nao-production)
- Porta: `process.env.PORT` (default 3333)

---

## Health

### GET /health

- **Auth**: nenhuma (sem prefixo `/v1`)
- **Throttle**: `@SkipThrottle()`
- **Response**:
  ```typescript
  {
    status: 'ok',
    checks: { mongodb: 'ok', redis: 'ok' },
    memory: { rssMB: number, heapUsedMB: number }
  }
  ```

---

## Auth (`/v1/auth`)

### POST /v1/auth/login

- **Auth**: `@Public()` (sem JWT)
- **Body** (Zod, normaliza e-mail trim+lowercase): `{ email: string (email), password: string (min 8) }`
- **Response**: `{ message: 'Login successful' }`
- **Throttle**: 5 req/min por IP
- **Lockout**: 5 falhas por email bloqueiam a conta por 30 min
- **Side effect**: Set-Cookie `auth_token` **host-only** (httpOnly, `Secure`+SameSite=Lax em produção; sem `Secure` em local; maxAge=2 dias; **sem** `Domain=.juri.capital`, para a sessão não vazar à juri-api). Valor = JWT RS256 (`iss=painel-robo`) com `identifier`, `sub`, `jti`, `permissions` e `user.email`

### POST /v1/auth/signup

- **Auth**: `ApiKeyAuthGuard` (JWT) + `@CheckPermissions('user_management')` — só admin cria usuário
- **Body** (Zod): `{ email: string (email), password: string (min 8), name: string }`
- **Response**: User document criado (password hashado bcrypt rounds=10)

### POST /v1/auth/logout

- **Auth**: `@Public()` (sem JWT)
- **Response**: `{ message: 'Logout realizado com sucesso' }` + clear cookie `auth_token` (mesmas opções do set, sem maxAge) + revogação: verifica a assinatura RS256 e grava `jwt:revoked:<jti>` em Redis quando presente

### GET /v1/auth/me

- **Auth**: `ApiKeyAuthGuard` (JWT do cookie `auth_token` ou header `Authorization: Bearer`)
- **Response**: usuário autenticado (`req.user`) + `permissions`

---

## Process (`/v1/process`)

### POST /v1/process

- **Auth**: `ApiKeyAuthGuard`
- **Body (Zod)**: `{ processes: string[] }` — array de numeros CNJ
- **Response**: `{ message: 'Processes added to queue for processing.' }` ou `{ message: 'All processes already exist in database.' }`
- **Side effect**: enfileira jobs `insert-process` em `insert-process-queue`

### GET /v1/process

- **Auth**: `ApiKeyAuthGuard`
- **Query**: `ListProcessFiltersDto` (page, limit, search, situation, startDate, endDate, lossReason, emptyDocuments, emptyInstances, hasNewMovements, stage, classProcess, hasAutos, hasAcordao, hasSecondInstance, owner)
- **Response**: lista paginada de processos

### GET /v1/process/counters

- **Auth**: `ApiKeyAuthGuard`
- **Query**: `ListProcessFiltersDto`
- **Response**: counters por status

### GET /v1/process/:id

- **Auth**: `ApiKeyAuthGuard`
- **Param**: `id: string`
- **Response**: processo com campos populados

### PATCH /v1/process/:id/mark-as-read

- **Auth**: `ApiKeyAuthGuard`
- **Param**: `id: string` (ObjectId)
- **Response**: `{ message: 'Processo marcado como lido', process: Process }`

### PATCH /v1/process/:number/update

- **Auth**: nenhuma
- **Param**: `number: string`
- **Body (Zod, catchall)**: `{ number?, title?, stageLabel?, formPipedrive?: FormPipedriveSchema, ...any }`
- **FormPipedriveSchema fields**: title, processNumber, executionNumber, duplicated, dl, firstDegree, secondDefendantResponsibility, defendants, analysis, sd, fgts, freeJustice, sucumbencia, jornadaOuCP, multaEmbargos, alvara, cessaoCredito, conclusion, minValueEstimate, prazo, abatimento, observacao, observacaoPreAnalise, value (number), calculoAutos, calculoAutosValue, calculoHomologado, execucaoProvisoria, stageLabel, activityType, activitySubject, activityDone (boolean)
- **Response**: processo atualizado

### POST /v1/process/webhook

- **Auth**: `ServiceWebhookGuard` via header `x-service-key` (ou bearer/query key legado)
- **Body**: `Root` interface (callback do scraping-fetch-robo — ver `specs/inter-service.md`)
- **Response**: 200 OK

### POST /v1/process/webhook-pipedrive/

- **Auth**: `ServiceWebhookGuard` via `PIPEDRIVE_WEBHOOK_KEY` (fallback para `WEBHOOK_SERVICE_KEY`)
- **Path matching do guard**: a validacao normaliza barra final, entao `/webhook-pipedrive` e `/webhook-pipedrive/` sao tratados como equivalentes
- **Body**: `{ num_processo: string, deal_id: number, stage_id: number }`
- **Side effect**: enfileira job `insert-process`

### POST /v1/process/:id/insert-execution

- **Auth**: `ApiKeyAuthGuard`
- **Param**: `id: string` (ObjectId do processo principal)
- **Body (Zod)**: `{ lawsuitExecution: string (regex: /^\d{7}-\d{2}\.\d{4}\.\d{1}\.\d{2}\.\d{4}$/), pipedriveFieldValue?: string }`
- **Response**: `{ message, processId, executionNumber, trtRegion, executionProcessExists, pipedriveUpdated, pipedriveFieldValue, timestamp }`
- **Side effect**: atualiza custom field Pipedrive `fc5f94cbf972eacef5050f1f53b4f88f1770f87c`

### DELETE /v1/process/:id/remove-provisional-lawsuit-number

- **Auth**: `ApiKeyAuthGuard`
- **Param**: `id: string`

### POST /v1/process/change-stage

- **Auth**: `ApiKeyAuthGuard` (role admin enforced no service, nao no guard)
- **Body (Zod)**: `{ processId: string (min 1), newStageId: number (min 1), reason?: string }`
- **Response**: `{ message, process: { id, number, previousStage, currentStage, stageId }, history, pipedrive: { updated, dealId } }`

### GET /v1/process/stages/available

- **Auth**: `ApiKeyAuthGuard`
- **Query**: `processId?: string`
- **Response**: `{ stages: string[], stageOptions: [{ stage, defaultId, description }] }`

### POST /v1/process/bulk-update

- **Auth**: `ApiKeyAuthGuard`
- **Body (Zod)**:
  ```typescript
  {
    filters: {
      search?: string,
      situation?: 'PENDING' | 'APPROVED' | 'LOSS',
      startDate?: string (ISO),
      endDate?: string (ISO),
      lossReason?: string | string[],
      emptyDocuments?: boolean,
      emptyInstances?: boolean,
      hasNewMovements?: boolean,
      stage?: 'PRE_ANALISE' | 'ANALISE' | 'CALCULO'
    },
    updates: {
      owner?: string (userId),
      stage?: 'PRE_ANALISE' | 'ANALISE' | 'CALCULO',
      stageId?: number,
      situation?: 'PENDING' | 'APPROVED' | 'LOSS',
      rejectionReason?: string,
      rejectionDescription?: string,
      isCustomReason?: boolean
    }
  }
  ```
- **Response**: `{ message, updatedCount, processIds: string[] }`

### POST /v1/process/run-documents-insights

- **Auth**: `ApiKeyAuthGuard`
- **Body**: `{ number: string, documents: string[], prompt: string }`
- **Response**: `{ message: 'Processamento iniciado' }`

### POST /v1/process/run-lawsuits

- **Auth**: `ApiKeyAuthGuard`
- **Body**: `{ lawsuits: string[], documents?: boolean, name?: string, log?: string, errorReason?: string }`
- **Response**: `{ message: 'Processamento iniciado' }`

### POST /v1/process/run-lawsuit-validation

- **Auth**: nenhuma
- **Body**: `{ number: string, step: string, isAll: boolean }`

### POST /v1/process/insert-lawsuit-manual

- **Auth**: nenhuma
- **Body**: `any[]` (array de payloads webhook Pipedrive)

### GET /v1/process/:number/documents/:documentId

- **Auth**: `ApiKeyAuthGuard`
- **Response**: documento extraido

### DELETE /v1/process/:number/documents/:documentId

- **Auth**: `ApiKeyAuthGuard`

### GET /v1/process/documents/*

- **Auth**: `ApiKeyAuthGuard`
- **Path**: wildcard S3 key
- **Response**: `StreamableFile` com `Content-Type: application/pdf`

### GET /v1/process/reasons-loss

- **Auth**: nenhuma
- **Query**: `{ search?: string }`
- **Response**: `{ key: string, label: string }[]`

### GET /v1/process/reasons-loss/categories

- **Auth**: nenhuma
- **Query**: `{ search?: string, category?: 'PRÉ-ANÁLISE' | 'ANÁLISE' }`
- **Response**: `{ category: string, reasons: { key, label }[] }[]`

### GET /v1/process/metrics

- **Auth**: nenhuma
- **Query**: `{ startDate?: string (ISO), endDate?: string (ISO) }`
- **Response**: `{ totalProcesses: number, processesByActivityType: { PRE_ANALISE, ANALISE, CALCULO: { total, pending, completed, approved, rejected } } }`

### POST /v1/process/upload-xml

- **Auth**: nenhuma
- **Body**: multipart/form-data com campo `file`

### POST /v1/process/:number/movements/mark-viewed

- **Auth**: `ApiKeyAuthGuard`
- **Query**: `instance: 'PRIMEIRO_GRAU' | 'SEGUNDO_GRAU'`

---

## Activities (sub-rotas de /v1/process)

### POST /v1/process/activity

- **Auth**: `ApiKeyAuthGuard` (role admin no service)
- **Body (Zod)**: `{ type: 'PRE_ANALISE' | 'ANALISE' | 'CALCULO', assignedTo: string (24-char hex ObjectId), processes: string[] (min 1) }`
- **Response**: `{ message, results: [{ processId, processNumber, activity | skipped }] }`
- **Side effect**: cria notificacao ACTIVITY via WebSocket

### PATCH /v1/process/:processId/activity/completed

- **Auth**: `ApiKeyAuthGuard`
- **Body (Zod)**: `{ notes?: string (max 500), type: TypeActivity, status: 'LOSS' | 'APROVED', lossReason?: string }`
- **Response**: `{ message, processId, activity }`

### PATCH /v1/process/:processId/activity/assigned

- **Auth**: `ApiKeyAuthGuard`
- **Body (Zod)**: `{ type: TypeActivity, assignedTo: string (24-char hex) }`

### PATCH /v1/process/:processId/activity/notes

- **Auth**: `ApiKeyAuthGuard`
- **Body (Zod)**: `{ type: TypeActivity, notes?: string }`

---

## Company (`/v1/company`)

### GET /v1/company

- **Auth**: `ApiKeyAuthGuard`
- **Query**: any (untyped)

### GET /v1/company/:cnpj

- **Auth**: `ApiKeyAuthGuard`

### PUT /v1/company/:id

- **Auth**: `ApiKeyAuthGuard`
- **Param**: `id: number`
- **Body**: any (untyped updateData)

### POST /v1/company/document

- **Auth**: `ApiKeyAuthGuard`
- **Query**: `cnpj: string`, `type: string`
- **Response**: `{ message: 'Documento solicitado com sucesso' }` (async)

### POST /v1/company/webhook

- **Auth**: nenhuma
- **Body**: any
- **Query**: `type: string`

### POST /v1/company/upload-xml

- **Auth**: nenhuma

---

## Notifications (`/v1/notifications`)

### GET /v1/notifications/me

- **Auth**: `ApiKeyAuthGuard`
- **Query**: `page?: string`, `limit?: string`

### PATCH /v1/notifications/:id/read

- **Auth**: `ApiKeyAuthGuard`

### DELETE /v1/notifications

- **Auth**: `ApiKeyAuthGuard`
- **Body**: `{ ids: string[] }`

---

## Observations (`/v1/observations`)

### POST /v1/observations

- **Auth**: `ApiKeyAuthGuard`
- **Body**: `{ description: string, processId: ObjectId }`

### PATCH /v1/observations/:id

- **Auth**: `ApiKeyAuthGuard`
- **Body**: `ObservationDocument`
- **Nota**: usa `updateObservationDto.id` do body, NAO o param da rota

### DELETE /v1/observations/:id

- **Auth**: `ApiKeyAuthGuard`

---

## Pipedrive (`/v1/pipedrive`)

### POST /v1/pipedrive/add-note

- **Auth**: `ApiKeyAuthGuard`
- **Body**: `{ content: string, dealId?: number }`
- **Response**: `{ message: 'Note added successfully' }`

---

## Prompts (`/v1/prompts`)

### GET /v1/prompts

- **Auth**: `ApiKeyAuthGuard`
- **Query**: `{ page?: number (default 1), limit?: number (max 100), search?: string }`

### POST /v1/prompts

- **Auth**: `ApiKeyAuthGuard`
- **Body (Zod)**: `{ type: string, text: string }`

### PUT /v1/prompts/:id

- **Auth**: `ApiKeyAuthGuard`

### DELETE /v1/prompts/:id

- **Auth**: `ApiKeyAuthGuard`

---

## Reason Loss (`/v1/reason-loss`)

### GET /v1/reason-loss

- **Auth**: `ApiKeyAuthGuard`
- **Query**: `{ page?: number (default 1), limit?: number (default 10, max 100), search?: string }`

### POST /v1/reason-loss

- **Auth**: `ApiKeyAuthGuard`
- **Body (Zod)**: `{ key: string (min 1), label: string (min 1) }`

### PATCH /v1/reason-loss/:id

- **Auth**: `ApiKeyAuthGuard`

### DELETE /v1/reason-loss/:id

- **Auth**: `ApiKeyAuthGuard`

---

## Steps (`/v1/steps`)

### GET /v1/steps

- **Auth**: nenhuma

---

## Users (`/v1/users`)

### GET /v1/users

- **Auth**: `ApiKeyAuthGuard`

### PATCH /v1/users/:id

- **Auth**: `ApiKeyAuthGuard`
- **Body (Zod)**: `{ email?: string (valid email), name?: string, password?: string (min 6) }`

---

## Auth Guard: ApiKeyAuthGuard

- Apesar do nome, e um JWT guard (`extends AuthGuard('jwt')`); aplicado globalmente, com bypass via `@Public()`
- JWT extraido do cookie `auth_token` **ou** do header `Authorization: Bearer`
- Algoritmo **RS256**; a chave pública é escolhida pelo `iss` do token (multi-emissor SSO)
- Validacao: revogação por `jti` (Redis) → `userModel.findOne({ email: payload.user.email })` (identidade por e-mail) → `isActive` → permissões. Throws `UnauthorizedException` se não encontrado/revogado/inativo
- Seta `req.user` = documento do usuário (sem password) + `id` + `permissions`
- JWT payload: `{ identifier, sub, jti, permissions, user: { email, nome?, cargo?, ... } }`
- Chaves: `JWT_PRIVATE_KEY_ROBO_API` (assina), `JWT_PUBLIC_KEY_ROBO_API` / `JWT_PUBLIC_KEY_JURI_API` (verificam)
