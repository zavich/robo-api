import type { Request } from 'express';
import { AUTH_COOKIE_NAME, SELF_COOKIE_NAME } from './jwt.constants';

/**
 * Extrai o JWT da requisição na mesma ordem de prioridade em toda a auth:
 * header `Authorization: Bearer`, depois o cookie compartilhado da juri-api
 * (`auth_token`), depois o cookie da sessão própria (`robo_auth_token`).
 * A identidade é resolvida por e-mail na validação, independente da origem.
 */
export function extractAuthToken(req: Request): string | null {
  const authHeader = req.headers?.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice('Bearer '.length).trim() || null;
  }
  return (
    req?.cookies?.[AUTH_COOKIE_NAME] || req?.cookies?.[SELF_COOKIE_NAME] || null
  );
}
