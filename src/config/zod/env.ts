import { z } from 'zod';

export const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  PORT: z.coerce.number().optional().default(3333),
  BASE_URL_EMPRESAQUI: z.string().url(),
  EMPRESAQUI_API_KEY: z.string(),
  // "local" relaxa cookie/CORS p/ dev e controla o envFilePath (app.module)
  NODE_ENV: z.string().optional(),
  // != "production" habilita o Bull Board (main.ts)
  ENVIRONMENT: z.string().optional(),
  // SSO RS256 (ver src/modules/authentication/jwt)
  JWT_PRIVATE_KEY_ROBO_API: z.string().optional(), // privada do painel-robo (assina)
  JWT_PUBLIC_KEY_ROBO_API: z.string().optional(), // pública do painel-robo (valida tokens próprios)
  JWT_PUBLIC_KEY_JURI_API: z.string().optional(), // pública da juri-api (valida tokens dela)
  // domínio do cookie auth_token (sobrescreve o default; usado p/ SSO local)
  AUTH_COOKIE_DOMAIN: z.string().optional(),
  // origens extras de CORS p/ dev/local (comma-separated); vazio em produção
  CORS_EXTRA_ORIGINS: z.string().optional(),
  // sobrescreve a lista base de CORS (comma-separated); ver main.ts
  CORS_ORIGINS: z.string().optional(),
  // auditoria de roles no bootstrap (ver RoleAuditService)
  AUTH_STRICT_ROLE_AUDIT: z.string().optional(),
  AUTH_AUDIT_SKIP: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;
