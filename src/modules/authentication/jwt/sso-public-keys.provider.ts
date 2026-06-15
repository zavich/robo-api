import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { buildPublicKeyMap } from './jwt-keys';
import { JURI_ISSUER, SELF_ISSUER } from './jwt.constants';

/** Token de injeção do mapa { issuer -> chave pública } do SSO. */
export const SSO_PUBLIC_KEYS = 'SSO_PUBLIC_KEYS';

export type SsoPublicKeys = Record<string, string>;

/**
 * Fonte ÚNICA das chaves públicas de validação RS256 do SSO. Carrega o mapa das
 * envs e falha cedo se faltar alguma chave (fora de NODE_ENV=test), em vez de
 * cada consumidor (JwtStrategy, verificador do bootstrap) montar e validar o
 * próprio mapa. As duas chaves são obrigatórias: a própria
 * (`JWT_PUBLIC_KEY_ROBO_API`) valida a sessão local do painel-robo; a da juri-api
 * (`JWT_PUBLIC_KEY_JURI_API`) valida o SSO juri-api -> painel-robo.
 */
export const ssoPublicKeysProvider: Provider = {
  provide: SSO_PUBLIC_KEYS,
  inject: [ConfigService],
  useFactory: (config: ConfigService): SsoPublicKeys => {
    const publicKeys = buildPublicKeyMap({
      publicKeyPainelRobo: config.get<string>('JWT_PUBLIC_KEY_ROBO_API'),
      publicKeyApi: config.get<string>('JWT_PUBLIC_KEY_JURI_API'),
    });

    const missing: string[] = [];
    if (!publicKeys[SELF_ISSUER]) missing.push('JWT_PUBLIC_KEY_ROBO_API');
    if (!publicKeys[JURI_ISSUER]) missing.push('JWT_PUBLIC_KEY_JURI_API');
    if (missing.length && process.env.NODE_ENV !== 'test') {
      throw new Error(
        `Chave(s) pública(s) de SSO ausente(s): ${missing.join(', ')}. ` +
          'Sem elas a validação de tokens RS256 retorna 401. Configure a(s) env(s).',
      );
    }

    return publicKeys;
  },
};
