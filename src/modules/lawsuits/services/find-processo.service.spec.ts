import { BadRequestException } from '@nestjs/common';
import { FindProcessoService } from './find-processo.service';
import { redisKeyForProcesso } from './cache-processo-to-redis.service';

const numeroCnj = '1000580-10.2023.5.02.0492';
const userId = 'user-a';

describe('FindProcessoService', () => {
  let athenaQueryService: { query: jest.Mock };
  let redis: { get: jest.Mock; set: jest.Mock; del: jest.Mock };
  let service: FindProcessoService;

  beforeEach(() => {
    athenaQueryService = { query: jest.fn() };
    redis = {
      get: jest.fn(),
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
    };
    service = new FindProcessoService(athenaQueryService as any, redis as any);
  });

  it('lança BadRequestException pra número de CNJ inválido', async () => {
    await expect(service.execute('invalido', userId)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(redis.get).not.toHaveBeenCalled();
  });

  it('não consulta nada quando não há cache e o Athena não tem o processo', async () => {
    redis.get.mockResolvedValue(null);
    athenaQueryService.query.mockResolvedValue([]);

    const result = await service.execute(numeroCnj, userId);

    expect(athenaQueryService.query).toHaveBeenCalled();
    expect(result).toBeNull();
    expect(redis.del).not.toHaveBeenCalled();
  });

  it('cai pro Athena quando o cache no Redis está corrompido', async () => {
    redis.get.mockResolvedValue('{ json invalido');
    athenaQueryService.query.mockResolvedValue([]);

    const result = await service.execute(numeroCnj, userId);

    expect(athenaQueryService.query).toHaveBeenCalled();
    expect(result).toBeNull();
  });

  it('devolve o cache do Redis do próprio usuário mesmo quando o Athena tem dado mais novo — Athena nunca sobrescreve dado real', async () => {
    const cached = {
      cnjNumber: numeroCnj,
      statusColeta: 'SUCESSO',
      enriquecidoEm: '2026-07-06T19:36:26.000Z',
    };
    redis.get.mockResolvedValue(JSON.stringify(cached));

    const result = await service.execute(numeroCnj, userId);

    expect(redis.get).toHaveBeenCalledWith(redisKeyForProcesso(numeroCnj, userId));
    expect(result).toEqual(cached);
    expect(redis.del).not.toHaveBeenCalled();
    // Athena nem precisa ser consultado quando já há cache — evita gasto à toa.
    expect(athenaQueryService.query).not.toHaveBeenCalled();
  });

  it('cai direto pro Athena quando não há cache no Redis do usuário — comunicacao-spot fora dessa consulta', async () => {
    redis.get.mockResolvedValue(null);
    athenaQueryService.query.mockResolvedValue([
      {
        cnj_number: numeroCnj,
        status_coleta: 'SUCESSO',
        motivo_erro: null,
        enriquecido_em: '2026-07-06 19:36:26.000',
        origem: 'TRT2',
        num_instancias: '1',
        trt: 'TRT2',
        ano_processo: '2023',
        parte_instancia_id: null,
        parte_id: null,
        parte_tipo: null,
        parte_polo: null,
        parte_nome: null,
        parte_doc_tipo: null,
        parte_doc_numero: null,
        parte_advogado_de: null,
        parte_principal: null,
      },
    ]);

    const result = await service.execute(numeroCnj, userId);

    expect(result.cnjNumber).toBe(numeroCnj);
    expect(result.statusColeta).toBe('SUCESSO');
    // Caminho da consulta ("banco") não escreve no Redis por usuário nenhum —
    // Redis fica reservado só pro fluxo de scraping.
    expect(redis.set).not.toHaveBeenCalled();
  });
});
