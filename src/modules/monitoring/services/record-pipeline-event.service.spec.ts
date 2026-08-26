import { RecordPipelineEventService } from './record-pipeline-event.service';
import { Root } from 'src/modules/process/interfaces/process.interface';
import {
  bucketKeyFor,
  dispatchKey,
  FIELD,
  INFLIGHT_KEY,
} from '../utils/pipeline-metrics.util';

const numeroCnj = '1000580-10.2023.5.02.0492';

const makeMulti = () => {
  const multi = {
    hincrby: jest.fn(),
    expire: jest.fn(),
    zadd: jest.fn(),
    zrem: jest.fn(),
    set: jest.fn(),
    lpush: jest.fn(),
    ltrim: jest.fn(),
    exec: jest.fn().mockResolvedValue([]),
  };
  // Encadeamento: todo comando devolve o próprio multi, como o ioredis faz.
  for (const key of Object.keys(multi)) {
    if (key !== 'exec') {
      (multi as Record<string, jest.Mock>)[key].mockReturnValue(multi);
    }
  }
  return multi;
};

const makeBody = (overrides: Partial<Root> = {}): Root =>
  ({
    numero_processo: numeroCnj,
    status: 'SUCESSO',
    motivo_erro: null,
    webhookId: 'wh-1',
    ...overrides,
  }) as Root;

describe('RecordPipelineEventService', () => {
  let redis: {
    multi: jest.Mock;
    get: jest.Mock;
  };
  let multi: ReturnType<typeof makeMulti>;
  let service: RecordPipelineEventService;

  beforeEach(() => {
    multi = makeMulti();
    redis = { multi: jest.fn().mockReturnValue(multi), get: jest.fn() };
    service = new RecordPipelineEventService(redis as never);
  });

  describe('recordDispatch', () => {
    it('conta o disparo, marca o CNJ como em andamento e guarda o início', async () => {
      await service.recordDispatch({ numeroCnj, userId: 'u1' });

      const bucket = bucketKeyFor(new Date());
      expect(multi.hincrby).toHaveBeenCalledWith(bucket, FIELD.disparos, 1);
      expect(multi.hincrby).toHaveBeenCalledWith(
        bucket,
        FIELD.trtTotal('TRT2'),
        1,
      );
      expect(multi.zadd).toHaveBeenCalledWith(
        INFLIGHT_KEY,
        expect.any(Number),
        numeroCnj,
      );
      // Sem TTL, a chave sobreviveria para sempre se o módulo saísse de uso.
      expect(multi.expire).toHaveBeenCalledWith(
        INFLIGHT_KEY,
        expect.any(Number),
      );
      expect(multi.set).toHaveBeenCalledWith(
        dispatchKey(numeroCnj),
        expect.stringContaining('startedAt'),
        'EX',
        expect.any(Number),
      );
      expect(multi.exec).toHaveBeenCalled();
    });

    it('não propaga falha do Redis — métrica não pode impedir a extração', async () => {
      redis.multi.mockImplementation(() => {
        throw new Error('redis fora do ar');
      });

      await expect(
        service.recordDispatch({ numeroCnj }),
      ).resolves.toBeUndefined();
    });
  });

  describe('recordWebhook', () => {
    it('calcula a latência a partir do disparo registrado', async () => {
      const startedAt = Date.now() - 45_000;
      redis.get.mockResolvedValue(JSON.stringify({ startedAt }));

      await service.recordWebhook(makeBody());

      const bucket = bucketKeyFor(new Date());
      const latSum = multi.hincrby.mock.calls.find(
        ([, campo]) => campo === FIELD.latSum,
      );
      expect(latSum?.[0]).toBe(bucket);
      expect(latSum?.[2]).toBeGreaterThanOrEqual(45_000);
      expect(multi.hincrby).toHaveBeenCalledWith(bucket, FIELD.latCount, 1);
      // 45s cai na faixa que vai até 60s.
      expect(multi.hincrby).toHaveBeenCalledWith(
        bucket,
        FIELD.latHist('60000'),
        1,
      );
    });

    it('registra o desfecho mesmo sem disparo correspondente', async () => {
      redis.get.mockResolvedValue(null);

      await service.recordWebhook(makeBody());

      const bucket = bucketKeyFor(new Date());
      expect(multi.hincrby).toHaveBeenCalledWith(
        bucket,
        FIELD.status('SUCESSO'),
        1,
      );
      expect(multi.hincrby).not.toHaveBeenCalledWith(bucket, FIELD.latCount, 1);
    });

    it('contabiliza o motivo e o erro por TRT quando a coleta falha', async () => {
      redis.get.mockResolvedValue(null);

      await service.recordWebhook(
        makeBody({ status: 'ERRO', motivo_erro: 'PJE_FORA_DO_AR' }),
      );

      const bucket = bucketKeyFor(new Date());
      expect(multi.hincrby).toHaveBeenCalledWith(
        bucket,
        FIELD.motivo('PJE_FORA_DO_AR'),
        1,
      );
      expect(multi.hincrby).toHaveBeenCalledWith(
        bucket,
        FIELD.trtErro('TRT2'),
        1,
      );
    });

    it('acumula os tempos por estágio quando o webhook vem instrumentado', async () => {
      redis.get.mockResolvedValue(null);

      await service.recordWebhook(
        makeBody({
          timings: {
            queueWaitMs: 1_200,
            totalMs: 30_000,
            trt: 3,
            documents: true,
            stages: {
              login: 5_000,
              fetchMovimentacoes: 8_000,
              documentosPublicos: null,
              documentosRestritos: 15_000,
            },
          },
        }),
      );

      const bucket = bucketKeyFor(new Date());
      expect(multi.hincrby).toHaveBeenCalledWith(
        bucket,
        FIELD.stageSum('login'),
        5_000,
      );
      expect(multi.hincrby).toHaveBeenCalledWith(
        bucket,
        FIELD.stageSum('fila'),
        1_200,
      );
      // Estágio não alcançado não entra na média — senão puxaria para baixo
      // o tempo médio de uma etapa que sequer rodou.
      expect(multi.hincrby).not.toHaveBeenCalledWith(
        bucket,
        FIELD.stageCount('documentosPublicos'),
        1,
      );
      // O TRT dos timings tem precedência sobre o extraído do CNJ.
      expect(multi.hincrby).toHaveBeenCalledWith(
        bucket,
        FIELD.trtRetornos('TRT3'),
        1,
      );
    });

    it('tira o CNJ da lista de em andamento ao receber o retorno', async () => {
      redis.get.mockResolvedValue(null);

      await service.recordWebhook(makeBody());

      expect(multi.zrem).toHaveBeenCalledWith(INFLIGHT_KEY, numeroCnj);
    });

    it('ignora webhook sem número de processo', async () => {
      await service.recordWebhook(makeBody({ numero_processo: undefined }));

      expect(redis.multi).not.toHaveBeenCalled();
    });

    it('descarta latência negativa vinda de relógio fora de ordem', async () => {
      redis.get.mockResolvedValue(
        JSON.stringify({ startedAt: Date.now() + 60_000 }),
      );

      await service.recordWebhook(makeBody());

      expect(multi.hincrby).not.toHaveBeenCalledWith(
        expect.anything(),
        FIELD.latCount,
        1,
      );
    });
  });
});
