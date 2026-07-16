import { BadRequestException } from '@nestjs/common';
import { FindProcessoService } from './find-processo.service';
import { redisKeyForProcesso } from './cache-processo-to-redis.service';
import { Root } from 'src/modules/process/interfaces/process.interface';

const numeroCnj = '1000580-10.2023.5.02.0492';

const makeComunicacaoSpotBody = (overrides: Partial<Root> = {}): Root =>
  ({
    numero_processo: numeroCnj,
    status: 'SUCESSO',
    tribunal: { sigla: 'TRT2' } as any,
    webhookId: 'wh-1',
    resposta: {
      instancias: [],
      message: '',
      numero_unico: numeroCnj,
      origem: 'TRT2',
    },
    created_at: { date: '', timezone: '', timezone_type: 3 },
    enviar_callback: '',
    link_api: '',
    motivo_erro: null,
    status_callback: null,
    tipo: '',
    opcoes: {},
    valor: '',
    event: '',
    ...overrides,
  }) as Root;

describe('FindProcessoService', () => {
  let athenaQueryService: { query: jest.Mock };
  let fetchComunicacaoSpotService: { execute: jest.Mock };
  let redis: { get: jest.Mock; set: jest.Mock; del: jest.Mock };
  let service: FindProcessoService;

  beforeEach(() => {
    athenaQueryService = { query: jest.fn() };
    fetchComunicacaoSpotService = {
      execute: jest.fn().mockResolvedValue(null),
    };
    redis = {
      get: jest.fn(),
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
    };
    service = new FindProcessoService(
      athenaQueryService as any,
      fetchComunicacaoSpotService as any,
      redis as any,
    );
  });

  it('lança BadRequestException pra número de CNJ inválido', async () => {
    await expect(service.execute('invalido')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(redis.get).not.toHaveBeenCalled();
  });

  it('não consulta nada quando não há cache e o Athena não tem o processo', async () => {
    redis.get.mockResolvedValue(null);
    athenaQueryService.query.mockResolvedValue([]);

    const result = await service.execute(numeroCnj);

    expect(athenaQueryService.query).toHaveBeenCalled();
    expect(result).toBeNull();
    expect(redis.del).not.toHaveBeenCalled();
  });

  it('cai pro Athena quando o cache no Redis está corrompido', async () => {
    redis.get.mockResolvedValue('{ json invalido');
    athenaQueryService.query.mockResolvedValue([]);

    const result = await service.execute(numeroCnj);

    expect(athenaQueryService.query).toHaveBeenCalled();
    expect(result).toBeNull();
  });

  it('devolve o cache do Redis mesmo quando o Athena tem dado mais novo — Athena nunca sobrescreve dado real', async () => {
    const cached = {
      cnjNumber: numeroCnj,
      statusColeta: 'SUCESSO',
      enriquecidoEm: '2026-07-06T19:36:26.000Z',
    };
    redis.get.mockResolvedValue(JSON.stringify(cached));

    const result = await service.execute(numeroCnj);

    expect(result).toEqual(cached);
    expect(redis.del).not.toHaveBeenCalled();
    // Athena nem precisa ser consultado quando já há cache — evita gasto à toa.
    expect(athenaQueryService.query).not.toHaveBeenCalled();
  });

  it('não consulta comunicacao-spot quando já há cache no Redis', async () => {
    const cached = {
      cnjNumber: numeroCnj,
      statusColeta: 'SUCESSO',
      enriquecidoEm: '2026-07-06T19:36:26.000Z',
    };
    redis.get.mockResolvedValue(JSON.stringify(cached));

    await service.execute(numeroCnj);

    expect(fetchComunicacaoSpotService.execute).not.toHaveBeenCalled();
  });

  it('usa o JSON de comunicacao-spot quando não há cache no Redis e ele tem dado real', async () => {
    redis.get.mockResolvedValue(null);
    athenaQueryService.query.mockResolvedValue([]);
    fetchComunicacaoSpotService.execute.mockResolvedValue(
      makeComunicacaoSpotBody({
        resposta: {
          instancias: [
            {
              id: 1,
              instancia: '1',
              partes: [],
              movimentacoes: [],
            } as any,
          ],
          message: '',
          numero_unico: numeroCnj,
          origem: 'TRT2',
        },
      }),
    );

    const result = await service.execute(numeroCnj);

    expect(result.cnjNumber).toBe(numeroCnj);
    expect(result.statusColeta).toBe('SUCESSO');
    // Repopula o cache no Redis pra próxima leitura não precisar ir no S3 de novo.
    expect(redis.set).toHaveBeenCalledWith(
      redisKeyForProcesso(numeroCnj),
      expect.any(String),
      'EX',
      expect.any(Number),
    );
  });

  it('ignora comunicacao-spot quando só tem o marcador BUSCANDO (sem instâncias) e cai pro Athena', async () => {
    redis.get.mockResolvedValue(null);
    athenaQueryService.query.mockResolvedValue([]);
    fetchComunicacaoSpotService.execute.mockResolvedValue(
      makeComunicacaoSpotBody({ status: 'BUSCANDO' }), // resposta.instancias: []
    );

    const result = await service.execute(numeroCnj);

    expect(result).toBeNull();
    expect(redis.set).not.toHaveBeenCalled();
  });
});
