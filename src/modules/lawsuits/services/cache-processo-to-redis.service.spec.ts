import { Root } from 'src/modules/process/interfaces/process.interface';
import {
  CacheProcessoToRedisService,
  redisKeyForProcesso,
  redisInflightKeyForProcesso,
  redisWaitersKeyForProcesso,
} from './cache-processo-to-redis.service';

const makeBody = (overrides: Partial<Root> = {}): Root =>
  ({
    numero_processo: '1000580-10.2023.5.02.0492',
    status: 'SUCESSO',
    tribunal: { sigla: 'TRT2' } as any,
    webhookId: 'wh-1',
    resposta: {
      instancias: [],
      message: '',
      numero_unico: '',
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
    id: 1,
    uuid: '',
    ...overrides,
  }) as Root;

describe('CacheProcessoToRedisService', () => {
  let redis: {
    get: jest.Mock;
    set: jest.Mock;
    smembers: jest.Mock;
    sadd: jest.Mock;
    expire: jest.Mock;
    del: jest.Mock;
  };
  let service: CacheProcessoToRedisService;

  const numeroCnj = '1000580-10.2023.5.02.0492';

  beforeEach(() => {
    redis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      smembers: jest.fn().mockResolvedValue([]),
      sadd: jest.fn().mockResolvedValue(1),
      expire: jest.fn().mockResolvedValue(1),
      del: jest.fn().mockResolvedValue(1),
    };
    service = new CacheProcessoToRedisService(redis as any);
  });

  it('não grava nada no Redis quando não há nenhum usuário aguardando (waiters vazio)', async () => {
    await service.execute(makeBody());

    expect(redis.set).not.toHaveBeenCalled();
  });

  it('não grava no Redis quando o status é NAO_ENCONTRADO e não há cache prévio pro waiter', async () => {
    redis.smembers.mockResolvedValue(['user-a']);

    await service.execute(makeBody({ status: 'NAO_ENCONTRADO' }));

    expect(redis.set).not.toHaveBeenCalled();
    expect(redis.del).toHaveBeenCalledWith(redisWaitersKeyForProcesso(numeroCnj));
    expect(redis.del).toHaveBeenCalledWith(redisInflightKeyForProcesso(numeroCnj));
  });

  it('não grava no Redis quando o status é ERRO com motivo_erro preenchido e não há cache prévio pro waiter', async () => {
    redis.smembers.mockResolvedValue(['user-a']);

    await service.execute(
      makeBody({ status: 'ERRO', motivo_erro: 'SEM_DADOS_ORGAO_ZERO' }),
    );

    expect(redis.set).not.toHaveBeenCalled();
  });

  it('atualiza só o status no Redis de cada waiter (preservando partes/movimentações/instâncias) quando ERRO chega com cache prévio real', async () => {
    redis.smembers.mockResolvedValue(['user-a', 'user-b']);
    redis.get.mockImplementation(async (key: string) => {
      if (key === redisKeyForProcesso(numeroCnj, 'user-a')) {
        return JSON.stringify({
          cnjNumber: numeroCnj,
          statusColeta: 'SINCRONIZANDO',
          enriquecidoEm: '2026-01-01 00:00:00.000',
          partes: [{ nome: 'Fulano' }],
          movimentacoes: [{ id: '1' }],
          instancias: [{ instanciaId: '1' }],
        });
      }
      return null;
    });

    await service.execute(
      makeBody({ status: 'ERRO', motivo_erro: 'SEM_DADOS_ORGAO_ZERO' }),
    );

    // Só user-a tinha cache prévio — user-b é ignorado (nada a atualizar).
    expect(redis.set).toHaveBeenCalledTimes(1);
    const [key, payload] = redis.set.mock.calls[0];
    expect(key).toBe(redisKeyForProcesso(numeroCnj, 'user-a'));
    const saved = JSON.parse(payload);

    expect(saved.statusColeta).toBe('ERRO');
    expect(saved.motivoErro).toBe('SEM_DADOS_ORGAO_ZERO');
    expect(saved.partes).toEqual([{ nome: 'Fulano' }]);
    expect(saved.movimentacoes).toEqual([{ id: '1' }]);
    expect(saved.instancias).toEqual([{ instanciaId: '1' }]);
    expect(saved.enriquecidoEm).not.toBe('2026-01-01 00:00:00.000');
  });

  it('atualiza só o status no Redis quando NAO_ENCONTRADO chega com cache prévio real', async () => {
    redis.smembers.mockResolvedValue(['user-a']);
    redis.get.mockResolvedValue(
      JSON.stringify({
        cnjNumber: numeroCnj,
        statusColeta: 'SINCRONIZANDO',
        enriquecidoEm: '2026-01-01 00:00:00.000',
        partes: [{ nome: 'Fulano' }],
      }),
    );

    await service.execute(makeBody({ status: 'NAO_ENCONTRADO' }));

    expect(redis.set).toHaveBeenCalledTimes(1);
    const [, payload] = redis.set.mock.calls[0];
    const saved = JSON.parse(payload);

    expect(saved.statusColeta).toBe('NAO_ENCONTRADO');
    expect(saved.partes).toEqual([{ nome: 'Fulano' }]);
  });

  it('grava no Redis de cada usuário aguardando, com a mesma forma de resposta do FindProcessoService', async () => {
    redis.smembers.mockResolvedValue(['user-a', 'user-b']);

    const body = makeBody({
      resposta: {
        instancias: [
          {
            id: 10,
            instancia: 'PRIMEIRO_GRAU',
            classe: 'ATOrd',
            area: 'Trabalhista',
            valor_causa: 14914.27,
            arquivado: true,
            segredo: false,
            assunto: [
              { id: 1, codigo: '100', descricao: 'Horas Extras', principal: true },
            ],
            partes: [
              {
                id: 20,
                tipo: 'RECLAMANTE',
                nome: 'Fulano',
                principal: true,
                polo: 'ATIVO',
                documento: { tipo: 'CPF', numero: '123' },
                advogado_de: 99,
              },
            ],
            movimentacoes: [
              {
                id: 30,
                data: '31/12/2026',
                conteudo: 'Sentença',
                pje_doc_id: 555,
              },
            ],
          } as any,
        ],
        origem: 'TRT2',
      } as any,
    });

    await service.execute(body);

    expect(redis.set).toHaveBeenCalledTimes(2);
    expect(redis.set).toHaveBeenCalledWith(
      redisKeyForProcesso(numeroCnj, 'user-a'),
      expect.any(String),
      'EX',
      60 * 60 * 24 * 30,
    );
    expect(redis.set).toHaveBeenCalledWith(
      redisKeyForProcesso(numeroCnj, 'user-b'),
      expect.any(String),
      'EX',
      60 * 60 * 24 * 30,
    );

    const [, payload] = redis.set.mock.calls[0];
    const saved = JSON.parse(payload);

    // Tudo que o Athena devolve em resultado de query já vem como string —
    // números/booleanos nativos do webhook precisam ser convertidos, senão
    // comparação estrita no front (ex: `principal === "true"`) quebra em
    // silêncio pra quem lê do cache no Redis em vez do Athena.
    expect(saved.cnjNumber).toBe(numeroCnj);
    expect(saved.trt).toBe('TRT2');
    expect(saved.anoProcesso).toBe('2023');
    expect(typeof saved.numInstancias).toBe('string');
    expect(typeof saved.enriquecidoEm).toBe('string');
    expect(saved.enriquecidoEm).not.toContain('T');
    expect(saved.enriquecidoEm).not.toContain('Z');

    expect(saved.partes).toHaveLength(1);
    expect(saved.partes[0].nome).toBe('Fulano');
    expect(saved.partes[0].principal).toBe('true');
    expect(saved.partes[0].parteId).toBe('20');
    expect(saved.partes[0].instanciaId).toBe('10');
    expect(saved.partes[0].advogadoDe).toBe('99');

    expect(saved.instancias).toHaveLength(1);
    expect(saved.instancias[0].instanciaId).toBe('10');
    expect(saved.instancias[0].assuntoPrincipal).toBe('Horas Extras');
    expect(saved.instancias[0].valorCausa).toBe('14914.27');
    expect(saved.instancias[0].arquivado).toBe('true');
    expect(saved.instancias[0].segredo).toBe('false');

    expect(saved.movimentacoes).toHaveLength(1);
    expect(saved.movimentacoes[0].instanciaId).toBe('10');
    expect(saved.movimentacoes[0].movimentacaoId).toBe('30');
    expect(saved.movimentacoes[0].documentoId).toBe('555');
    expect(saved.movimentacoes[0].data).toBe('2026-12-31');
  });

  it('limpa a lista de espera e o lock de inflight depois de gravar', async () => {
    redis.smembers.mockResolvedValue(['user-a']);

    await service.execute(makeBody());

    expect(redis.del).toHaveBeenCalledWith(redisWaitersKeyForProcesso(numeroCnj));
    expect(redis.del).toHaveBeenCalledWith(redisInflightKeyForProcesso(numeroCnj));
  });

  describe('registerWaiter', () => {
    it('registra o usuário na lista de espera com TTL', async () => {
      await service.registerWaiter(numeroCnj, 'user-a');

      expect(redis.sadd).toHaveBeenCalledWith(
        redisWaitersKeyForProcesso(numeroCnj),
        'user-a',
      );
      expect(redis.expire).toHaveBeenCalledWith(
        redisWaitersKeyForProcesso(numeroCnj),
        60 * 60,
      );
    });
  });
});
