import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { getQueueToken } from '@nestjs/bullmq';
import { WebhookErroHandler } from './webhook-erro.handler';
import { Process as ProcessEntity } from '../../schema/process.schema';
import { ProcessStatus } from '../../schema/process-status.schema';
import { PROCESSSTATUSENUM } from '../../enums/process-status.enum';
import { AnaliseStatus } from 'src/utils/enum';

const mockProcessModel = () => ({
  findByIdAndUpdate: jest.fn(),
});

const mockProcessStatusModel = () => ({
  findByIdAndUpdate: jest.fn(),
});

const mockQueue = () => ({
  add: jest.fn(),
});

const makeBody = (numero = '0000001-00.2024.5.03.0001') => ({
  numero_processo: numero,
  status: 'ERRO',
  resposta: { message: '', instancias: [], numero_unico: '', origem: '' },
  tribunal: { sigla: 'TRT3' },
} as any);

const makeProcess = (retries = 0) => ({
  _id: 'proc-id',
  number: '0000001-00.2024.5.03.0001',
  scraperRetryCount: retries,
  processStatus: 'status-id',
} as any);

describe('WebhookErroHandler', () => {
  let handler: WebhookErroHandler;
  let processModel: ReturnType<typeof mockProcessModel>;
  let processStatusModel: ReturnType<typeof mockProcessStatusModel>;
  let processQueue: ReturnType<typeof mockQueue>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        WebhookErroHandler,
        { provide: getModelToken(ProcessEntity.name), useFactory: mockProcessModel },
        { provide: getModelToken(ProcessStatus.name), useFactory: mockProcessStatusModel },
        { provide: getQueueToken('process-validation-queue'), useFactory: mockQueue },
      ],
    }).compile();

    handler = module.get(WebhookErroHandler);
    processModel = module.get(getModelToken(ProcessEntity.name));
    processStatusModel = module.get(getModelToken(ProcessStatus.name));
    processQueue = module.get(getQueueToken('process-validation-queue'));
  });

  it('schedules retry and increments counter when retries < MAX', async () => {
    const body = makeBody();
    const findProcess = makeProcess(0);

    await handler.handle(body, findProcess);

    expect(processModel.findByIdAndUpdate).toHaveBeenCalledWith('proc-id', {
      $inc: { scraperRetryCount: 1 },
    });
    expect(processQueue.add).toHaveBeenCalledWith(
      'process-validation',
      { processNumber: body.numero_processo },
      expect.objectContaining({ delay: 5 * 60 * 1000, attempts: 1 }),
    );
    expect(processStatusModel.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('marks as rejected when retries == MAX (3)', async () => {
    const body = makeBody();
    const findProcess = makeProcess(3);

    await handler.handle(body, findProcess);

    expect(processQueue.add).not.toHaveBeenCalled();
    expect(processStatusModel.findByIdAndUpdate).toHaveBeenCalledWith(
      'status-id',
      expect.objectContaining({
        name: PROCESSSTATUSENUM.ERROR,
        errorReason: AnaliseStatus.TRT_INACESSIVEL,
      }),
    );
  });

  it('schedules retry on last allowed attempt (retries = 2)', async () => {
    const body = makeBody();
    const findProcess = makeProcess(2);

    await handler.handle(body, findProcess);

    expect(processQueue.add).toHaveBeenCalled();
    expect(processStatusModel.findByIdAndUpdate).not.toHaveBeenCalled();
  });
});
