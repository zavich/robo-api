import { ConfigService } from '@nestjs/config';
import { RoleAuditService } from './role-audit.service';

const makeUserModel = () => ({
  distinct: jest.fn(),
});

describe('RoleAuditService', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('nao loga nada quando todas as roles sao conhecidas', async () => {
    const userModel = makeUserModel();
    userModel.distinct.mockResolvedValue(['admin', 'advogado']);
    const configService = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'NODE_ENV') {
          return 'development';
        }
        return 'false';
      }),
    } as unknown as ConfigService;
    const service = new RoleAuditService(userModel as any, configService);
    const warnSpy = jest
      .spyOn<any, any>(service['logger'], 'warn')
      .mockImplementation(() => undefined);

    await service.onModuleInit();

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('loga warning quando encontra role desconhecida', async () => {
    const userModel = makeUserModel();
    userModel.distinct.mockResolvedValue(['admin', 'manager']);
    const configService = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'NODE_ENV') {
          return 'development';
        }
        return 'false';
      }),
    } as unknown as ConfigService;
    const service = new RoleAuditService(userModel as any, configService);
    const warnSpy = jest
      .spyOn<any, any>(service['logger'], 'warn')
      .mockImplementation(() => undefined);

    await service.onModuleInit();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('manager'),
    );
  });

  it('falha o bootstrap quando AUTH_STRICT_ROLE_AUDIT=true e ha role desconhecida', async () => {
    const userModel = makeUserModel();
    userModel.distinct.mockResolvedValue(['consultor']);
    const configService = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'NODE_ENV') {
          return 'production';
        }
        if (key === 'AUTH_STRICT_ROLE_AUDIT') {
          return 'true';
        }
        return undefined;
      }),
    } as unknown as ConfigService;
    const service = new RoleAuditService(userModel as any, configService);

    await expect(service.onModuleInit()).rejects.toThrow(
      'Roles nao mapeadas encontradas na base: consultor',
    );
  });
});
