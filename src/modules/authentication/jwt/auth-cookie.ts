import type { CookieOptions } from 'express';
import {
  AUTH_COOKIE_DOMAIN,
  TOKEN_TTL_SECONDS,
} from './jwt.constants';

/**
 * Opções do cookie `auth_token` compartilhado.
 *
 * Em produção: Domain=.juri.capital + Secure + SameSite=Lax (exige HTTPS) para
 * o SSO funcionar entre os subdomínios. Em local (NODE_ENV=local) o domínio pai
 * e o Secure não funcionam sobre http://localhost, então caem para um cookie
 * host-only não seguro.
 *
 * As MESMAS opções (sem maxAge) precisam ser usadas no clearCookie do logout,
 * senão o browser não casa o cookie e ele fica órfão.
 */
function isProd(): boolean {
  return process.env.NODE_ENV !== 'local';
}

/**
 * Domínio do cookie. Pode ser sobrescrito por env (AUTH_COOKIE_DOMAIN) para
 * testar SSO local com subdomínios fake (ex.: `.juri.local`). Sem env: produção
 * usa `.juri.capital`; local fica host-only (sem compartilhar entre subdomínios).
 */
function cookieDomain(): string | undefined {
  const fromEnv = process.env.AUTH_COOKIE_DOMAIN?.trim();
  if (fromEnv) return fromEnv;
  return isProd() ? AUTH_COOKIE_DOMAIN : undefined;
}

export function authCookieBaseOptions(): CookieOptions {
  const domain = cookieDomain();
  return {
    httpOnly: true,
    path: '/',
    // Secure exige HTTPS; em local (http) precisa ficar false senão o cookie
    // não é setado/enviado.
    secure: isProd(),
    sameSite: 'lax',
    ...(domain ? { domain } : {}),
  };
}

export function authCookieSetOptions(): CookieOptions {
  return {
    ...authCookieBaseOptions(),
    maxAge: TOKEN_TTL_SECONDS * 1000, // express espera ms
  };
}
