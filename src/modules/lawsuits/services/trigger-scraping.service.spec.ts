import axios from 'axios';
import { TriggerScrapingService } from './trigger-scraping.service';
import { redisKeyForProcesso } from './cache-processo-to-redis.service';

describe('TriggerScrapingService', () => {
  let service: TriggerScrapingService;
  let redis: { get: jest.Mock; set: jest.Mock };
  let findProcessoService: { execute: jest.Mock };
  let axiosPost: jest.SpyInstance;

  const numeroCnj = '1000580-10.2023.5.02.0492';

  beforeEach(() => {
    redis = { get: jest.fn(), set: jest.fn().mockResolvedValue('OK') };
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

  it('marca SINCRONIZANDO no Redis preservando o resto do dado (vindo do cache), antes de disparar a extração', async () => {
    findProcessoService.execute.mockResolvedValue({
      cnjNumber: numeroCnj,
      statusColeta: 'SUCESSO',
      enriquecidoEm: '2026-01-01 00:00:00.000',
      partes: [{ nome: 'Fulano' }],
      movimentacoes: [{ id: '1' }],
      instancias: [{ instanciaId: '1' }],
    });

    await service.execute(numeroCnj);

    expect(findProcessoService.execute).toHaveBeenCalledWith(numeroCnj);

    const [key, value] = redis.set.mock.calls[0];
    expect(key).toBe(redisKeyForProcesso(numeroCnj));

    const saved = JSON.parse(value);
    expect(saved.statusColeta).toBe('SINCRONIZANDO');
    expect(saved.partes).toEqual([{ nome: 'Fulano' }]);
    expect(saved.movimentacoes).toEqual([{ id: '1' }]);
    expect(saved.instancias).toEqual([{ instanciaId: '1' }]);
    expect(saved.enriquecidoEm).not.toBe('2026-01-01 00:00:00.000');

    expect(axiosPost).toHaveBeenCalled();
  });

  it('marca SINCRONIZANDO usando o dado do Athena (via FindProcessoService) quando não há cache prévio no Redis', async () => {
    // Esse é exatamente o caso que ficava sem nenhum indício visual de
    // sincronização: sem cache no Redis (nunca existiu, expirou, ou foi
    // limpo pelo próprio FindProcessoService quando o Athena "alcançou" o
    // cache), o antigo código simplesmente não escrevia nada.
    findProcessoService.execute.mockResolvedValue({
      cnjNumber: numeroCnj,
      statusColeta: 'SUCESSO',
      enriquecidoEm: '2026-01-01 00:00:00.000',
      partes: [],
      movimentacoes: [],
      instancias: [{ instanciaId: '1' }],
    });

    await service.execute(numeroCnj);

    expect(redis.set).toHaveBeenCalledTimes(1);
    const [key, value] = redis.set.mock.calls[0];
    expect(key).toBe(redisKeyForProcesso(numeroCnj));

    const saved = JSON.parse(value);
    expect(saved.statusColeta).toBe('SINCRONIZANDO');
    expect(saved.instancias).toEqual([{ instanciaId: '1' }]);

    expect(axiosPost).toHaveBeenCalled();
  });

  it('não escreve nada no Redis quando nem o Redis nem o Athena têm esse processo ainda', async () => {
    findProcessoService.execute.mockResolvedValue(null);

    await service.execute(numeroCnj);

    expect(redis.set).not.toHaveBeenCalled();
    expect(axiosPost).toHaveBeenCalled();
  });

  it('não impede o disparo da extração se a resolução do estado atual falhar', async () => {
    findProcessoService.execute.mockRejectedValue(new Error('conexão caiu'));

    const result = await service.execute(numeroCnj);

    expect(redis.set).not.toHaveBeenCalled();
    expect(axiosPost).toHaveBeenCalled();
    expect(result).toEqual({ message: 'Processo enviado para extração' });
  });
});
