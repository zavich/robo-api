import { OrphanedProcessCron } from './orphaned-process.cron';
import { PROCESSSTATUSENUM } from '../enums/process-status.enum';

const makeProcessModel = () => ({
  find: jest.fn(),
});

const makeProcessStatusModel = () => ({
  find: jest.fn(),
});

const makeInsertProcessService = () => ({
  fetchProcessExtract: jest.fn(),
});

const makeNextStepsService = () => ({
  execute: jest.fn(),
});

const makeProcessStateMachine = () => ({
  transition: jest.fn(),
});

describe('OrphanedProcessCron', () => {
  let cron: OrphanedProcessCron;
  let processModel: ReturnType<typeof makeProcessModel>;
  let processStatusModel: ReturnType<typeof makeProcessStatusModel>;
  let insertProcessService: ReturnType<typeof makeInsertProcessService>;
  let nextStepsService: ReturnType<typeof makeNextStepsService>;
  let processStateMachine: ReturnType<typeof makeProcessStateMachine>;

  beforeEach(() => {
    processModel = makeProcessModel();
    processStatusModel = makeProcessStatusModel();
    insertProcessService = makeInsertProcessService();
    nextStepsService = makeNextStepsService();
    processStateMachine = makeProcessStateMachine();

    cron = new OrphanedProcessCron(
      processModel as any,
      processStatusModel as any,
      insertProcessService as any,
      nextStepsService as any,
      processStateMachine as any,
    );
  });

  it('requeues step-4 when a process is stuck in EXTRACTION_DOCUMENTS_FINISHED', async () => {
    processStatusModel.find.mockResolvedValue([
      {
        _id: 'status-id',
        name: PROCESSSTATUSENUM.EXTRACTION_DOCUMENTS_FINISHED,
      },
    ]);
    processModel.find.mockResolvedValue([
      {
        number: '0000001-00.2024.5.03.0001',
        processStatus: 'status-id',
      },
    ]);

    await cron.execute();

    expect(processStateMachine.transition).toHaveBeenCalledWith(
      processStatusModel,
      'status-id',
      { log: 'Reprocessando processo órfão' },
    );
    expect(nextStepsService.execute).toHaveBeenCalledWith('step-4', {
      processNumber: '0000001-00.2024.5.03.0001',
    });
  });
});
