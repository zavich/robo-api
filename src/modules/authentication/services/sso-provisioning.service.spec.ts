import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { SsoProvisioningService } from './sso-provisioning.service';
import { User, UserRole } from '../../user/schema/user.schema';
import type { iJwtPayload } from '../guards/jwt-strategy.guard';

const basePayload = (
  overrides: Partial<iJwtPayload['user']> = {},
): iJwtPayload => ({
  sub: 'juri-id-123',
  iss: 'api.juri.capital',
  user: {
    email: 'Pedro.Ribeiro@JURI.capital',
    nome: 'Pedro',
    sobreNome: 'Ribeiro',
    cargo: 'advogado',
    ...overrides,
  },
});

describe('SsoProvisioningService', () => {
  let service: SsoProvisioningService;
  let findOneAndUpdate: jest.Mock;

  beforeEach(async () => {
    // Devolve o que foi pedido para inserção, simulando o doc upsertado.
    findOneAndUpdate = jest.fn((_filter, update) => ({
      ...update.$setOnInsert,
      _id: 'new-id',
    }));

    const moduleRef = await Test.createTestingModule({
      providers: [
        SsoProvisioningService,
        { provide: getModelToken(User.name), useValue: { findOneAndUpdate } },
      ],
    }).compile();

    service = moduleRef.get(SsoProvisioningService);
  });

  it('normaliza o e-mail (lowercase + trim) ao criar', async () => {
    await service.provisionFromSso(basePayload({ email: '  Foo@Bar.COM ' }));
    const [filter, update] = findOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({ email: 'foo@bar.com' });
    expect(update.$setOnInsert.email).toBe('foo@bar.com');
  });

  it('mapeia cargo "admin" (case-insensitive) para role admin', async () => {
    await service.provisionFromSso(basePayload({ cargo: 'ADMIN' }));
    expect(findOneAndUpdate.mock.calls[0][1].$setOnInsert.role).toBe(
      UserRole.ADMIN,
    );
  });

  it('mapeia qualquer outro cargo para advogado (mínimo privilégio)', async () => {
    await service.provisionFromSso(basePayload({ cargo: 'gerente' }));
    expect(findOneAndUpdate.mock.calls[0][1].$setOnInsert.role).toBe(
      UserRole.USER,
    );
  });

  it('cargo ausente cai em advogado', async () => {
    await service.provisionFromSso(basePayload({ cargo: undefined }));
    expect(findOneAndUpdate.mock.calls[0][1].$setOnInsert.role).toBe(
      UserRole.USER,
    );
  });

  it('monta o nome a partir de nome + sobreNome', async () => {
    await service.provisionFromSso(basePayload());
    expect(findOneAndUpdate.mock.calls[0][1].$setOnInsert.name).toBe(
      'Pedro Ribeiro',
    );
  });

  it('sem nome no payload, usa a parte local do e-mail', async () => {
    await service.provisionFromSso(
      basePayload({
        nome: undefined,
        sobreNome: undefined,
        email: 'jdoe@x.com',
      }),
    );
    expect(findOneAndUpdate.mock.calls[0][1].$setOnInsert.name).toBe('jdoe');
  });

  it('cria como ativo e com senha hasheada (nunca em claro)', async () => {
    await service.provisionFromSso(basePayload());
    const { $setOnInsert } = findOneAndUpdate.mock.calls[0][1];
    expect($setOnInsert.isActive).toBe(true);
    expect(typeof $setOnInsert.password).toBe('string');
    expect($setOnInsert.password).toMatch(/^\$2[aby]\$/); // hash bcrypt
  });

  it('usa upsert idempotente (não sobrescreve registro existente)', async () => {
    await service.provisionFromSso(basePayload());
    const [, update, options] = findOneAndUpdate.mock.calls[0];
    expect(update).toHaveProperty('$setOnInsert');
    expect(update).not.toHaveProperty('$set');
    expect(options).toMatchObject({ upsert: true, new: true });
  });
});
