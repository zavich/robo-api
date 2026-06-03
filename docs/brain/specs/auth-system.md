# Auth System

## JWT

### Estrutura do payload

```typescript
{ identifier: string (email), sub: string (user ObjectId), jti: string, permissions: string[] }
```

### Configuracao

- **Secret**: `process.env.JWT_SECRET_KEY` (via ConfigService)
- **Storage**: cookie httpOnly `prosolutti_accessToken`
- **Expiry**: 7 dias (maxAge no Set-Cookie)
- **Extracao**: do cookie (nao do header Authorization)

### Validacao (Passport JWT Strategy)

Arquivo: `src/modules/authentication/guards/jwt-strategy.guard.ts`

1. Extrai JWT do cookie `prosolutti_accessToken`
2. `userModel.findOne({ _id: payload.sub })`
3. Se nao encontrado: `UnauthorizedException`
4. Verifica se o `jti` nao esta revogado em Redis
5. Seta `req.user` = User document com `permissions` resolvidas no backend

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
4. JWT gerado com `{ identifier: email, sub: user._id, jti, permissions }`
5. Set-Cookie `prosolutti_accessToken` (httpOnly, secure em production, sameSite=lax, maxAge=7d)
6. Response: `{ message: 'Login successful' }`

## Fluxo de logout

1. `POST /v1/auth/logout`
2. Registra `jwt:revoked:<jti>` em Redis com TTL ate a expiracao do token
3. Clear cookie `prosolutti_accessToken` com `sameSite=lax`
4. Response: `{ message: 'Logout realizado com sucesso' }`
