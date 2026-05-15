# Feature: Process Queue

## Quando usar

Use este mapa quando a task envolver filas BullMQ, workers de processamento, validacao, solvencia ou extracao de documentos.

## Status do mapeamento

- Estado: parcial
- Ultima area investigada: queue index e services
- Principais lacunas: payloads detalhados de cada job

## Pontos de entrada

- `src/modules/process/queues/process/index.ts`: ProcessQueue (BullMQ worker principal).
- `src/modules/process/queues/process/services/`: services de cada tipo de job.

## Arquivos relacionados

- `src/modules/process/queues/process/services/insert-process.service.ts`
- `src/modules/process/queues/process/services/process-validation.service.ts`
- `src/modules/process/queues/process/services/solvency-validation.service.ts`
- `src/modules/process/queues/process/services/extract-documents-info.service.ts`
- `src/modules/process/queues/process/services/initial-petition.service.ts`

## Fluxo resumido

1. Job entra na fila via controller ou webhook.
2. Worker despacha por tipo: insert-process, process-validation, solvency-validation, extract-document, initial-petition.
3. Insert: cria processo no MongoDB.
4. Validation: valida dados do processo (campos obrigatorios, regras).
5. Solvency: verifica viabilidade financeira da empresa reclamada.
6. Extract: extrai informacoes de documentos via Vertex AI.
7. Initial petition: processa peticao inicial.

## Conceitos

- BullMQ: biblioteca de filas com Redis como backend.
- Job: unidade de trabalho com payload, retry e backoff.
- Worker: consumidor de jobs registrado no NestJS module.
- Bull Board: dashboard de visualizacao de filas (non-prod).

## Riscos e cuidados

- Jobs falhados ficam na fila `failed`; verificar Bull Board.
- Retry com backoff pode causar processamento duplicado se nao idempotente.
- Redis indisponivel trava todas as filas.
- Vertex AI rate limit pode atrasar extracao de documentos.

## Pendencias de mapeamento

- Documentar payload de cada tipo de job.
- Mapear retry policies e backoff configurados.
- Detalhar integracao entre queue e Vertex AI.
