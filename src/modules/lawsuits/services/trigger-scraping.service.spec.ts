import axios from 'axios';
import { TriggerScrapingService } from './trigger-scraping.service';
import {
  redisInflightKeyForProcesso,
  redisKeyForProcesso,
  redisWaitersKeyForProcesso,
} from './cache-processo-to-redis.service';

describe('TriggerScrapingService', () => {
  let service: TriggerScrapingService;
  let redis: {
    get: jest.Mock;
    set: jest.Mock;
    del: jest.Mock;
    sadd: jest.Mock;
    expire: jest.Mock;
  };
  let findProcessoService: { execute: jest.Mock };
  let axiosPost: jest.SpyInstance;

  const numeroCnj = '1000580-10.2023.5.02.0492';
  const userId = 'user-a';

  beforeEach(() => {
    redis = {
      get: jest.fn(),
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
      sadd: jest.fn().mockResolvedValue(1),
      expire: jest.fn().mockResolvedValue(1),
    };
    findProcessoService = { execute: jest.fn() };
    service = new TriggerScrapingService(
      redis as any,
      findProcessoService as any,
    );
    axiosPost = jest.spyOn(axios, 'post').mockResolvedValue({ data: {} });
  });

  afterEach(() => {
    axiosPost.mockRestore();
  });

  it('registra o usuário como aguardando o resultado', async () => {
    findProcessoService.execute.mockResolvedValue(null);

    await service.execute(numeroCnj, userId);

    expect(redis.sadd).toHaveBeenCalledWith(
      redisWaitersKeyForProcesso(numeroCnj),
      userId,
    );
    expect(redis.expire).toHaveBeenCalledWith(
      redisWaitersKeyForProcesso(numeroCnj),
      60 * 60,
    );
  });

  it('marca SINCRONIZANDO no Redis do usuário preservando o resto do dado (vindo do cache), antes de disparar a extração', async () => {
    findProcessoService.execute.mockResolvedValue({
      cnjNumber: numeroCnj,
      statusColeta: 'SUCESSO',
      enriquecidoEm: '2026-01-01 00:00:00.000',
      partes: [{ nome: 'Fulano' }],
      movimentacoes: [{ id: '1' }],
      instancias: [{ instanciaId: '1' }],
    });

    await service.execute(numeroCnj, userId);

    expect(findProcessoService.execute).toHaveBeenCalledWith(
      numeroCnj,
      userId,
    );

    const sincronizandoCall = redis.set.mock.calls.find(
      ([key]) => key === redisKeyForProcesso(numeroCnj, userId),
    );
    expect(sincronizandoCall).toBeDefined();

    const saved = JSON.parse(sincronizandoCall[1]);
    expect(saved.statusColeta).toBe('SINCRONIZANDO');
    expect(saved.partes).toEqual([{ nome: 'Fulano' }]);
    expect(saved.movimentacoes).toEqual([{ id: '1' }]);
    expect(saved.instancias).toEqual([{ instanciaId: '1' }]);
    expect(saved.enriquecidoEm).not.toBe('2026-01-01 00:00:00.000');

    expect(axiosPost).toHaveBeenCalled();
  });

  it('marca SINCRONIZANDO usando o dado do Athena/comunicacao-spot (via FindProcessoService) quando não há cache prévio no Redis do usuário', async () => {
    findProcessoService.execute.mockResolvedValue({
      cnjNumber: numeroCnj,
      statusColeta: 'SUCESSO',
      enriquecidoEm: '2026-01-01 00:00:00.000',
      partes: [],
      movimentacoes: [],
      instancias: [{ instanciaId: '1' }],
    });

    await service.execute(numeroCnj, userId);

    const sincronizandoCall = redis.set.mock.calls.find(
      ([key]) => key === redisKeyForProcesso(numeroCnj, userId),
    );
    expect(sincronizandoCall).toBeDefined();

    const saved = JSON.parse(sincronizandoCall[1]);
    expect(saved.statusColeta).toBe('SINCRONIZANDO');
    expect(saved.instancias).toEqual([{ instanciaId: '1' }]);

    expect(axiosPost).toHaveBeenCalled();
  });

  it('marca SINCRONIZANDO com um placeholder vazio quando nem Redis nem Athena têm esse processo ainda (primeira busca de um CNJ novo)', async () => {
    // Sem isso, o GET continuava 404 até o webhook real responder (podendo
    // levar minutos), sem nenhum jeito do front mostrar "buscando"/acompanhar
    // o progresso — precisa de ALGUM registro (mesmo vazio) pra existir no
    // Redis assim que a busca é disparada.
    findProcessoService.execute.mockResolvedValue(null);

    await service.execute(numeroCnj, userId);

    const sincronizandoCall = redis.set.mock.calls.find(
      ([key]) => key === redisKeyForProcesso(numeroCnj, userId),
    );
    expect(sincronizandoCall).toBeDefined();

    const saved = JSON.parse(sincronizandoCall[1]);
    expect(saved.cnjNumber).toBe(numeroCnj);
    expect(saved.statusColeta).toBe('SINCRONIZANDO');
    expect(saved.trt).toBe('TRT2');
    expect(saved.anoProcesso).toBe('2023');
    expect(saved.partes).toEqual([]);
    expect(saved.movimentacoes).toEqual([]);
    expect(saved.instancias).toEqual([]);

    expect(axiosPost).toHaveBeenCalled();
  });

  it('não marca SINCRONIZANDO quando o CNJ é inválido (defensivo — chamadores já validam antes)', async () => {
    findProcessoService.execute.mockResolvedValue(null);

    await service.execute('numero-invalido', userId);

    const sincronizandoCall = redis.set.mock.calls.find(
      ([key]) => key === redisKeyForProcesso('numero-invalido', userId),
    );
    expect(sincronizandoCall).toBeUndefined();
    expect(axiosPost).toHaveBeenCalled();
  });

  it('não impede o disparo da extração se a resolução do estado atual falhar', async () => {
    findProcessoService.execute.mockRejectedValue(new Error('conexão caiu'));

    const result = await service.execute(numeroCnj, userId);

    expect(axiosPost).toHaveBeenCalled();
    expect(result).toEqual({ message: 'Processo enviado para extração' });
  });

  it('dispara a extração e reivindica o lock de inflight quando ninguém mais está sincronizando esse CNJ', async () => {
    findProcessoService.execute.mockResolvedValue(null);

    const result = await service.execute(numeroCnj, userId);

    expect(redis.set).toHaveBeenCalledWith(
      redisInflightKeyForProcesso(numeroCnj),
      '1',
      'EX',
      60 * 60,
      'NX',
    );
    expect(axiosPost).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ message: 'Processo enviado para extração' });
  });

  it('não dispara uma segunda extração quando já existe uma em andamento pra esse CNJ (outro usuário)', async () => {
    findProcessoService.execute.mockResolvedValue(null);
    redis.set.mockImplementation(async (key: string, ...args: unknown[]) => {
      if (key === redisInflightKeyForProcesso(numeroCnj) && args.includes('NX')) {
        return null; // já existe — NX falha
      }
      return 'OK';
    });

    const result = await service.execute(numeroCnj, 'user-b');

    expect(axiosPost).not.toHaveBeenCalled();
    expect(redis.sadd).toHaveBeenCalledWith(
      redisWaitersKeyForProcesso(numeroCnj),
      'user-b',
    );
    expect(result).toEqual({
      message: 'Processo já está sendo sincronizado — aguardando resultado',
    });
  });

  it('libera o lock de inflight quando o disparo da extração falha', async () => {
    findProcessoService.execute.mockResolvedValue(null);
    axiosPost.mockRejectedValue(new Error('scraping-robo-api fora do ar'));

    await expect(service.execute(numeroCnj, userId)).rejects.toThrow(
      'Erro ao disparar extração no scraping-robo-api',
    );

    expect(redis.del).toHaveBeenCalledWith(redisInflightKeyForProcesso(numeroCnj));
  });
});
