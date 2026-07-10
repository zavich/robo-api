import { BadRequestException } from '@nestjs/common';
import { FindProcessoService } from './find-processo.service';
import { redisKeyForProcesso } from './cache-processo-to-redis.service';

const numeroCnj = '1000580-10.2023.5.02.0492';

describe('FindProcessoService', () => {
  let athenaQueryService: { query: jest.Mock };
  let redis: { get: jest.Mock; del: jest.Mock };
  let service: FindProcessoService;

  beforeEach(() => {
    athenaQueryService = { query: jest.fn() };
    redis = { get: jest.fn(), del: jest.fn().mockResolvedValue(1) };
    service = new FindProcessoService(athenaQueryService as any, redis as any);
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

  it('devolve o cache do Redis quando o Athena ainda está atrasado', async () => {
    const cached = {
      cnjNumber: numeroCnj,
      statusColeta: 'SUCESSO',
      enriquecidoEm: '2026-07-06T19:36:26.000Z',
    };
    redis.get.mockResolvedValue(JSON.stringify(cached));
    // Athena sem nenhuma linha ainda pro processo (não alcançou o cache).
    athenaQueryService.query.mockResolvedValue([]);

    const result = await service.execute(numeroCnj);

    expect(result).toEqual(cached);
    expect(redis.del).not.toHaveBeenCalled();
  });

  it('devolve o cache quando o Athena tem dado mas com enriquecido_em mais antigo', async () => {
    const cached = {
      cnjNumber: numeroCnj,
      statusColeta: 'SUCESSO',
      enriquecidoEm: '2026-07-06T19:36:26.000Z',
    };
    redis.get.mockResolvedValue(JSON.stringify(cached));
    athenaQueryService.query
      .mockResolvedValueOnce([
        {
          cnj_number: numeroCnj,
          status_coleta: 'SUCESSO',
          motivo_erro: null,
          enriquecido_em: '2026-07-01 10:00:00.000', // mais antigo que o cache
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
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await service.execute(numeroCnj);

    expect(result).toEqual(cached);
    expect(redis.del).not.toHaveBeenCalled();
  });

  it('apaga o cache e devolve o Athena quando ele já alcançou (ou passou) a data do cache', async () => {
    const cached = {
      cnjNumber: numeroCnj,
      statusColeta: 'SUCESSO',
      enriquecidoEm: '2026-07-06T19:36:26.000Z',
    };
    redis.get.mockResolvedValue(JSON.stringify(cached));
    athenaQueryService.query
      .mockResolvedValueOnce([
        {
          cnj_number: numeroCnj,
          status_coleta: 'SUCESSO',
          motivo_erro: null,
          enriquecido_em: '2026-07-06 19:36:26.000', // mesma data do cache
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
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await service.execute(numeroCnj);

    expect(redis.del).toHaveBeenCalledWith(redisKeyForProcesso(numeroCnj));
    expect(result.cnjNumber).toBe(numeroCnj);
    expect(result.enriquecidoEm).toBe('2026-07-06 19:36:26.000');
  });
});
