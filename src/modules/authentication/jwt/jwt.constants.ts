/**
 * Contrato do SSO bidirecional entre painel-robo (esta API) e juri-api.
 * Ver docs/SSO-PAINEL-ROBO-HANDOFF.md (na juri-api).
 *
 * ATENÇÃO: os issuers são comparados caractere a caractere. Não altere
 * sem combinar com o outro lado, senão a validação cruzada quebra (401).
 */

/** issuer que ESTA API emite (claim `iss`). */
export const SELF_ISSUER = 'painel-robo' as const;

/** issuer emitido pela juri-api. */
export const JURI_ISSUER = 'api.juri.capital' as const;

/** Algoritmo único aceito. Nunca aceitar `none` nem HS256. */
export const JWT_ALGORITHM = 'RS256' as const;

/** TTL do token e do cookie (2 dias), em segundos. Fonte única da verdade. */
export const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 2; // 172800

/** Nome do cookie compartilhado no domínio pai `.juri.capital`. */
export const AUTH_COOKIE_NAME = 'auth_token' as const;

/** Domínio do cookie compartilhado em produção. */
export const AUTH_COOKIE_DOMAIN = '.juri.capital' as const;
