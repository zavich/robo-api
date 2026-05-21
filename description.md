# Refatoracao robo-api — Escopo Completo do PR

> **AVISO PARA REVISORES**
>
> Este PR e grande **por design**. O escopo foi definido desde o inicio, baseado em uma auditoria estruturada de 58 achados nos 3 servicos (`scraping-fetch-robo`, `robo-api`, `painel-robo`), documentada em 7 arquivos `MELHORIAS-*.md` na raiz do diretorio pai (`robo_coleta/`).
>
> **Este branch ja passou por 5-6 rodadas de code review profundos** (registradas em `robo_coleta/review/v1-*.md` ate `review/v5-*.md`). Cada rodada identificou ate dezenas de issues, fechou todos os blockers das rodadas anteriores e introduziu um conjunto cada vez menor de novos achados. Saimos de **22 blockers v1 -> 6 blockers v2 -> 1 blocker v3 -> 0 blockers v4 e v5**.
>
> Por causa desse historico, **qualquer review feito a partir de agora deve ser O MAIS APROFUNDADO POSSIVEL**: bugs de superficie ja foram filtrados; o que sobrou ou e nuance dificil de pegar, ou e contexto faltando no review. Tempo gasto em revisao sera bem investido. Reviews superficiais (so olhar o diff sem cruzar com o resto do sistema) provavelmente vao perder o ponto.

---

## Contexto da refatoracao

O `robo-api` e o backend NestJS principal do sistema robo (MongoDB + Redis + BullMQ). Ele orquestra:
- Recebimento de webhooks do `scraping-fetch-robo` (sucesso, erro, nao-encontrado)
- Pipeline de validacao/analise de processos (9 steps, hoje colapsados em 4 filas BullMQ dedicadas)
- Integracao com Vertex AI (extracao de documentos), Pipedrive, SharePoint, EmpresaQui
- Autenticacao JWT via cookie httpOnly e RBAC por permissoes

A equipe (Pedro e Rafael) reportou dois problemas criticos em producao:
1. **Containers instaveis** (afeta principalmente `scraping-fetch-robo`)
2. **Processos falhando silenciosamente na extracao** (afeta `robo-api` e `scraping-fetch-robo`)

A auditoria revelou 58 achados (13 bugs, 8 estabilidade, 14 seguranca, 14 performance, 9 arquitetura). Do total, **22 sao responsabilidade do `robo-api`**.

---

## O que mudou no `robo-api` neste PR

### Bugs criticos resolvidos

| ID | Descricao | Arquivos |
|----|-----------|----------|
| BUG-002 | `NextStepsService.execute()` sem `await` em 7 chamadas — pipeline parava silenciosamente | `webhook.service.ts`, `extract-documents-info.service.ts`, `initial-petition.service.ts` |
| BUG-004 | Webhook `NAO_ENCONTRADO`/`ERRO` sem retry — processos viravam erro permanente sem nova tentativa | `schema/process.schema.ts` (campo `scraperRetryCount`), `handlers/webhook-erro.handler.ts`, `handlers/webhook-nao-encontrado.handler.ts` |
| BUG-005 | `fetchCompany` recursivo infinito em HTTP 429 | `solvency-validation.service.ts` (assinatura virou `(cnpj, attempt=0, maxAttempts=5)` com backoff exponencial) |
| BUG-008 | `extract-document` avancava pipeline mesmo quando todos os documentos falhavam | `extract-documents-info.service.ts` (`hasSuccess` check antes de `nextStepsService.execute('step-4')`) |
| BUG-009 | Webhook sem idempotencia — retries causavam dupla execucao destrutiva | `webhook.service.ts` (Lua script atomico que aceita re-acquire de estados `FAILED`/`FAILED_PROCESS_NOT_FOUND`) |
| BUG-010 | Sem mecanismo de deteccao de processos orfaos | `crons/orphaned-process.cron.ts` (NOVO, cron a cada 30min em estados intermediarios por >2h) |

### Estabilidade

| ID | Descricao | Arquivos |
|----|-----------|----------|
| EST-004 | Sem handlers para `unhandledRejection`/`uncaughtException` | `main.ts:22-29` |
| EST-005 | Redis connection loss sem reconnection | `redis.module.ts` (retry strategy + lifecycle hooks) |

### Seguranca

| ID | Descricao | Arquivos |
|----|-----------|----------|
| SEG-001 / SEG-004 | ApiKeyAuthGuard nao validava valor; endpoints sem guard | `api-key-auth.guard.ts`, `process.controller.ts` (CheckPermissions em endpoints sensiveis) |
| SEG-002 | Endpoints admin sem `@UseGuards` | `authentication.controller.ts`, `user.controller.ts` |
| Webhook public | Endpoint `POST /process/webhook` era publico | `guards/service-webhook.guard.ts` (NOVO, valida `x-service-key`/`Bearer`/`?key=` com `timingSafeEqual`) |
| Pipedrive webhook | `POST /process/webhook-pipedrive/` aceitava qualquer chave | `guards/service-webhook.guard.ts` + `decorators/webhook-source.decorator.ts` (NOVO, decorator-based em vez de path-matching) |
| RBAC | Permissoes definidas client-side no painel | `constants/permissions.constant.ts` (server-side source of truth) + `services/role-audit.service.ts` (NOVO, audita roles em DB no bootstrap) + `AUTH_STRICT_ROLE_AUDIT`/`AUTH_AUDIT_SKIP` envs |
| JWT revocation | Sem mecanismo de revogar JWT em logout | `authentication.controller.ts:60-89` (registra `jti` em Redis com TTL = expiracao do token) |
| Login passwordless | Auth agora aceita so email (decisao explicita do produto) | `dto/auth.dto.ts`, `services/login.service.ts` (sem bcrypt; mantem Redis lockout para rate limit) |

### Performance

| ID | Descricao | Arquivos |
|----|-----------|----------|
| PERF-003 | Single BullMQ queue para 9+ job types | `next-steps.service.ts` agora roteia para `process-validation-queue`, `solvency-validation-queue`, `extract-document-queue`, `initial-petition-queue` (4 filas dedicadas) com `checkBackpressure` por fila |
| PERF-009 | SharePoint cache in-memory | `sharepoint.service.ts:19-41` (migrado para Redis com TTL = expiry - 5min) |
| Vertex AI bursts | `Promise.all` paralelo causava 429 | `extract-documents-info.service.ts` (loop interno serializado) |
| GCS leak | `gsKey` com `Date.now()` impedia dedup entre retries | `extract-documents-info.service.ts:135` (agora `${lawsuit}_${String(document._id)}` deterministico, + flag `uploadedToGcs` previne 404 ruidoso em delete pre-upload) |

### Arquitetura

| ID | Descricao | Arquivos |
|----|-----------|----------|
| ARQ-001 | `WebhookService` com 5+ responsabilidades (~394 linhas) | Decomposto em orquestrador puro + 4 handlers (`webhook-trt.handler.ts`, `webhook-tst.handler.ts`, `webhook-erro.handler.ts`, `webhook-nao-encontrado.handler.ts`) |
| ARQ-002 | Status do processo gerenciado por strings livres | `services/process-state-machine.service.ts` (NOVO, matriz central + `transition()` com CAS via `findOneAndUpdate({_id, name: expectedFrom}, patch)`) |
| ARQ-003 | Zero testes | Specs adicionadas: `webhook.service.spec.ts`, `process-state-machine.service.spec.ts`, `service-webhook.guard.spec.ts`, `role-audit.service.spec.ts`, `webhook-trt.handler.spec.ts`, `webhook-erro.handler.spec.ts`, `orphaned-process.cron.spec.ts` |
| ARQ-004 | Logging inconsistente | Padronizado para `Logger` do Nest em fluxos criticos |
| ARQ-005 | Sem correlation IDs entre servicos | `middleware/correlation-id.middleware.ts` (NOVO, extrai/gera `X-Correlation-Id`, propaga em logs + jobs BullMQ) |
| ARQ-007 | Validacao mista DTO | `ValidationPipe` global com `whitelist: true`, `forbidNonWhitelisted: true`, `transform: true` |
| State race | `transition` era read-then-write — race entre cron e webhook | CAS em `process-state-machine.service.ts:102-122` |

### Infra e deploy

- `task-definition.json` sanitizado: todos os ARNs/account IDs/secret names substituidos por placeholders `<AWS_*>`
- `scripts/render-task-definition.mjs` (NOVO) renderiza template usando `process.env`, com `fileURLToPath` (compativel com Node 18 do Dockerfile)
- `.github/workflows/deploy-robo-api.yml` agora le account ID, regiao, cluster, service, family, container, role ARNs e API URL todos de `secrets.*`

### Brain docs (`docs/brain/`)

Reconciliacao completa para refletir o estado real do codigo:
- `specs/api-contracts.md`, `specs/queue-contracts.md`, `specs/auth-system.md`, `specs/data-schemas.md`, `specs/env-vars.md`, `specs/inter-service.md`
- `features/auth-users.md`, `features/process-management.md`, `features/process-queue.md`, `features/document-insights.md`, `features/notifications.md`, `features/pipedrive-integration.md`, `features/company-module.md`
- `engineering/infrastructure.md`

Inclui nota explicita sobre migration do campo `scraperRetryCount` (campo novo no schema; codigo usa `$or: [{ $exists: false }, { $lt: N }]` para nao precisar de backfill obrigatorio).

---

## Estatisticas do diff (rough)

- **~25 arquivos novos** (handlers, decorator, cron, state machine, role audit, render script, specs, brain docs)
- **~40 arquivos modificados** (controllers, services, schemas, modules, guards)
- **~3500 linhas adicionadas, ~1500 removidas** (sem yarn.lock)
- **34 testes** passando (`yarn test --runInBand`)

---

## Como revisar (sugestao)

Por causa do tamanho, sugiro revisao por dominio:

1. **Auth + RBAC** — `authentication/`, `process/guards/`, `process/decorators/webhook-source.decorator.ts`. Comecar por aqui porque toca seguranca.
2. **State machine + idempotency** — `process/services/process-state-machine.service.ts`, `process/services/webhook.service.ts`, `process/services/handlers/*`. E o coracao do refactor; le com calma a matriz `ALLOWED_TRANSITIONS` e o Lua script de idempotencia.
3. **Pipeline de extracao** — `process/queues/process/services/extract-documents-info.service.ts`, `process/services/handlers/webhook-trt.handler.ts`. Atencao a ordem `enqueue step-4 -> transition EXTRACTION_DOCUMENTS_FINISHED` (se enqueue falha, estado anterior fica preservado e cron de orfaos pega).
4. **Filas BullMQ** — `next-steps.service.ts`, `process/queues/process/*`, `module` registrations. Verificar que `checkBackpressure` esta sendo chamado e que os 4 jobs entry pontos batem com `queue-contracts.md`.
5. **Cron de orfaos** — `process/crons/orphaned-process.cron.ts`. Confirmar que `STUCK_STATUS_NAMES` cobre todos os estados intermediarios que o pipeline pode parar.
6. **Tests** — `*.spec.ts`. Sao a documentacao executavel das invariantes.

---

## O que NAO esta neste PR (escopo deferido conscientemente)

- **ARQ-008** Structured logging (`nestjs-pino`) — decisao explicita de skip; ficamos com `Logger` + `correlationId`.
- **PERF-002** Concorrencia de filas por TRT — equipe decidiu manter configuracao atual.
- **Migration mass-update de `scraperRetryCount`** — codigo tolera `undefined` via `$or: [{$exists: false}, ...]`; backfill e opcional.
- **SSO com painel principal** — investigacao mostrou JWTs incompativeis entre `juri-api` e `robo-api`; auth foi simplificada para passwordless email-only no proprio `robo-api`.

---

## Referencias

- Auditoria original: `robo_coleta/MELHORIAS-*.md` (8 arquivos)
- Code reviews: `robo_coleta/review/v1-*.md` ate `review/v5-*.md` (mais o resumo `00-RESUMO-FINAL.md`)
- Status item-a-item: `robo_coleta/MELHORIAS-STATUS.md`
- Secrets a configurar: `robo_coleta/GITHUB_ACTIONS_SECRETS.md`
