# Test Matrix

## Estado atual

Jest configurado com setup basico. E2E disponivel mas minimo.

## Matriz por area

| Area | Arquivos principais | Testes existentes | Comando | Risco |
|---|---|---|---|---|
| Process queue workers | `src/modules/process/queues/` | Parcial | `npm test -- process` | Alto: validacao e persistencia |
| Authentication | `src/modules/authentication/` | Minimo | `npm test -- auth` | Alto: seguranca |
| Process CRUD | `src/modules/process/services/` | Parcial | `npm test -- process` | Alto: fluxo principal |
| Vertex AI | `src/service/vertex/` | Nenhum | - | Medio/alto: parsing e rate limit |
| Notifications | `src/modules/notification/` | Nenhum | - | Medio: real-time |
| Company | `src/modules/company/` | Nenhum | - | Medio: dados de empresa |
| Pipedrive | `src/service/pipedrive/` | Nenhum | - | Medio: CRM externo |

## Lacunas

- Vertex AI service sem testes (mock de API Google necessario).
- WebSocket gateway sem testes de integracao.
- E2E suite minima (apenas health check).
- Cron de revalidacao sem testes.
