import { Injectable, Logger } from '@nestjs/common';
import { Model } from 'mongoose';
import { PROCESSSTATUSENUM } from '../enums/process-status.enum';
import { ProcessStatus } from '../schema/process-status.schema';

type StatusName = PROCESSSTATUSENUM | string | undefined | null;

const ALLOWED_TRANSITIONS: Record<string, Set<PROCESSSTATUSENUM>> = {
  [PROCESSSTATUSENUM.PENDING]: new Set([
    PROCESSSTATUSENUM.PROCESSING_WITH_MOVIMENTS,
    PROCESSSTATUSENUM.PROCESSING_WITH_DOCUMENTS,
    PROCESSSTATUSENUM.ERROR,
  ]),
  [PROCESSSTATUSENUM.PROCESSING_WITH_MOVIMENTS]: new Set([
    PROCESSSTATUSENUM.EXTRACTION_MOVIMENTS_FINISHED,
    PROCESSSTATUSENUM.ERROR,
  ]),
  [PROCESSSTATUSENUM.PROCESSING_WITH_DOCUMENTS]: new Set([
    PROCESSSTATUSENUM.PROCESSING_WITH_MOVIMENTS,
    PROCESSSTATUSENUM.PROCESS_WAITING_EXTRACTION_DOCUMENTS,
    PROCESSSTATUSENUM.EXTRACTION_DOCUMENTS_FINISHED,
    PROCESSSTATUSENUM.ERROR,
  ]),
  [PROCESSSTATUSENUM.EXTRACTION_MOVIMENTS_FINISHED]: new Set([
    PROCESSSTATUSENUM.PROCESSING_WITH_MOVIMENTS,
    PROCESSSTATUSENUM.PROCESS_WAITING_EXTRACTION_DOCUMENTS,
    PROCESSSTATUSENUM.EXTRACTION_DOCUMENTS_FINISHED,
    PROCESSSTATUSENUM.SUCCESS,
    PROCESSSTATUSENUM.ERROR,
  ]),
  [PROCESSSTATUSENUM.PROCESS_WAITING_EXTRACTION_DOCUMENTS]: new Set([
    PROCESSSTATUSENUM.PROCESSING_WITH_MOVIMENTS,
    PROCESSSTATUSENUM.EXTRACTION_DOCUMENTS_FINISHED,
    PROCESSSTATUSENUM.WAITING_FOR_LAWSUIT_MAIN,
    PROCESSSTATUSENUM.SUCCESS,
    PROCESSSTATUSENUM.ERROR,
  ]),
  [PROCESSSTATUSENUM.EXTRACTION_DOCUMENTS_FINISHED]: new Set([
    PROCESSSTATUSENUM.PROCESSING_WITH_MOVIMENTS,
    PROCESSSTATUSENUM.WAITING_FOR_LAWSUIT_MAIN,
    PROCESSSTATUSENUM.SUCCESS,
    PROCESSSTATUSENUM.ERROR,
  ]),
  [PROCESSSTATUSENUM.WAITING_FOR_LAWSUIT_MAIN]: new Set([
    PROCESSSTATUSENUM.PROCESSING_WITH_DOCUMENTS,
    PROCESSSTATUSENUM.EXTRACTION_DOCUMENTS_FINISHED,
    PROCESSSTATUSENUM.SUCCESS,
    PROCESSSTATUSENUM.ERROR,
  ]),
  [PROCESSSTATUSENUM.ERROR]: new Set([
    PROCESSSTATUSENUM.PROCESSING_WITH_MOVIMENTS,
    PROCESSSTATUSENUM.PROCESSING_WITH_DOCUMENTS,
    PROCESSSTATUSENUM.ERROR,
  ]),
  [PROCESSSTATUSENUM.SUCCESS]: new Set([PROCESSSTATUSENUM.SUCCESS]),
};

@Injectable()
export class ProcessStateMachineService {
  private readonly logger = new Logger(ProcessStateMachineService.name);

  canTransition(from: StatusName, to: StatusName): boolean {
    if (!to) {
      return true;
    }

    if (!from || from === to) {
      return true;
    }

    const allowed = ALLOWED_TRANSITIONS[from];
    return Boolean(allowed?.has(to as PROCESSSTATUSENUM));
  }

  async transition(
    model: Model<ProcessStatus>,
    processStatusId: string | { _id?: string } | unknown,
    patch: Partial<ProcessStatus>,
  ) {
    const processStatusRef = this.extractId(processStatusId);
    if (!processStatusRef) {
      throw new Error('Process status id ausente para transição');
    }

    const currentStatus = await model.findById(processStatusRef);
    if (!currentStatus) {
      throw new Error(`Process status ${processStatusRef} não encontrado`);
    }

    if (
      patch.name &&
      !this.canTransition(currentStatus.name, patch.name)
    ) {
      this.logger.error(
        `Transição inválida de status: ${currentStatus.name} -> ${patch.name}`,
      );
      throw new Error(
        `Transição inválida de status: ${currentStatus.name} -> ${patch.name}`,
      );
    }

    if (!patch.name || currentStatus.name === patch.name) {
      return model.findByIdAndUpdate(processStatusRef, patch, { new: true });
    }

    const updatedStatus = await model.findOneAndUpdate(
      {
        _id: processStatusRef,
        name: currentStatus.name,
      },
      patch,
      { new: true },
    );

    if (!updatedStatus) {
      throw new Error(
        `Race detectada ao transicionar status ${processStatusRef}: estado mudou durante a atualização`,
      );
    }

    return updatedStatus;
  }

  private extractId(
    processStatusId: string | { _id?: string } | unknown,
  ): string | null {
    if (typeof processStatusId === 'string') {
      return processStatusId;
    }

    if (
      processStatusId &&
      typeof processStatusId === 'object' &&
      '_id' in processStatusId &&
      typeof processStatusId._id === 'string'
    ) {
      return processStatusId._id;
    }

    return null;
  }
}
