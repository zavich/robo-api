import { z } from 'zod';

export const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  PORT: z.coerce.number().optional().default(3333),
  BASE_URL_EMPRESAQUI: z.string().url(),
  EMPRESAQUI_API_KEY: z.string(),
  // SSO RS256 (ver src/modules/authentication/jwt)
  JWT_PRIVATE_KEY_PAINEL_ROBO: z.string().optional(), // privada do painel-robo (assina)
  JWT_PUBLIC_KEY_PAINEL_ROBO: z.string().optional(), // pública do painel-robo (valida tokens próprios)
  JWT_PUBLIC_KEY_JURI_API: z.string().optional(), // pública da juri-api (valida tokens dela)
  // domínio do cookie auth_token (sobrescreve o default; usado p/ SSO local)
  AUTH_COOKIE_DOMAIN: z.string().optional(),
  // origens extras de CORS p/ dev/local (comma-separated); vazio em produção
  CORS_EXTRA_ORIGINS: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;
