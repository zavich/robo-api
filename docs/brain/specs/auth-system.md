# Auth System

## JWT

### Estrutura do payload

```typescript
{ identifier: string (email), sub: string (user ObjectId) }
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
4. Seta `req.user` = User document completo (incluindo password hash)

---

## Guard: ApiKeyAuthGuard

Arquivo: `src/modules/authentication/guards/apikey-auth.guard.ts`

- **Apesar do nome**: e um JWT guard (`extends AuthGuard('jwt')`)
- **Uso**: aplicado por rota/controller com `@UseGuards(ApiKeyAuthGuard)`

---

## Roles

| Role | Valor | Descricao |
|------|-------|-----------|
| ADMIN | `'admin'` | Acesso total |
| USER | `'advogado'` | Acesso limitado |

### Enforcement

- **NAO existe decorator de roles**. Verificacao e manual no service layer:
  - `CreateActivityService`: `if (user.role !== 'admin')` → `BadRequestException`
  - `ChangeStageService`: `if (user.role !== UserRole.ADMIN)` → `ForbiddenException`
- Rotas admin sao acessiveis por URL para nao-admins — a protecao e na camada de servico, nao de rota

---

## Fluxo de login

1. `POST /v1/auth/login` com `{ email, password }`
2. bcrypt.compare com hash do DB (rounds=10)
3. JWT gerado com `{ identifier: email, sub: user._id }`
4. Set-Cookie `prosolutti_accessToken` (httpOnly, secure, sameSite=none, maxAge=7d)
5. Response: `{ message: 'Login successful' }`

## Fluxo de logout

1. `POST /v1/auth/logout`
2. Clear cookie `prosolutti_accessToken`
3. Response: `{ message: 'Logout realizado com sucesso' }`
