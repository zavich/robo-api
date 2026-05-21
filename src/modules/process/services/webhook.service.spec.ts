import { BadRequestException } from '@nestjs/common';
import { WebhookService } from './webhook.service';

const makeProcessModel = () => ({
  findOne: jest.fn().mockReturnThis(),
  populate: jest.fn(),
});

const makeStepModel = () => ({
  findById: jest.fn(),
});

const makeRedis = () => ({
  get: jest.fn(),
  set: jest.fn(),
  eval: jest.fn(),
});

const makeHandler = () => ({
  handle: jest.fn(),
});

const makeBody = (overrides: Record<string, unknown> = {}) =>
  ({
    numero_processo: '0000001-00.2024.5.03.0001',
    status: 'SUCESSO',
    tribunal: { sigla: 'TRT3' },
    webhookId: 'wh-123',
    resposta: { instancias: [], message: '', numero_unico: '', origem: 'TRT3' },
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
  }) as any;

describe('WebhookService', () => {
  let service: WebhookService;
  let processModel: ReturnType<typeof makeProcessModel>;
  let stepModel: ReturnType<typeof makeStepModel>;
  let redis: ReturnType<typeof makeRedis>;
  let naoEncontradoHandler: ReturnType<typeof makeHandler>;
  let erroHandler: ReturnType<typeof makeHandler>;
  let tstHandler: ReturnType<typeof makeHandler>;
  let trtHandler: ReturnType<typeof makeHandler>;

  beforeEach(() => {
    processModel = makeProcessModel();
    stepModel = makeStepModel();
    redis = makeRedis();
    naoEncontradoHandler = makeHandler();
    erroHandler = makeHandler();
    tstHandler = makeHandler();
    trtHandler = makeHandler();

    service = new WebhookService(
      processModel as any,
      stepModel as any,
      redis as any,
      naoEncontradoHandler as any,
      erroHandler as any,
      tstHandler as any,
      trtHandler as any,
    );
  });

  it('rejects webhook without webhookId', async () => {
    await expect(
      service.execute(makeBody({ webhookId: undefined })),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(redis.eval).not.toHaveBeenCalled();
  });

  it('ignores duplicate webhook when state is DONE', async () => {
    redis.eval.mockResolvedValue('DONE');

    await service.execute(makeBody(), 'corr-1');

    expect(redis.eval).toHaveBeenCalled();
    expect(processModel.findOne).not.toHaveBeenCalled();
  });

  it('ignores duplicate webhook when state is PROCESSING (in-flight)', async () => {
    redis.eval.mockResolvedValue('PROCESSING');

    await service.execute(makeBody(), 'corr-1');

    expect(processModel.findOne).not.toHaveBeenCalled();
  });

  it('reacquires lock when previous state is FAILED and reprocesses', async () => {
    redis.eval.mockResolvedValue('FAILED');
    redis.set.mockResolvedValue('OK');
    const process = {
      _id: 'proc-id',
      processStatus: { step: 'step-id' },
    };
    processModel.populate.mockResolvedValue(process);
    stepModel.findById.mockResolvedValue({ slug: 'step-3' });

    await service.execute(makeBody(), 'corr-retry');

    expect(trtHandler.handle).toHaveBeenCalled();
    expect(redis.set).toHaveBeenLastCalledWith(
      'webhook:wh-123',
      'DONE',
      'EX',
      60 * 60 * 24,
    );
  });

  it('stores FAILED_PROCESS_NOT_FOUND when process does not exist', async () => {
    redis.eval.mockResolvedValue('NEW');
    redis.set.mockResolvedValue('OK');
    processModel.populate.mockResolvedValue(null);

    await service.execute(makeBody(), 'corr-2');

    expect(redis.set).toHaveBeenCalledWith(
      'webhook:wh-123',
      'FAILED_PROCESS_NOT_FOUND',
      'EX',
      5 * 60,
    );
  });

  it('marks webhook as DONE after successful TRT handling', async () => {
    const process = {
      _id: 'proc-id',
      processStatus: { step: 'step-id' },
    };
    const step = { slug: 'step-3' };

    redis.eval.mockResolvedValue('NEW');
    redis.set.mockResolvedValue('OK');
    processModel.populate.mockResolvedValue(process);
    stepModel.findById.mockResolvedValue(step);

    await service.execute(makeBody(), 'corr-3');

    expect(trtHandler.handle).toHaveBeenCalledWith(
      expect.objectContaining({ webhookId: 'wh-123' }),
      process,
      step,
      'corr-3',
    );
    expect(redis.set).toHaveBeenLastCalledWith(
      'webhook:wh-123',
      'DONE',
      'EX',
      60 * 60 * 24,
    );
  });

  it('marks webhook as FAILED and rethrows when handler crashes', async () => {
    const process = {
      _id: 'proc-id',
      processStatus: { step: 'step-id' },
    };

    redis.eval.mockResolvedValue('NEW');
    redis.set.mockResolvedValue('OK');
    processModel.populate.mockResolvedValue(process);
    stepModel.findById.mockResolvedValue({ slug: 'step-3' });
    trtHandler.handle.mockRejectedValue(new Error('boom'));

    await expect(service.execute(makeBody(), 'corr-4')).rejects.toThrow('boom');

    expect(redis.set).toHaveBeenLastCalledWith(
      'webhook:wh-123',
      'FAILED',
      'EX',
      60 * 60,
    );
  });
});
