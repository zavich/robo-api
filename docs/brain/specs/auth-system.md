# Auth System

## JWT (RS256 + SSO bidirecional)

A assinatura é **RS256** (par de chaves), não HS256. Isso habilita o SSO
bidirecional painel-robo ↔ juri-api: cada serviço valida tokens do outro pela
chave **pública** do emissor, sem compartilhar segredo. Ver `src/modules/authentication/jwt/`.

### Estrutura do payload

```typescript
{
  identifier: string,   // email normalizado (claim do refactor)
  sub: string,          // user ObjectId local (não usado no lookup; ver validação)
  jti: string,          // id do token p/ revogação
  permissions: string[],// permissões locais resolvidas no login
  user: {               // bloco do contrato de SSO (lido por robo-api e juri-api)
    email: string,
    nome?: string,
    sobreNome?: string,
    cargo?: string,
    permissoes?: string[]
  }
}
```

### Configuracao

- **Algoritmo**: `RS256` (único aceito; nunca `none`/HS256). Ver `jwt.constants.ts`.
- **Assinatura**: `JWT_PRIVATE_KEY_PAINEL_ROBO` (privada), `issuer = 'painel-robo'`.
- **Verificação (multi-emissor)**: mapa `iss → chave pública` montado em
  `jwt-keys.ts` a partir de `JWT_PUBLIC_KEY_PAINEL_ROBO` (iss `painel-robo`) e
  `JWT_PUBLIC_KEY_JURI_API` (iss `api.juri.capital`). Emissor sem chave = 401.
- **Storage**: cookie httpOnly `auth_token`, compartilhado no domínio pai
  `.juri.capital` (override via `AUTH_COOKIE_DOMAIN`). Em `NODE_ENV=local` cai
  para host-only sem `Secure` (http). Ver `auth-cookie.ts`.
- **Expiry**: 2 dias (`TOKEN_TTL_SECONDS`), fonte única para cookie e token.
- **Extração**: cookie `auth_token` **ou** header `Authorization: Bearer`.
- **Fail-fast**: faltando chave privada (módulo) ou pública (strategy), o
  bootstrap aborta — exceto em `NODE_ENV=test`.

### Validacao (Passport JWT Strategy)

Arquivo: `src/modules/authentication/guards/jwt-strategy.guard.ts`

1. Escolhe a chave pública pelo `iss` do token e valida a assinatura RS256.
2. Se `jti` presente e revogado em Redis (`jwt:revoked:<jti>`): `UnauthorizedException`.
3. **Resolução de identidade por e-mail**: `userModel.findOne({ email: payload.user.email })`
   (lowercase). Funciona para tokens próprios e da juri-api, cujo `sub` é o `_id`
   do outro serviço e não casaria com a base local.
4. Se não encontrado ou `isActive === false`: `UnauthorizedException`.
5. Role fora do mapa conhecido: apenas warning.
6. Permissões: usa `payload.permissions` **só** quando `iss === 'painel-robo'`
   (token próprio); de tokens da juri-api deriva de `getPermissionsForRole(role)`
   local — não confiamos na lista de permissões de outro serviço.
7. Seta `req.user` = documento do usuário (sem senha) + `id` + `permissions`.

---

## Guard: ApiKeyAuthGuard

Arquivo: `src/modules/authentication/guards/apikey-auth.guard.ts`

- **Apesar do nome**: e um JWT guard (`extends AuthGuard('jwt')`)
- **Uso**: aplicado por rota/controller com `@UseGuards(ApiKeyAuthGuard)`

---

## Roles e permissoes

| Role | Valor | Descricao |
|------|-------|-----------|
| ADMIN | `'admin'` | Acesso total |
| USER | `'advogado'` | Acesso limitado |

### Enforcement

- A autorizacao principal e por permissao, nao por comparacao manual de `role` em cada service.
- `PermissionsGuard` roda globalmente e consome `@CheckPermissions(...)`.
- `getPermissionsForRole(role)` e o source of truth server-side.
- `RoleAuditService` audita roles desconhecidas no bootstrap. `AUTH_STRICT_ROLE_AUDIT=true` pode transformar o achado em fail-fast; `AUTH_AUDIT_SKIP=true` pula a auditoria explicitamente.

---

## Fluxo de login

1. `POST /v1/auth/login` com `{ email, password }`
2. `LoginService` valida se o email existe, compara a senha com bcrypt, e verifica se a conta está ativa
3. Redis aplica throttle/lockout por conta: 5 falhas -> bloqueio de 30 minutos
4. JWT RS256 gerado com `{ identifier, sub, jti, permissions, user }` (issuer `painel-robo`)
5. Set-Cookie `auth_token` (httpOnly, `Secure`+domínio `.juri.capital` em produção, host-only em local, maxAge=2d)
6. Response: `{ message: 'Login successful' }`

## Fluxo de logout

1. `POST /v1/auth/logout`
2. Verifica a assinatura do token do cookie (RS256, chave pública própria) antes de confiar no `jti`/`exp`
3. Registra `jwt:revoked:<jti>` em Redis com TTL até a expiração do token (cap em 2 dias)
4. Clear cookie `auth_token` com as MESMAS opções do set (sem maxAge)
5. Response: `{ message: 'Logout realizado com sucesso' }`
