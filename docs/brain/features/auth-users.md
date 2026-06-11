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
4. JWT **RS256** (issuer `painel-robo`) com `jti`, `permissions` e `user.email`; entregue no cookie `auth_token` **host-only** (sem `Domain=.juri.capital`).
5. Rotas protegidas por `ApiKeyAuthGuard` (JWT) global — com bypass via `@Public()` — e por `PermissionsGuard` global.
6. **SSO unidirecional** juri-api -> painel-robo: a `JwtStrategy` valida tokens de qualquer emissor conhecido pela chave pública do `iss`, e resolve a identidade **por e-mail** (não por `_id`), pois o `sub` de um token da juri-api é o id do outro serviço. O sentido painel-robo -> juri-api foi descontinuado (a juri-api não valida mais tokens daqui); por isso a sessão própria fica em cookie host-only.
7. Revogação por `jti`: logout grava `jwt:revoked:<jti>` no Redis; a strategy recusa tokens revogados mesmo dentro da validade.
8. Roles: ADMIN (acesso total), ADVOGADO (acesso restrito).
9. Roles desconhecidas falham em modo fechado (`permissions: []`) e geram warning na validacao JWT.
10. `RoleAuditService` roda no bootstrap, consulta `distinct('role')` na base e alerta sobre roles fora do mapa conhecido. Com `AUTH_STRICT_ROLE_AUDIT=true`, o bootstrap falha. `AUTH_AUDIT_SKIP=true` desabilita explicitamente a auditoria.

## Conceitos

- JwtStrategy: estrategia Passport para validar JWT.
- ApiKeyAuthGuard: apesar do nome, e o guard JWT baseado em cookie.
- ServiceWebhookGuard: guard dedicado para webhooks internos entre servicos.
- User schema: email, password (hashed, legado para criacao/gestao), role, isActive, name.

## Riscos e cuidados

- JWT é RS256 (par de chaves), não secret simétrico. Trocar a chave **privada** invalida os tokens emitidos por esta API; trocar uma chave **pública** sem combinar com o outro serviço quebra o SSO (401). Os `iss` são comparados caractere a caractere.
- Faltando chave (privada no módulo, pública na strategy), o bootstrap aborta — exceto em `NODE_ENV=test`.
- O `auth_token` da sessão própria é **host-only** (não compartilhado em `.juri.capital`); a API só **lê** o `auth_token` que a juri-api seta no domínio pai. Em `NODE_ENV=local`, sem `Secure`. As opções de set e clear precisam casar, senão o cookie fica órfão.
- Webhooks internos nao passam por JWT: dependem de `WEBHOOK_SERVICE_KEY` / `PIPEDRIVE_WEBHOOK_KEY`.
- Roles fora do mapa conhecido nao ganham fallback permissivo; o bootstrap agora alerta automaticamente e pode falhar em modo estrito.
- `AUTH_STRICT_ROLE_AUDIT=true` sem saneamento previo da base impede o servico de subir.
