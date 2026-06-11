import {
  selfCookieBaseOptions,
  selfCookieSetOptions,
  sharedCookieClearOptions,
} from './auth-cookie';
import { AUTH_COOKIE_DOMAIN, TOKEN_TTL_SECONDS } from './jwt.constants';

describe('auth-cookie', () => {
  const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
  const ORIGINAL_COOKIE_DOMAIN = process.env.AUTH_COOKIE_DOMAIN;

  afterEach(() => {
    // Restaurar com `delete` quando original era undefined: atribuir undefined
    // viraria a string 'undefined' em process.env e vazaria estado entre testes.
    if (ORIGINAL_NODE_ENV === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = ORIGINAL_NODE_ENV;
    }
    if (ORIGINAL_COOKIE_DOMAIN === undefined) {
      delete process.env.AUTH_COOKIE_DOMAIN;
    } else {
      process.env.AUTH_COOKIE_DOMAIN = ORIGINAL_COOKIE_DOMAIN;
    }
  });

  describe('cookie da sessão própria (host-only)', () => {
    it('NUNCA seta domain — a sessão não pode vazar para a juri-api', () => {
      // produção
      process.env.NODE_ENV = 'production';
      process.env.AUTH_COOKIE_DOMAIN = '.juri.capital'; // mesmo com env, ignora
      expect(selfCookieBaseOptions()).not.toHaveProperty('domain');
      expect(selfCookieSetOptions()).not.toHaveProperty('domain');

      // local
      process.env.NODE_ENV = 'local';
      expect(selfCookieBaseOptions()).not.toHaveProperty('domain');
      expect(selfCookieSetOptions()).not.toHaveProperty('domain');
    });

    it('é httpOnly, path / e SameSite=Lax', () => {
      process.env.NODE_ENV = 'production';
      expect(selfCookieBaseOptions()).toMatchObject({
        httpOnly: true,
        path: '/',
        sameSite: 'lax',
      });
    });

    it('Secure só fora de NODE_ENV=local', () => {
      process.env.NODE_ENV = 'production';
      expect(selfCookieBaseOptions().secure).toBe(true);
      process.env.NODE_ENV = 'local';
      expect(selfCookieBaseOptions().secure).toBe(false);
    });

    it('o set adiciona maxAge (em ms); o base não tem maxAge', () => {
      expect(selfCookieSetOptions().maxAge).toBe(TOKEN_TTL_SECONDS * 1000);
      expect(selfCookieBaseOptions()).not.toHaveProperty('maxAge');
    });
  });

  describe('limpeza do cookie compartilhado da juri-api (logout)', () => {
    it('usa o domínio .juri.capital em produção', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.AUTH_COOKIE_DOMAIN;
      expect(sharedCookieClearOptions()).toMatchObject({
        domain: AUTH_COOKIE_DOMAIN,
        httpOnly: true,
        path: '/',
        sameSite: 'lax',
        secure: true,
      });
    });

    it('respeita AUTH_COOKIE_DOMAIN (ex.: SSO local com subdomínios fake)', () => {
      process.env.NODE_ENV = 'local';
      process.env.AUTH_COOKIE_DOMAIN = '.juri.local';
      expect(sharedCookieClearOptions().domain).toBe('.juri.local');
    });

    it('fica host-only em local sem AUTH_COOKIE_DOMAIN', () => {
      process.env.NODE_ENV = 'local';
      delete process.env.AUTH_COOKIE_DOMAIN;
      expect(sharedCookieClearOptions()).not.toHaveProperty('domain');
    });
  });
});
