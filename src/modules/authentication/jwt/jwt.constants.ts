/**
 * Contrato do SSO UNIDIRECIONAL juri-api -> painel-robo (esta API).
 *
 * Esta API CONSOME tokens da juri-api (valida pela chave pública dela e resolve
 * a identidade por e-mail), mas NÃO publica mais a própria sessão para a
 * juri-api: o sentido painel-robo -> juri-api foi descontinuado. A juri-api não
 * valida mais tokens emitidos aqui.
 *
 * ATENÇÃO: os issuers são comparados caractere a caractere. Não altere
 * sem combinar com o outro lado, senão a validação cruzada quebra (401).
 */

/** issuer que ESTA API emite (claim `iss`), só para a própria sessão. */
export const SELF_ISSUER = 'painel-robo' as const;

/** issuer emitido pela juri-api. */
export const JURI_ISSUER = 'api.juri.capital' as const;

/** Algoritmo único aceito. Nunca aceitar `none` nem HS256. */
export const JWT_ALGORITHM = 'RS256' as const;

/** TTL do token e do cookie (2 dias), em segundos. Fonte única da verdade. */
export const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 2; // 172800

/**
 * Nome do cookie `auth_token` (httpOnly). Esta API:
 *  - LÊ o `auth_token` que a juri-api seta no domínio pai `.juri.capital`
 *    (SSO juri-api -> painel-robo); e
 *  - ESCREVE o `auth_token` da própria sessão (login direto) como host-only,
 *    SEM `Domain=.juri.capital`, para não vazar a sessão da robo-api para a
 *    juri-api. Mesmo nome, escopos diferentes. Ver `auth-cookie.ts`.
 */
export const AUTH_COOKIE_NAME = 'auth_token' as const;

/** Domínio do cookie compartilhado da juri-api (usado só no logout/limpeza). */
export const AUTH_COOKIE_DOMAIN = '.juri.capital' as const;
