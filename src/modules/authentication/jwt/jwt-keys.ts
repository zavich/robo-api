import { JURI_ISSUER, SELF_ISSUER } from './jwt.constants';

/**
 * Chaves PEM costumam ser guardadas em env/cofre numa única linha com `\n`
 * literais. Desescapa para o formato multilinha que o crypto espera.
 */
export function normalizePem(raw?: string): string {
  if (!raw) return '';
  return raw.replace(/\\n/g, '\n').trim();
}

/**
 * Lê o claim `iss` de um JWT SEM verificar a assinatura (só para decidir
 * qual chave pública usar na verificação real). Decodifica o payload manualmente
 * (base64url) para não depender de libs externas.
 */
export function readIssuer(token: string): string | undefined {
  try {
    const payloadSegment = token.split('.')[1];
    if (!payloadSegment) return undefined;
    const json = Buffer.from(payloadSegment, 'base64url').toString('utf8');
    const payload = JSON.parse(json) as { iss?: string };
    return payload.iss;
  } catch {
    return undefined;
  }
}

/**
 * Monta o mapa { issuer -> chave pública } a partir das envs.
 * Cada serviço valida tokens de qualquer emissor conhecido escolhendo a
 * chave pública pelo `iss`. Emissor sem chave configurada não entra no mapa
 * (token desse emissor será rejeitado).
 */
export function buildPublicKeyMap(env: {
  publicKeyPainelRobo?: string;
  publicKeyApi?: string;
}): Record<string, string> {
  const map: Record<string, string> = {};

  const pubRobo = normalizePem(env.publicKeyPainelRobo);
  if (pubRobo) map[SELF_ISSUER] = pubRobo;

  const pubApi = normalizePem(env.publicKeyApi);
  if (pubApi) map[JURI_ISSUER] = pubApi;

  return map;
}
