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
    PROCESSSTATUSENUM.PROCESSING_WITH_DOCUMENTS,
    PROCESSSTATUSENUM.PROCESS_WAITING_EXTRACTION_DOCUMENTS,
    PROCESSSTATUSENUM.EXTRACTION_DOCUMENTS_FINISHED,
    PROCESSSTATUSENUM.SUCCESS,
    PROCESSSTATUSENUM.ERROR,
  ]),
  [PROCESSSTATUSENUM.PROCESS_WAITING_EXTRACTION_DOCUMENTS]: new Set([
    PROCESSSTATUSENUM.PROCESSING_WITH_DOCUMENTS,
    PROCESSSTATUSENUM.PROCESSING_WITH_MOVIMENTS,
    PROCESSSTATUSENUM.EXTRACTION_DOCUMENTS_FINISHED,
    PROCESSSTATUSENUM.WAITING_FOR_LAWSUIT_MAIN,
    PROCESSSTATUSENUM.SUCCESS,
    PROCESSSTATUSENUM.ERROR,
  ]),
  [PROCESSSTATUSENUM.EXTRACTION_DOCUMENTS_FINISHED]: new Set([
    PROCESSSTATUSENUM.PROCESSING_WITH_MOVIMENTS,
    PROCESSSTATUSENUM.PROCESSING_WITH_DOCUMENTS,
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
    PROCESSSTATUSENUM.PROCESS_WAITING_EXTRACTION_DOCUMENTS,
  ]),
  [PROCESSSTATUSENUM.SUCCESS]: new Set<PROCESSSTATUSENUM>(),
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
    if (allowed === undefined) {
      // Status legado desconhecido (ex.: nomes livres de versões anteriores):
      // fail-open com warning para não bloquear registros existentes.
      this.logger.warn(
        `canTransition: status desconhecido "${from}" → "${to}" — permitindo (fail-open)`,
      );
      return true;
    }
    return allowed.has(to as PROCESSSTATUSENUM);
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

    if (patch.name && !this.canTransition(currentStatus.name, patch.name)) {
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
    if (!processStatusId) return null;

    if (typeof processStatusId === 'string') {
      return processStatusId;
    }

    if (typeof processStatusId === 'object') {
      // Mongoose Types.ObjectId serializes to a 24-char hex string via toString()
      const str = String(processStatusId);
      if (/^[0-9a-f]{24}$/i.test(str)) {
        return str;
      }

      // Handle { _id: string | ObjectId }
      if ('_id' in processStatusId) {
        const id = (processStatusId as Record<string, unknown>)._id;
        if (typeof id === 'string') return id;
        if (id && typeof id === 'object') {
          const idStr = String(id);
          if (/^[0-9a-f]{24}$/i.test(idStr)) return idStr;
        }
      }
    }

    return null;
  }
}
