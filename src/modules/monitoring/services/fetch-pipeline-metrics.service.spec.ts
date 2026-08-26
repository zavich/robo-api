import { FetchPipelineMetricsService } from './fetch-pipeline-metrics.service';
import {
  FIELD,
  INFLIGHT_HORIZON_MS,
  STUCK_THRESHOLD_MS,
} from '../utils/pipeline-metrics.util';

const agora = new Date('2026-08-26T13:30:00.000Z');

describe('FetchPipelineMetricsService', () => {
  let redis: {
    pipeline: jest.Mock;
    zcard: jest.Mock;
    zrangebyscore: jest.Mock;
    zremrangebyscore: jest.Mock;
    lrange: jest.Mock;
  };
  let hgetall: jest.Mock;
  let service: FetchPipelineMetricsService;

  // Cada item do array vira o HASH de um bucket, na ordem da janela pedida.
  const comBuckets = (hashes: Record<string, string>[]) => {
    hgetall.mockClear();
    redis.pipeline.mockImplementation(() => {
      const chained = {
        hgetall,
        exec: jest
          .fn()
          .mockResolvedValue(hashes.map((h) => [null, h] as [null, unknown])),
      };
      return chained;
    });
  };

  beforeEach(() => {
    hgetall = jest.fn();
    redis = {
      pipeline: jest.fn(),
      zcard: jest.fn().mockResolvedValue(0),
      zrangebyscore: jest.fn().mockResolvedValue([]),
      zremrangebyscore: jest.fn().mockResolvedValue(0),
      lrange: jest.fn().mockResolvedValue([]),
    };
    hgetall.mockReturnValue(undefined);
    comBuckets([{}, {}]);
    service = new FetchPipelineMetricsService(redis as never);
  });

  it('soma os buckets da janela e devolve um ponto de série por hora', async () => {
    comBuckets([
      { [FIELD.disparos]: '10', [FIELD.status('SUCESSO')]: '8' },
      { [FIELD.disparos]: '4', [FIELD.status('ERRO')]: '2' },
    ]);

    const snapshot = await service.execute(2, agora);

    expect(snapshot.totais.disparos).toBe(14);
    expect(snapshot.totais.sucesso).toBe(8);
    expect(snapshot.totais.erro).toBe(2);
    expect(snapshot.serie).toHaveLength(2);
    expect(snapshot.serie[0].bucket).toBe('2026-08-26T12');
    expect(snapshot.serie[1].bucket).toBe('2026-08-26T13');
  });

  it('calcula a taxa de sucesso sobre os retornos, não sobre os disparos', async () => {
    // 100 disparados, 10 já voltaram (9 com sucesso): o que ainda está na
    // fila não pode ser contado como falha.
    comBuckets([
      {
        [FIELD.disparos]: '100',
        [FIELD.retornos]: '10',
        [FIELD.status('SUCESSO')]: '9',
        [FIELD.status('ERRO')]: '1',
      },
    ]);

    const snapshot = await service.execute(1, agora);

    expect(snapshot.totais.taxaSucesso).toBe(0.9);
  });

  it('devolve taxa nula quando ainda não houve nenhum retorno na janela', async () => {
    comBuckets([{ [FIELD.disparos]: '5' }]);

    const snapshot = await service.execute(1, agora);

    expect(snapshot.totais.taxaSucesso).toBeNull();
  });

  it('agrega motivos de erro entre buckets e ordena pelo mais frequente', async () => {
    comBuckets([
      {
        [FIELD.motivo('PJE_FORA_DO_AR')]: '3',
        [FIELD.motivo('SEGREDO_JUSTICA')]: '1',
      },
      { [FIELD.motivo('PJE_FORA_DO_AR')]: '2' },
    ]);

    const snapshot = await service.execute(2, agora);

    expect(snapshot.errosPorMotivo).toEqual([
      { motivo: 'PJE_FORA_DO_AR', total: 5, percentual: 0.8333 },
      { motivo: 'SEGREDO_JUSTICA', total: 1, percentual: 0.1667 },
    ]);
  });

  it('monta o resumo por TRT com taxa de erro e latência média', async () => {
    comBuckets([
      {
        [FIELD.trtTotal('TRT3')]: '10',
        [FIELD.trtRetornos('TRT3')]: '8',
        [FIELD.trtErro('TRT3')]: '2',
        [FIELD.trtLatSum('TRT3')]: '80000',
        [FIELD.trtLatCount('TRT3')]: '8',
      },
    ]);

    const snapshot = await service.execute(1, agora);

    expect(snapshot.porTrt).toEqual([
      {
        trt: 'TRT3',
        disparos: 10,
        retornos: 8,
        erros: 2,
        taxaErro: 0.25,
        latenciaMediaMs: 10_000,
      },
    ]);
  });

  it('estima os percentis a partir do histograma acumulado', async () => {
    comBuckets([
      {
        [FIELD.latHist('10000')]: '90',
        [FIELD.latHist('30000')]: '10',
        [FIELD.latSum]: '1000000',
        [FIELD.latCount]: '100',
      },
    ]);

    const snapshot = await service.execute(1, agora);

    expect(snapshot.latencia.amostras).toBe(100);
    expect(snapshot.latencia.mediaMs).toBe(10_000);
    expect(snapshot.latencia.p95Ms).toBe(20_000);
  });

  it('devolve todos os estágios, com null onde não houve amostra', async () => {
    comBuckets([
      {
        [FIELD.stageSum('login')]: '10000',
        [FIELD.stageCount('login')]: '2',
      },
    ]);

    const snapshot = await service.execute(1, agora);

    const login = snapshot.estagios.find((e) => e.estagio === 'login');
    const restritos = snapshot.estagios.find(
      (e) => e.estagio === 'documentosRestritos',
    );
    expect(login).toEqual({ estagio: 'login', mediaMs: 5_000, amostras: 2 });
    expect(restritos?.mediaMs).toBeNull();
  });

  it('lista os disparos parados além do limite, com o tempo de espera', async () => {
    const desde = agora.getTime() - STUCK_THRESHOLD_MS - 60_000;
    redis.zcard.mockResolvedValue(4);
    redis.zrangebyscore.mockResolvedValue([
      '1111111-11.2023.5.02.0001',
      String(desde),
    ]);

    const snapshot = await service.execute(1, agora);

    expect(snapshot.totais.emAndamento).toBe(4);
    expect(snapshot.totais.travados).toBe(1);
    expect(snapshot.travadosAgora[0]).toEqual({
      numeroCnj: '1111111-11.2023.5.02.0001',
      esperandoHaMs: STUCK_THRESHOLD_MS + 60_000,
      desde: new Date(desde).toISOString(),
    });
  });

  it('poda os disparos perdidos antes de contar os em andamento', async () => {
    await service.execute(1, agora);

    expect(redis.zremrangebyscore).toHaveBeenCalledWith(
      'pipeline:inflight',
      '-inf',
      agora.getTime() - INFLIGHT_HORIZON_MS,
    );
    // A poda vem antes da contagem — senão o número incluiria o que acabou
    // de ser removido.
    const ordemPoda = redis.zremrangebyscore.mock.invocationCallOrder[0];
    const ordemContagem = redis.zcard.mock.invocationCallOrder[0];
    expect(ordemPoda).toBeLessThan(ordemContagem);
  });

  it('descarta linha corrompida da lista de recentes sem derrubar a leitura', async () => {
    redis.lrange.mockResolvedValue(['{"numeroCnj":"a"}', 'não é json']);

    const snapshot = await service.execute(1, agora);

    expect(snapshot.recentes).toHaveLength(1);
  });

  it('segue devolvendo os agregados quando a leitura do inflight falha', async () => {
    redis.zcard.mockRejectedValue(new Error('redis fora do ar'));
    comBuckets([{ [FIELD.disparos]: '3' }]);

    const snapshot = await service.execute(1, agora);

    expect(snapshot.totais.disparos).toBe(3);
    expect(snapshot.totais.emAndamento).toBe(0);
  });
});
