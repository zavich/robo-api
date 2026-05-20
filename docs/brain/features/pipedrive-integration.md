# Feature: Pipedrive Integration

## Quando usar

Use este mapa quando a task envolver Pipedrive CRM, deals, notas, stages ou webhooks.

## Status do mapeamento

- Estado: parcial
- Ultima area investigada: controller e service layer
- Principais lacunas: payloads de webhook nao detalhados

## Pontos de entrada

- `src/modules/pipedrive/pipedrive.controller.ts`
- `src/modules/process/services/webhook-pipedrive.service.ts`
- `src/service/pipedrive/` (client layer)

## Arquivos relacionados

- `src/service/pipedrive/pipedrive.ts` (client base)
- `src/service/pipedrive/activity.ts`
- `src/service/pipedrive/add-note.ts`
- `src/service/pipedrive/update-custom-field.ts`
- `src/service/pipedrive/update-deal-fields.ts`
- `src/service/pipedrive/update-stage.ts`

## Fluxo resumido

1. Webhook do Pipedrive envia payload para o backend.
2. `webhook-pipedrive.service.ts` processa e cria/atualiza processo.
3. Notas podem ser adicionadas ao deal via `add-note.ts`.
4. Custom fields e stages podem ser atualizados via services dedicados.

## Riscos e cuidados

- Webhook Pipedrive e entrada externa; validar payload.
- Deals podem ter custom fields que mudam sem aviso.
- Stages numericos precisam estar sincronizados com o mapeamento interno.

## Pendencias de mapeamento

- Documentar payload exato dos webhooks.
- Mapear mapeamento de custom fields.
