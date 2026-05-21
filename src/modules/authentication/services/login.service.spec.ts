import { HttpException, UnauthorizedException } from '@nestjs/common';
import { LoginService } from './login.service';

const makeUserModel = () => ({
  findOne: jest.fn(),
});

const makeJwtService = () => ({
  sign: jest.fn(),
});

const makeRedis = () => ({
  del: jest.fn(),
  exists: jest.fn(),
  expire: jest.fn(),
  incr: jest.fn(),
  set: jest.fn(),
  ttl: jest.fn(),
});

describe('LoginService', () => {
  let service: LoginService;
  let userModel: ReturnType<typeof makeUserModel>;
  let jwtService: ReturnType<typeof makeJwtService>;
  let redis: ReturnType<typeof makeRedis>;

  beforeEach(() => {
    jest.restoreAllMocks();
    userModel = makeUserModel();
    jwtService = makeJwtService();
    redis = makeRedis();

    service = new LoginService(
      userModel as any,
      jwtService as any,
      redis as any,
    );
  });

  it('rejeita email nao autorizado', async () => {
    redis.exists.mockResolvedValue(0);
    redis.incr.mockResolvedValue(1);
    userModel.findOne.mockResolvedValue(null);

    await expect(
      service.execute({ email: 'nao-autorizado@acme.com' } as any),
    ).rejects.toThrow(new UnauthorizedException('E-mail não autorizado'));

    expect(redis.expire).toHaveBeenCalledWith(
      'login:failed:nao-autorizado@acme.com',
      30 * 60,
    );
  });

  it('rejeita conta desativada', async () => {
    redis.exists.mockResolvedValue(0);
    userModel.findOne.mockResolvedValue({
      email: 'desativado@acme.com',
      isActive: false,
    });

    await expect(
      service.execute({ email: 'desativado@acme.com' } as any),
    ).rejects.toThrow(new UnauthorizedException('Conta desativada'));
  });

  it('aplica lockout apos 5 tentativas falhas', async () => {
    redis.exists.mockResolvedValue(0);
    redis.incr.mockResolvedValue(5);
    userModel.findOne.mockResolvedValue(null);

    await expect(
      service.execute({ email: 'lock@acme.com' } as any),
    ).rejects.toThrow(UnauthorizedException);

    expect(redis.set).toHaveBeenCalledWith(
      'login:lock:lock@acme.com',
      '1',
      'EX',
      30 * 60,
    );
    expect(redis.del).toHaveBeenCalledWith('login:failed:lock@acme.com');
  });

  it('retorna 429 quando ja esta em lockout', async () => {
    redis.exists.mockResolvedValue(1);
    redis.ttl.mockResolvedValue(1200);

    await expect(
      service.execute({ email: 'lock@acme.com' } as any),
    ).rejects.toThrow(HttpException);
  });

  it('gera token no fluxo de sucesso', async () => {
    redis.exists.mockResolvedValue(0);
    userModel.findOne.mockResolvedValue({
      _id: 'user-1',
      email: 'ok@acme.com',
      isActive: true,
      role: 'admin',
    });
    jwtService.sign.mockReturnValue('jwt-token');

    const result = await service.execute({ email: 'ok@acme.com' } as any);

    expect(redis.del).toHaveBeenCalledWith('login:failed:ok@acme.com');
    expect(jwtService.sign).toHaveBeenCalledWith(
      expect.objectContaining({
        identifier: 'ok@acme.com',
        sub: 'user-1',
        permissions: expect.arrayContaining(['change_stage', 'mass_edit']),
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        accessToken: 'jwt-token',
        user: {
          _id: 'user-1',
          email: 'ok@acme.com',
        },
      }),
    );
  });
});
