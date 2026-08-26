import { BadRequestException } from '@nestjs/common';
import { WebhookService } from './webhook.service';

const makeRedis = () => ({
  evalsha: jest.fn(),
  set: jest.fn(),
  script: jest.fn(),
});

const makeSaveWebhookToComunicacaoSpotService = () => ({
  execute: jest.fn(),
});

const makeCacheProcessoToRedisService = () => ({
  execute: jest.fn(),
});

const makeRecordPipelineEventService = () => ({
  recordWebhook: jest.fn(),
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
  let redis: ReturnType<typeof makeRedis>;
  let saveWebhookToComunicacaoSpotService: ReturnType<
    typeof makeSaveWebhookToComunicacaoSpotService
  >;
  let cacheProcessoToRedisService: ReturnType<
    typeof makeCacheProcessoToRedisService
  >;
  let recordPipelineEventService: ReturnType<
    typeof makeRecordPipelineEventService
  >;
  let gateway: { processUpdated: jest.Mock };

  beforeEach(() => {
    redis = makeRedis();
    saveWebhookToComunicacaoSpotService =
      makeSaveWebhookToComunicacaoSpotService();
    saveWebhookToComunicacaoSpotService.execute.mockResolvedValue(undefined);
    cacheProcessoToRedisService = makeCacheProcessoToRedisService();
    cacheProcessoToRedisService.execute.mockResolvedValue(undefined);
    recordPipelineEventService = makeRecordPipelineEventService();
    recordPipelineEventService.recordWebhook.mockResolvedValue(undefined);
    gateway = { processUpdated: jest.fn() };

    service = new WebhookService(
      redis as any,
      saveWebhookToComunicacaoSpotService as any,
      cacheProcessoToRedisService as any,
      recordPipelineEventService as any,
      gateway as any,
    );
  });

  it('rejects webhook without webhookId', async () => {
    await expect(
      service.execute(makeBody({ webhookId: undefined })),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(redis.evalsha).not.toHaveBeenCalled();
  });

  it('ignores duplicate webhook when state is DONE', async () => {
    redis.script.mockResolvedValue('sha-1');
    redis.evalsha.mockResolvedValue('DONE');

    await service.execute(makeBody(), 'corr-1');

    expect(redis.evalsha).toHaveBeenCalled();
    expect(saveWebhookToComunicacaoSpotService.execute).not.toHaveBeenCalled();
  });

  it('ignores duplicate webhook when state is PROCESSING (in-flight)', async () => {
    redis.script.mockResolvedValue('sha-1');
    redis.evalsha.mockResolvedValue('PROCESSING');

    await service.execute(makeBody(), 'corr-1');

    expect(saveWebhookToComunicacaoSpotService.execute).not.toHaveBeenCalled();
  });

  it('reacquires lock when previous state is FAILED and reprocesses', async () => {
    redis.script.mockResolvedValue('sha-1');
    redis.evalsha.mockResolvedValue('FAILED');
    redis.set.mockResolvedValue('OK');

    await service.execute(makeBody(), 'corr-retry');

    expect(saveWebhookToComunicacaoSpotService.execute).toHaveBeenCalled();
    expect(redis.set).toHaveBeenLastCalledWith(
      'webhook:wh-123',
      'DONE',
      'EX',
      60 * 60 * 24,
    );
  });

  it('marks webhook as DONE and notifica o gateway após atualizar comunicacao-spot', async () => {
    redis.script.mockResolvedValue('sha-1');
    redis.evalsha.mockResolvedValue('NEW');
    redis.set.mockResolvedValue('OK');

    const body = makeBody();
    await service.execute(body, 'corr-3');

    expect(saveWebhookToComunicacaoSpotService.execute).toHaveBeenCalledWith(
      body,
    );
    expect(cacheProcessoToRedisService.execute).toHaveBeenCalledWith(body);
    expect(gateway.processUpdated).toHaveBeenCalledWith(body.numero_processo);
    expect(redis.set).toHaveBeenLastCalledWith(
      'webhook:wh-123',
      'DONE',
      'EX',
      60 * 60 * 24,
    );
  });

  it('marks webhook as FAILED and rethrows when a gravação falha', async () => {
    redis.script.mockResolvedValue('sha-1');
    redis.evalsha.mockResolvedValue('NEW');
    redis.set.mockResolvedValue('OK');
    saveWebhookToComunicacaoSpotService.execute.mockRejectedValue(
      new Error('boom'),
    );

    await expect(service.execute(makeBody(), 'corr-4')).rejects.toThrow(
      'boom',
    );

    expect(redis.set).toHaveBeenLastCalledWith(
      'webhook:wh-123',
      'FAILED',
      'EX',
      60 * 60,
    );
  });

  it('recarrega o script quando o redis retorna NOSCRIPT', async () => {
    redis.script
      .mockResolvedValueOnce('sha-1')
      .mockResolvedValueOnce('sha-2');
    redis.evalsha
      .mockRejectedValueOnce(new Error('NOSCRIPT No matching script.'))
      .mockResolvedValueOnce('DONE');

    await service.execute(makeBody(), 'corr-noscript');

    expect(redis.script).toHaveBeenCalledTimes(2);
    expect(redis.evalsha).toHaveBeenCalledTimes(2);
  });
});
