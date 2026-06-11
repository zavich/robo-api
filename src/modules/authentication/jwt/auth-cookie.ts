import type { CookieOptions } from 'express';
import { AUTH_COOKIE_DOMAIN, TOKEN_TTL_SECONDS } from './jwt.constants';

/**
 * Opções de cookie da autenticação. SSO unidirecional juri-api -> painel-robo:
 *  - `robo_auth_token` (sessão PRÓPRIA): escrito no login direto como HOST-ONLY
 *    — sem `Domain=.juri.capital` — para que a sessão da robo-api nunca seja
 *    enviada à juri-api (o sentido painel-robo -> juri-api foi descontinuado).
 *  - `auth_token` (COMPARTILHADO da juri-api): esta API só o lê e o limpa no
 *    logout; ver `sharedCookieClearOptions`.
 *
 * Em produção usa Secure + SameSite=Lax (exige HTTPS). Em local
 * (NODE_ENV=local) o Secure não funciona sobre http, então cai para não seguro.
 *
 * O clearCookie precisa das MESMAS opções do set (sem maxAge), senão o browser
 * não casa o cookie e ele fica órfão.
 */
function isProd(): boolean {
  return process.env.NODE_ENV !== 'local';
}

/**
 * Opções do cookie da sessão PRÓPRIA (`robo_auth_token`, host-only). Nunca seta
 * `domain`, então o cookie fica restrito ao host desta API e não vaza para a
 * juri-api.
 */
export function selfCookieBaseOptions(): CookieOptions {
  return {
    httpOnly: true,
    path: '/',
    // Secure exige HTTPS; em local (http) precisa ficar false senão o cookie
    // não é setado/enviado.
    secure: isProd(),
    sameSite: 'lax',
  };
}

export function selfCookieSetOptions(): CookieOptions {
  return {
    ...selfCookieBaseOptions(),
    maxAge: TOKEN_TTL_SECONDS * 1000, // express espera ms
  };
}

/**
 * Domínio do cookie COMPARTILHADO da juri-api. Sobrescrevível por env
 * (AUTH_COOKIE_DOMAIN) para testar SSO local com subdomínios fake
 * (ex.: `.juri.local`). Sem env: produção usa `.juri.capital`; local fica
 * host-only.
 */
function sharedCookieDomain(): string | undefined {
  const fromEnv = process.env.AUTH_COOKIE_DOMAIN?.trim();
  if (fromEnv) return fromEnv;
  return isProd() ? AUTH_COOKIE_DOMAIN : undefined;
}

/**
 * Opções para LIMPAR o cookie compartilhado `auth_token` (`.juri.capital`)
 * setado pela juri-api. Usado só no logout (single logout): esta API não seta
 * mais esse cookie, mas precisa conseguir removê-lo ao deslogar.
 */
export function sharedCookieClearOptions(): CookieOptions {
  const domain = sharedCookieDomain();
  return {
    httpOnly: true,
    path: '/',
    secure: isProd(),
    sameSite: 'lax',
    ...(domain ? { domain } : {}),
  };
}
