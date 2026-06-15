import { UnauthorizedException } from '@nestjs/common';
import { AuthenticationController } from './authentication.controller';
import {
  AUTH_COOKIE_NAME,
  AUTH_COOKIE_DOMAIN,
  JURI_ISSUER,
  SELF_COOKIE_NAME,
} from './jwt/jwt.constants';

const makeLoginService = () => ({ execute: jest.fn() });
const makeSignUpService = () => ({ createUser: jest.fn() });
const makeRedis = () => ({ set: jest.fn(), exists: jest.fn() });
const makeJwtService = () => ({ verify: jest.fn() });
const makeSsoTokenVerifier = () => ({ verify: jest.fn() });
const makeSsoProvisioning = () => ({ provisionFromSso: jest.fn() });

describe('AuthenticationController', () => {
  let controller: AuthenticationController;
  let loginService: ReturnType<typeof makeLoginService>;
  let signUpService: ReturnType<typeof makeSignUpService>;
  let redis: ReturnType<typeof makeRedis>;
  let jwtService: ReturnType<typeof makeJwtService>;
  let ssoTokenVerifier: ReturnType<typeof makeSsoTokenVerifier>;
  let ssoProvisioning: ReturnType<typeof makeSsoProvisioning>;

  const ORIGINAL_COOKIE_DOMAIN = process.env.AUTH_COOKIE_DOMAIN;

  beforeEach(() => {
    // SSO local seta AUTH_COOKIE_DOMAIN; garante default de produção nos testes.
    delete process.env.AUTH_COOKIE_DOMAIN;
    loginService = makeLoginService();
    signUpService = makeSignUpService();
    redis = makeRedis();
    jwtService = makeJwtService();
    ssoTokenVerifier = makeSsoTokenVerifier();
    ssoProvisioning = makeSsoProvisioning();
    controller = new AuthenticationController(
      loginService as never,
      signUpService as never,
      redis as never,
      jwtService as never,
      ssoTokenVerifier as never,
      ssoProvisioning as never,
    );
  });

  afterAll(() => {
    if (ORIGINAL_COOKIE_DOMAIN === undefined) {
      delete process.env.AUTH_COOKIE_DOMAIN;
    } else {
      process.env.AUTH_COOKIE_DOMAIN = ORIGINAL_COOKIE_DOMAIN;
    }
  });

  describe('login', () => {
    it('seta o robo_auth_token (host-only, sem Domain=.juri.capital)', async () => {
      loginService.execute.mockResolvedValue({ accessToken: 'jwt-token' });
      const res = { cookie: jest.fn() };

      const result = await controller.login(
        { email: 'ok@acme.com', password: 'correta' } as never,
        res as never,
      );

      expect(result).toEqual({ message: 'Login successful' });
      expect(res.cookie).toHaveBeenCalledTimes(1);
      const [name, value, options] = res.cookie.mock.calls[0];
      // nome distinto do auth_token da juri-api (evita colisão no cookie-parser)
      expect(name).toBe(SELF_COOKIE_NAME);
      expect(value).toBe('jwt-token');
      // o ponto central da mudança: a sessão própria não vaza para a juri-api
      expect(options).not.toHaveProperty('domain');
      expect(options).toMatchObject({ httpOnly: true, sameSite: 'lax' });
    });
  });

  describe('logout', () => {
    it('limpa o robo_auth_token (host-only) e o auth_token (.juri.capital)', async () => {
      const req = { cookies: {} };
      const res = { clearCookie: jest.fn() };

      const result = await controller.logout(req as never, res as never);

      expect(result).toEqual({ message: 'Logout realizado com sucesso' });
      expect(res.clearCookie).toHaveBeenCalledTimes(2);

      const calls = res.clearCookie.mock.calls;
      // sessão própria: robo_auth_token host-only (sem domain)
      const selfClear = calls.find((c) => c[0] === SELF_COOKIE_NAME);
      expect(selfClear).toBeDefined();
      expect(selfClear![1]).not.toHaveProperty('domain');
      // SSO: auth_token no domínio da juri-api (single logout)
      const sharedClear = calls.find((c) => c[0] === AUTH_COOKIE_NAME);
      expect(sharedClear).toBeDefined();
      expect(sharedClear![1].domain).toBe(AUTH_COOKIE_DOMAIN);
    });

    it('revoga o jti quando há um token próprio válido no cookie', async () => {
      const exp = Math.floor(Date.now() / 1000) + 3600;
      jwtService.verify.mockReturnValue({ jti: 'valid-jti-12345', exp });
      const req = { cookies: { [SELF_COOKIE_NAME]: 'own-token' } };
      const res = { clearCookie: jest.fn() };

      await controller.logout(req as never, res as never);

      expect(jwtService.verify).toHaveBeenCalledWith('own-token', {
        ignoreExpiration: true,
      });
      expect(redis.set).toHaveBeenCalledWith(
        'jwt:revoked:valid-jti-12345',
        '1',
        'EX',
        expect.any(Number),
      );
    });

    it('não revoga (mas ainda limpa) se a assinatura do token próprio é inválida', async () => {
      jwtService.verify.mockImplementation(() => {
        throw new Error('invalid signature');
      });
      const req = { cookies: { [SELF_COOKIE_NAME]: 'token-malformado' } };
      const res = { clearCookie: jest.fn() };

      const result = await controller.logout(req as never, res as never);

      expect(redis.set).not.toHaveBeenCalled();
      expect(res.clearCookie).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ message: 'Logout realizado com sucesso' });
    });
  });

  describe('ssoSession (bootstrap JIT)', () => {
    const juriPayload = {
      iss: JURI_ISSUER,
      user: { email: 'pedro@juri.capital', cargo: 'admin' },
    };
    const makeUserDoc = ({ isActive = true }: { isActive?: boolean } = {}) => ({
      isActive,
      role: 'admin',
      toObject: () => ({
        _id: 'abc123',
        email: 'pedro@juri.capital',
        name: 'Pedro Ribeiro',
        role: 'admin',
        password: 'hash-secreto',
        isActive,
      }),
    });

    it('verifica o token, provisiona e retorna o profile (sem password)', async () => {
      ssoTokenVerifier.verify.mockReturnValue(juriPayload);
      ssoProvisioning.provisionFromSso.mockResolvedValue(makeUserDoc());
      const req = { headers: {}, cookies: { [AUTH_COOKIE_NAME]: 'juri-jwt' } };

      const result = await controller.ssoSession(req as never);

      expect(ssoTokenVerifier.verify).toHaveBeenCalledWith('juri-jwt');
      expect(ssoProvisioning.provisionFromSso).toHaveBeenCalledWith(juriPayload);
      expect(result).not.toHaveProperty('password');
      expect(result.id).toBe('abc123');
      // admin deriva as permissões do role local
      expect(result.permissions).toContain('user_management');
    });

    it('401 quando não há token na requisição', async () => {
      const req = { headers: {}, cookies: {} };
      await expect(controller.ssoSession(req as never)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(ssoProvisioning.provisionFromSso).not.toHaveBeenCalled();
    });

    it('401 e NÃO provisiona quando o token não é da juri-api', async () => {
      ssoTokenVerifier.verify.mockReturnValue({
        iss: 'painel-robo',
        user: { email: 'x@y.com' },
      });
      const req = { headers: {}, cookies: { [SELF_COOKIE_NAME]: 'own-jwt' } };

      await expect(controller.ssoSession(req as never)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(ssoProvisioning.provisionFromSso).not.toHaveBeenCalled();
    });

    it('401 quando a conta provisionada está inativa', async () => {
      ssoTokenVerifier.verify.mockReturnValue(juriPayload);
      ssoProvisioning.provisionFromSso.mockResolvedValue(
        makeUserDoc({ isActive: false }),
      );
      const req = { headers: {}, cookies: { [AUTH_COOKIE_NAME]: 'juri-jwt' } };

      await expect(controller.ssoSession(req as never)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });
});
