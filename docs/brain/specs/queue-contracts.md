# Queue Contracts

## Filas de processamento

O `robo-api` usa filas BullMQ separadas por etapa. O `NextStepsService` roteia cada step para sua fila dedicada.

---

## Job: `insert-process`

**Producers**: `CreateProcessService`, `WebhookPipedriveService`, `InitialPetitionService`, `LossRevalidationCron`
**Consumer**: `InsertProcessWorker`

**Payload**:
```typescript
{
  processNumber: string,                          // numero CNJ
  mainProcessId?: string | null,                  // ObjectId do processo principal
  dealId?: number | null,                         // Pipedrive deal ID
  stageId?: number | null,                        // Pipedrive stage ID
  calledByInitialPetitionProvisionalNumber?: string | null
}
```

**Job options**: `{ removeOnComplete: true, attempts: 3 }`

**Fluxo**:
1. Verifica se processo ja existe no DB
2. Se nao: cria Process + ProcessStatus + Complainant + Company
3. Envia para scraping via `POST ${SCRAPING_BASE_URL}/processos/:processNumber`
4. Atualiza processStatus
5. Trigger step pipeline via `NextStepsService`

---

## Job: `process-validation` (step-1)

**Producer**: `NextStepsService`, `WebhookErroHandler` (retry transitório)
**Consumer**: `ProcessValidationWorker`

**Payload**: `{ processNumber: string, correlationId?: string }`

**Fluxo**: valida dados do processo, envia para TST se aplicavel.

---

## Job: `solvency-validation` (step-2)

**Producer**: `NextStepsService`
**Consumer**: `SolvencyValidationWorker`

**Payload**: `{ processNumber: string }`

**Fluxo**: busca dados empresa via EmpresaQui API, determina solvencia.

---

## Job: `extract-document` (step-3)

**Producer**: `NextStepsService`
**Consumer**: `ExtractDocumentWorker`

**Payload**: `Root` (body do webhook scraping) ou `{ processNumber: string }`

**Fluxo**: extrai documentos relevantes e envia para Vertex AI para analise.

---

## Job: `initial-petition` (step-4)

**Producer**: `NextStepsService`
**Consumer**: `InitialPetitionWorker`

**Payload**: `{ processNumber: string, resposta?: { numero_unico: string } }`

**Fluxo**: processa peticao inicial, detecta execucao provisoria.

---

## Jobs sem consumer neste codebase (steps 5-9)

Os seguintes jobs sao enfileirados por `NextStepsService` mas NAO tem consumers implementados:

| Step | Job name | Descricao |
|------|----------|-----------|
| step-5 | `filter-value` | Filtro de valor |
| step-6 | `liberation` | Liberacao |
| step-7 | `parameters` | Parametros |
| step-8 | `resources` | Recursos |
| step-9 | `simple-calc` | Calculo simples |

**Nota**: possivelmente implementados em servico separado ou pendentes de implementacao.

---

## Step Pipeline (NextStepsService)

Fluxo sequencial de processamento:

```
insert-process-queue / insert-process
  → process-validation-queue / step-1: process-validation
    → solvency-validation-queue / step-2: solvency-validation
      → extract-document-queue / step-3: extract-document
        → initial-petition-queue / step-4: initial-petition
```

Cada step e um job separado em sua propria fila. A progressao e gerenciada pelo `NextStepsService` que le o campo `step.next` da collection Steps para determinar o proximo job.

### NextStepsService — detalhes internos

**Arquivo**: `src/service/next-steps/next-steps.service.ts`
**Modulo**: `NextStepsModule` (registra `process-validation-queue`, `solvency-validation-queue`, `extract-document-queue`, `initial-petition-queue`)

**Metodo `execute(step: string, data: any)`**:

Roteamento via `switch(step)`:

| step | Job/Fila |
|------|----------|
| `step-1` | `process-validation` em `process-validation-queue` |
| `step-2` | `solvency-validation` em `solvency-validation-queue` |
| `step-3` | `extract-document` em `extract-document-queue` |
| `step-4` | `initial-petition` em `initial-petition-queue` |
| outro | no-op (default branch) |

**Payload padrao passado para jobs**:
```typescript
{
  processNumber: string,
  correlationId?: string
}
```

**NAO interage diretamente com o Step schema**. Recebe o slug como string do caller. Os callers resolvem o slug do DB (ex: `ProcessValidationService` le `step.next` e passa para `nextStepsService.execute(step.next, ...)`).

**Metodo `getQueueByStep(step: string)`**: lookup puro, retorna nome do job ou `undefined`. Sem operacao async.

### Call sites do NextStepsService

| Arquivo | Quando |
|---------|--------|
| `process-validation.service.ts:59` | Apos step-1, passa `step.next` |
| `extract-documents-info.service.ts` | Apos extracao de docs, hardcodes `'step-4'` |
| `run-lawsuit-validation.service.ts:92,136,143` | Re-trigger manual de processos |
| `webhook-erro.handler.ts` | Retry de erro transitorio para `process-validation-queue` |

## Retry de órfãos

O `OrphanedProcessCron` nao reenfileira mais cegamente em `insert-process-queue`. O retry depende do estado encontrado:

| Status preso | Reacao |
|-------------|--------|
| `PROCESSING_WITH_MOVIMENTS` | reenvia scraping sem documentos via `fetchProcessExtract(..., false)` |
| `PROCESSING_WITH_DOCUMENTS` | reenvia scraping com documentos via `fetchProcessExtract(..., true)` |
| `PROCESS_WAITING_EXTRACTION_DOCUMENTS` | reenfileira `step-3` |
| `EXTRACTION_MOVIMENTS_FINISHED` | reenfileira `step-4` |
| `EXTRACTION_DOCUMENTS_FINISHED` | reenfileira `step-4` |

---

## Servicos de re-trigger (Lawsuit Validation)

### LawsuitValidationService

**Arquivo**: `src/modules/process/services/run-lawsuit-validation.service.ts`
**Endpoint**: `POST /v1/process/run-lawsuit-validation`
**Body**: `{ number: string, step: string, isAll: boolean }`
**Proposito**: ferramenta administrativa para resetar processos a um step especifico e re-enfileirar.

**Modo batch** (`isAll === true`):
1. Aggregation MongoDB com filtro hardcoded:
   - `processStatus.errorReason === 'Documento da petição inicial não encontrado ou não acessível'`
   - `instanciasAutosWithDocs` com `$size: 0`
2. Limit: 2 processos por execucao
3. Para cada: `situation = PENDING`, limpa `processStatus.log/errorReason`, chama `nextStepsService.execute(step, ...)`

**Modo single** (`isAll === false`):
1. Busca processo por `number`
2. Seta `situation = 'IN_PROGRESS'`
3. Caso especial: se `processStatus.step.slug === 'step-0'`, chama `insertProcessService.fetchProcessExtract()` (re-ingestao completa)
4. Senao: chama `nextStepsService.execute(step, ...)`

### RunListLawsuitsValidationService

**Arquivo**: `src/modules/process/services/run-list-lawsuits-validation.service.ts`
**Endpoint**: `POST /v1/process/run-lawsuits`
**Body**: `{ lawsuits: string[], documents?: boolean, name?: string, log?: string, errorReason?: string }`
**Proposito**: re-ingestao em massa de processos a partir do step-1.

**Modo lista** (`lawsuits.length > 0`): usa lista fornecida diretamente.

**Modo auto-discovery** (`lawsuits.length === 0`): aggregation dinamica buscando processos com `documents` array vazio, opcionalmente filtrando por `processStatus.name`, `errorReason`, `log`.

**Para cada processo**:
1. Atualiza `synchronizedAt`
2. Resolve `step-1` do DB
3. Reseta `processStatus.step` e `errorReason`
4. Chama `insertProcessService.fetchProcessExtract(number, process, documents)` — re-ingestao completa

---

## Loss Reason Catalog (hardcoded em LossReasonsService)

### Categoria PRE-ANALISE

```
ARQUIVADO, CLASSE_INELEGIVEL, LISTA_EMPRESA_INELEGIVEL, NAO_E_TRABALHISTA,
PROCESSO_FISICO, SEGREDO_JUSTICA, SEM_ACORDAO, PRE_ANALISE_IMPROCEDENTE,
PRE_ANALISE_ACORDO, PRE_ANALISE_VALOR_ABAIXO_MINIMO, PRE_ANALISE_LIQUIDADO,
PRE_ANALISE_SUSPENSO, PRE_ANALISE_CCB_CESSAO_CREDITO
```

### Categoria ANALISE

```
AGUARDAR_TRANSITO, TRT_INACESSIVEL, AGUARDAR_DECISAO_TST, ABAIXO_VALOR_MINIMO,
ANALISE_IMPROCEDENTE, LIQUIDADO, RISCO_TESE, RISCO_PRAZO,
RISCO_TESE_PENDENTE_TRANSITO, PROCESSO_PRINCIPAL_ARQUIVADO_SEM_PROVISORIA,
EXECUCAO_PROVISORIA_ARQUIVADO_SEM_PRINCIPAL, PROCESSOS_ARQUIVADOS,
PROCESSO_SEM_CREDITO
```
