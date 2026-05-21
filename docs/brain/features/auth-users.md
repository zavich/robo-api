# Feature: Auth & Users

## Quando usar

Use este mapa quando a task envolver autenticacao, JWT, API Key, usuarios ou roles.

## Pontos de entrada

- `src/modules/authentication/authentication.controller.ts`
- `src/modules/authentication/guards/jwt-strategy.guard.ts`
- `src/modules/authentication/guards/apikey-auth.guard.ts`
- `src/modules/user/user.controller.ts`

## Fluxo resumido

1. Login via POST `/v1/auth/login` com email/senha.
2. Senha verificada com bcrypt.
3. JWT gerado com `JWT_SECRET_KEY` e `JWT_EXPIRES_IN`.
4. Rotas protegidas por `JwtAuthGuard` ou `ApiKeyAuthGuard`.
5. Roles: ADMIN (acesso total), ADVOGADO (acesso restrito).
6. Roles desconhecidas falham em modo fechado (`permissions: []`) e geram warning via `Logger` no login, no `JwtStrategy` e no `/auth/me`.
7. `RoleAuditService` roda no bootstrap, consulta `distinct('role')` na base e alerta sobre roles fora do mapa conhecido. Com `AUTH_STRICT_ROLE_AUDIT=true`, o bootstrap falha.

## Conceitos

- JwtStrategy: estrategia Passport para validar JWT.
- ApiKeyAuthGuard: guard para autenticacao por API Key (header Authorization).
- ServiceWebhookGuard: guard dedicado para webhooks internos entre servicos.
- User schema: email, password (hashed), role, isActive.

## Riscos e cuidados

- Mudanca no JWT secret invalida todos os tokens ativos.
- Webhooks internos nao passam por JWT: dependem de `WEBHOOK_SERVICE_KEY` / `PIPEDRIVE_WEBHOOK_KEY`.
- Roles fora do mapa conhecido nao ganham fallback permissivo; o bootstrap agora alerta automaticamente e pode falhar em modo estrito.
