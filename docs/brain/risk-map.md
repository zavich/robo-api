# Risk Map

| Area | Arquivos | Risco | Antes de alterar |
|---|---|---|---|
| Process queue workers | `src/modules/process/queues/process/` | Alto: validacao, solvencia, persistencia | Ler `features/process-queue.md`; rodar testes |
| Webhook Pipedrive | `src/modules/process/services/webhook-pipedrive.service.ts` | Alto: dados vindo de CRM externo | Ler `features/pipedrive-integration.md` |
| Vertex AI service | `src/service/vertex/vertex-AI.service.ts` | Alto: parsing JSON, rate limit, retry | Ler `features/document-insights.md` |
| Auth guards | `src/modules/authentication/guards/` | Alto: seguranca e acesso | Ler `features/auth-users.md` |
| Process schema | `src/modules/process/schema/process.schema.ts` | Alto: schema central, 30+ campos | Ler `engineering/data-model.md` |
| Loss revalidation cron | `src/modules/process/crons/loss-revalidation.cron.ts` | Medio/alto: muda status de processos | Ler `features/process-management.md` |
| WebSocket gateway | `src/gateway/notifications.gateway.ts` | Medio: notificacoes real-time | Ler `features/notifications.md` |
| AWS services | `src/service/aws/aws.service.ts` | Medio: S3, SES, SNS, Secrets | Ler `engineering/infrastructure.md` |
| Pipedrive client | `src/service/pipedrive/` | Medio: CRM externo, deals, stages | Ler `features/pipedrive-integration.md` |

## Politica

- Se o arquivo estiver neste mapa, a task deve citar quais testes foram rodados ou por que nao foram.
- Mudancas nestes arquivos devem atualizar feature map ou workflow quando revelarem comportamento duravel.
