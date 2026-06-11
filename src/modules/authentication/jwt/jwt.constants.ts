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
 * Cookie compartilhado emitido pela juri-api no domínio pai `.juri.capital`.
 * Esta API só o LÊ (SSO juri-api -> painel-robo) e o LIMPA no logout; nunca o
 * escreve.
 */
export const AUTH_COOKIE_NAME = 'auth_token' as const;

/**
 * Cookie da sessão PRÓPRIA desta API (login direto no painel-robo). Host-only
 * (sem `Domain=.juri.capital`), para não vazar a sessão para a juri-api. Nome
 * distinto do `auth_token` de propósito: evita a colisão do cookie-parser
 * (dois cookies de mesmo nome colapsariam para um, de forma não determinística).
 * Ver `auth-cookie.ts`.
 */
export const SELF_COOKIE_NAME = 'robo_auth_token' as const;

/** Domínio do cookie compartilhado da juri-api (usado só no logout/limpeza). */
export const AUTH_COOKIE_DOMAIN = '.juri.capital' as const;
