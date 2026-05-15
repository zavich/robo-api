# Conventions

## Estrutura de modulo

Cada module NestJS segue: controller, module, dto/, schema/, services/, enums/ (opcional), interfaces/ (opcional), queues/ (opcional), crons/ (opcional).

## Naming

- Modules: kebab-case (`process`, `reason-loss`).
- Controllers: `{module}.controller.ts`.
- Services: `{acao}.service.ts` (ex: `create.service.ts`, `list.service.ts`).
- Schemas: `{entity}.schema.ts`.
- DTOs: `{acao}.dto.ts` dentro de `dto/`.

## Validacao

- Variaveis de ambiente validadas com Zod em `src/config/zod/env.ts`.
- DTOs usam nestjs-zod para validacao de request.

## Injecao de dependencia

- Constructor injection via NestJS DI.
- Mongoose models injetados via `@InjectModel()`.
- BullMQ queues injetadas via `@InjectQueue()`.

## Padroes observados

- Services separados por acao (create, list, find, update, delete).
- Guards para autenticacao (JWT e API Key).
- Decorators customizados para user e roles.
- Crons decorados com `@Cron()` do `@nestjs/schedule`.
