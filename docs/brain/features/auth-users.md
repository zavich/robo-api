# Feature: Auth & Users

## Quando usar

Use este mapa quando a task envolver autenticacao, JWT, API Key, usuarios ou roles.

## Pontos de entrada

- `src/modules/authentication/authentication.controller.ts`
- `src/modules/authentication/guards/jwt-strategy.guard.ts`
- `src/modules/authentication/guards/apikey-auth.guard.ts`
- `src/modules/user/user.controller.ts`

## Fluxo resumido

1. Login via POST `/v1/auth/login` com email e senha.
2. `LoginService` valida o email + senha (bcrypt.compare) e verifica se a conta esta ativa.
3. O login usa throttle de 5 req/min por IP e lockout Redis por conta apos 5 falhas por 30 minutos.
4. JWT gerado com `JWT_SECRET_KEY`, `jti` e `permissions`.
5. Rotas protegidas por `JwtAuthGuard`/`ApiKeyAuthGuard` e por `PermissionsGuard` global.
6. Roles: ADMIN (acesso total), ADVOGADO (acesso restrito).
7. Roles desconhecidas falham em modo fechado (`permissions: []`) e geram warning na validacao JWT.
8. `RoleAuditService` roda no bootstrap, consulta `distinct('role')` na base e alerta sobre roles fora do mapa conhecido. Com `AUTH_STRICT_ROLE_AUDIT=true`, o bootstrap falha.
9. `AUTH_AUDIT_SKIP=true` permite desabilitar explicitamente a auditoria de bootstrap em ambientes de staging/migracao.

## Conceitos

- JwtStrategy: estrategia Passport para validar JWT.
- ApiKeyAuthGuard: apesar do nome, e o guard JWT baseado em cookie.
- ServiceWebhookGuard: guard dedicado para webhooks internos entre servicos.
- User schema: email, password (hashed, legado para criacao/gestao), role, isActive, name.

## Riscos e cuidados

- Mudanca no JWT secret invalida todos os tokens ativos.
- Webhooks internos nao passam por JWT: dependem de `WEBHOOK_SERVICE_KEY` / `PIPEDRIVE_WEBHOOK_KEY`.
- Roles fora do mapa conhecido nao ganham fallback permissivo; o bootstrap agora alerta automaticamente e pode falhar em modo estrito.
- `AUTH_STRICT_ROLE_AUDIT=true` sem saneamento previo da base impede o servico de subir.
