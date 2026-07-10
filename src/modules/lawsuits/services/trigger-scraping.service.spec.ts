import axios from 'axios';
import { TriggerScrapingService } from './trigger-scraping.service';
import { redisKeyForProcesso } from './cache-processo-to-redis.service';

describe('TriggerScrapingService', () => {
  let service: TriggerScrapingService;
  let redis: { get: jest.Mock; set: jest.Mock };
  let axiosPost: jest.SpyInstance;

  const numeroCnj = '1000580-10.2023.5.02.0492';

  beforeEach(() => {
    redis = { get: jest.fn(), set: jest.fn().mockResolvedValue('OK') };
    service = new TriggerScrapingService(redis as any);
    axiosPost = jest.spyOn(axios, 'post').mockResolvedValue({ data: {} });
  });

  afterEach(() => {
    axiosPost.mockRestore();
  });

  it('marca SINCRONIZANDO no Redis preservando o resto do cache, antes de disparar a extração', async () => {
    redis.get.mockResolvedValue(
      JSON.stringify({
        cnjNumber: numeroCnj,
        statusColeta: 'SUCESSO',
        enriquecidoEm: '2026-01-01 00:00:00.000',
        partes: [{ nome: 'Fulano' }],
        movimentacoes: [{ id: '1' }],
        instancias: [{ instanciaId: '1' }],
      }),
    );

    await service.execute(numeroCnj);

    expect(redis.get).toHaveBeenCalledWith(redisKeyForProcesso(numeroCnj));

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

  it('não escreve nada no Redis quando não existe cache prévio pro processo', async () => {
    redis.get.mockResolvedValue(null);

    await service.execute(numeroCnj);

    expect(redis.set).not.toHaveBeenCalled();
    expect(axiosPost).toHaveBeenCalled();
  });

  it('não impede o disparo da extração se a checagem do Redis falhar', async () => {
    redis.get.mockRejectedValue(new Error('conexão caiu'));

    const result = await service.execute(numeroCnj);

    expect(redis.set).not.toHaveBeenCalled();
    expect(axiosPost).toHaveBeenCalled();
    expect(result).toEqual({ message: 'Processo enviado para extração' });
  });
});
