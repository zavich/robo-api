# Feature: Process Management

## Quando usar

Use este mapa quando a task envolver CRUD de processos, stages, atividades, bulk operations, metricas ou cron de revalidacao.

## Status do mapeamento

- Estado: parcial
- Ultima area investigada: controller, services, cron
- Principais lacunas: metricas e upload XLSX nao detalhados

## Pontos de entrada

- `src/modules/process/process.controller.ts`: endpoints REST.
- `src/modules/process/process.module.ts`: configuracao do modulo.

## Arquivos relacionados

- `src/modules/process/services/create-process.service.ts`
- `src/modules/process/services/lawsuit/` (find, list, update)
- `src/modules/process/services/change-stage.service.ts`
- `src/modules/process/services/bulk-update.service.ts`
- `src/modules/process/services/activity/` (create, complete, change-assigned, update-notes)
- `src/modules/process/services/mark-process-as-read.service.ts`
- `src/modules/process/services/insert-execution.service.ts`
- `src/modules/process/services/loss-reasons-service.ts`
- `src/modules/process/services/metrics.service.ts`
- `src/modules/process/services/saved-movements.service.ts`
- `src/modules/process/crons/loss-revalidation.cron.ts`
- `src/modules/process/schema/process.schema.ts`

## Fluxo resumido

1. Processos sao criados via webhook ou insercao manual.
2. Processo passa por filas de validacao e extracao (ver `process-queue.md`).
3. Stages: PRE_ANALISE -> ANALISE -> CALCULO.
4. Atividades sao criadas e atribuidas a advogados.
5. Cron diario revalida processos LOSS com RISCO_TESE ou RISCO_PRAZO.
6. Bulk update permite alterar multiplos processos simultaneamente.

## Conceitos

- Situation: PENDING, LOSS, APPROVED.
- StageProcess: PRE_ANALISE, ANALISE, CALCULO.
- ProcessStatus: estados de processamento (PROCESSING_WITH_MOVIMENTS, etc).
- Cron loss-revalidation: executa diariamente para reavaliar processos rejeitados.

## Riscos e cuidados

- Cron de revalidacao muda status de processos automaticamente.
- Bulk update afeta multiplos registros.
- Webhook Pipedrive pode criar/atualizar processos automaticamente.

## Pendencias de mapeamento

- Detalhar regras de revalidacao do cron.
- Mapear metricas e contadores.
