# Testing

## Framework

- Jest configurado via NestJS CLI.
- `npm run test` para unit tests.
- `npm run test:e2e` para e2e (config em `test/jest-e2e.json`).

## Estado atual

- Suite basica existe mas cobertura e baixa.
- E2E minimo (health check).
- Mocks em `src/modules/*/mock/` quando existentes.

## Prioridades

1. Process queue workers (validacao e solvencia).
2. Auth guards (seguranca).
3. Vertex AI service (mock de API, parsing).
4. Webhooks (payloads do Pipedrive).

## Convencoes

- Arquivos: `*.spec.ts` junto ao service testado.
- E2E: `test/*.e2e-spec.ts`.
- Mocks: diretorio `mock/` dentro do module ou inline.
