import { AuthenticationController } from './authentication.controller';
import { AUTH_COOKIE_NAME, AUTH_COOKIE_DOMAIN } from './jwt/jwt.constants';

const makeLoginService = () => ({ execute: jest.fn() });
const makeSignUpService = () => ({ createUser: jest.fn() });
const makeRedis = () => ({ set: jest.fn(), exists: jest.fn() });
const makeJwtService = () => ({ verify: jest.fn() });

describe('AuthenticationController', () => {
  let controller: AuthenticationController;
  let loginService: ReturnType<typeof makeLoginService>;
  let signUpService: ReturnType<typeof makeSignUpService>;
  let redis: ReturnType<typeof makeRedis>;
  let jwtService: ReturnType<typeof makeJwtService>;

  const ORIGINAL_COOKIE_DOMAIN = process.env.AUTH_COOKIE_DOMAIN;

  beforeEach(() => {
    // SSO local seta AUTH_COOKIE_DOMAIN; garante default de produção nos testes.
    delete process.env.AUTH_COOKIE_DOMAIN;
    loginService = makeLoginService();
    signUpService = makeSignUpService();
    redis = makeRedis();
    jwtService = makeJwtService();
    controller = new AuthenticationController(
      loginService as never,
      signUpService as never,
      redis as never,
      jwtService as never,
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
    it('seta o auth_token como HOST-ONLY (sem Domain=.juri.capital)', async () => {
      loginService.execute.mockResolvedValue({ accessToken: 'jwt-token' });
      const res = { cookie: jest.fn() };

      const result = await controller.login(
        { email: 'ok@acme.com', password: 'correta' } as never,
        res as never,
      );

      expect(result).toEqual({ message: 'Login successful' });
      expect(res.cookie).toHaveBeenCalledTimes(1);
      const [name, value, options] = res.cookie.mock.calls[0];
      expect(name).toBe(AUTH_COOKIE_NAME);
      expect(value).toBe('jwt-token');
      // o ponto central da mudança: a sessão própria não vaza para a juri-api
      expect(options).not.toHaveProperty('domain');
      expect(options).toMatchObject({ httpOnly: true, sameSite: 'lax' });
    });
  });

  describe('logout', () => {
    it('limpa o auth_token nos dois escopos: host-only e .juri.capital', async () => {
      const req = { cookies: {} };
      const res = { clearCookie: jest.fn() };

      const result = await controller.logout(req as never, res as never);

      expect(result).toEqual({ message: 'Logout realizado com sucesso' });
      expect(res.clearCookie).toHaveBeenCalledTimes(2);

      const optionsByCall = res.clearCookie.mock.calls.map((c) => c[1]);
      // todas as chamadas limpam o mesmo nome de cookie
      res.clearCookie.mock.calls.forEach((c) =>
        expect(c[0]).toBe(AUTH_COOKIE_NAME),
      );
      // um clear host-only (sem domain) e um clear no domínio da juri-api
      expect(optionsByCall.some((o) => !('domain' in o))).toBe(true);
      expect(optionsByCall.some((o) => o.domain === AUTH_COOKIE_DOMAIN)).toBe(
        true,
      );
    });

    it('revoga o jti quando há um token próprio válido no cookie', async () => {
      const exp = Math.floor(Date.now() / 1000) + 3600;
      jwtService.verify.mockReturnValue({ jti: 'valid-jti-12345', exp });
      const req = { cookies: { [AUTH_COOKIE_NAME]: 'own-token' } };
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

    it('não revoga (mas ainda limpa) se a assinatura do token é inválida', async () => {
      jwtService.verify.mockImplementation(() => {
        throw new Error('invalid signature');
      });
      const req = { cookies: { [AUTH_COOKIE_NAME]: 'token-de-outro-emissor' } };
      const res = { clearCookie: jest.fn() };

      const result = await controller.logout(req as never, res as never);

      expect(redis.set).not.toHaveBeenCalled();
      expect(res.clearCookie).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ message: 'Logout realizado com sucesso' });
    });
  });
});
