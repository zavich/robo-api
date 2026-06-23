import { PROCESSSTATUSENUM } from '../enums/process-status.enum';
import { ProcessStateMachineService } from './process-state-machine.service';

const makeModel = () => ({
  findById: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  findOneAndUpdate: jest.fn(),
});

describe('ProcessStateMachineService', () => {
  let service: ProcessStateMachineService;
  let model: ReturnType<typeof makeModel>;

  beforeEach(() => {
    service = new ProcessStateMachineService();
    model = makeModel();
  });

  describe('canTransition', () => {
    it('allows transition from processing with moviments to documents finished', () => {
      expect(
        service.canTransition(
          PROCESSSTATUSENUM.PROCESSING_WITH_MOVIMENTS,
          PROCESSSTATUSENUM.EXTRACTION_DOCUMENTS_FINISHED,
        ),
      ).toBe(true);
    });

    it('allows the TRT flow from moviments to documents finished', () => {
      expect(
        service.canTransition(
          PROCESSSTATUSENUM.EXTRACTION_MOVIMENTS_FINISHED,
          PROCESSSTATUSENUM.EXTRACTION_DOCUMENTS_FINISHED,
        ),
      ).toBe(true);
    });

    it('allows requeue from error to waiting extraction documents', () => {
      expect(
        service.canTransition(
          PROCESSSTATUSENUM.ERROR,
          PROCESSSTATUSENUM.PROCESS_WAITING_EXTRACTION_DOCUMENTS,
        ),
      ).toBe(true);
    });

    it('allows retry from waiting extraction documents to processing with documents', () => {
      expect(
        service.canTransition(
          PROCESSSTATUSENUM.PROCESS_WAITING_EXTRACTION_DOCUMENTS,
          PROCESSSTATUSENUM.PROCESSING_WITH_DOCUMENTS,
        ),
      ).toBe(true);
    });

    it('rejects invalid transitions', () => {
      expect(
        service.canTransition(
          PROCESSSTATUSENUM.PENDING,
          PROCESSSTATUSENUM.SUCCESS,
        ),
      ).toBe(false);
    });
  });

  describe('transition', () => {
    it('uses compare-and-set update when status actually changes', async () => {
      model.findById.mockResolvedValue({
        _id: 'status-id',
        name: PROCESSSTATUSENUM.EXTRACTION_MOVIMENTS_FINISHED,
      });
      model.findOneAndUpdate.mockResolvedValue({
        _id: 'status-id',
        name: PROCESSSTATUSENUM.EXTRACTION_DOCUMENTS_FINISHED,
      });

      const result = await service.transition(model as any, 'status-id', {
        name: PROCESSSTATUSENUM.EXTRACTION_DOCUMENTS_FINISHED,
      });

      expect(model.findOneAndUpdate).toHaveBeenCalledWith(
        {
          _id: 'status-id',
          name: PROCESSSTATUSENUM.EXTRACTION_MOVIMENTS_FINISHED,
        },
        { name: PROCESSSTATUSENUM.EXTRACTION_DOCUMENTS_FINISHED },
        { new: true },
      );
      expect(model.findByIdAndUpdate).not.toHaveBeenCalled();
      expect(result).toEqual({
        _id: 'status-id',
        name: PROCESSSTATUSENUM.EXTRACTION_DOCUMENTS_FINISHED,
      });
    });

    it('falls back to findByIdAndUpdate when patch does not change name', async () => {
      model.findById.mockResolvedValue({
        _id: 'status-id',
        name: PROCESSSTATUSENUM.ERROR,
      });
      model.findByIdAndUpdate.mockResolvedValue({
        _id: 'status-id',
        name: PROCESSSTATUSENUM.ERROR,
        errorReason: 'retry',
      });

      const result = await service.transition(model as any, 'status-id', {
        errorReason: 'retry',
      } as any);

      expect(model.findByIdAndUpdate).toHaveBeenCalledWith(
        'status-id',
        { errorReason: 'retry' },
        { new: true },
      );
      expect(model.findOneAndUpdate).not.toHaveBeenCalled();
      expect(result).toEqual({
        _id: 'status-id',
        name: PROCESSSTATUSENUM.ERROR,
        errorReason: 'retry',
      });
    });

    it('throws when compare-and-set detects a race', async () => {
      model.findById.mockResolvedValue({
        _id: 'status-id',
        name: PROCESSSTATUSENUM.PROCESSING_WITH_MOVIMENTS,
      });
      model.findOneAndUpdate.mockResolvedValue(null);

      await expect(
        service.transition(model as any, 'status-id', {
          name: PROCESSSTATUSENUM.EXTRACTION_MOVIMENTS_FINISHED,
        }),
      ).rejects.toThrow('Race detectada');
    });
  });
});
