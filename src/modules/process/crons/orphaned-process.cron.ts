import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { InjectModel } from '@nestjs/mongoose';
import { Cron } from '@nestjs/schedule';
import { Queue } from 'bullmq';
import { Model } from 'mongoose';
import { PROCESSSTATUSENUM } from '../enums/process-status.enum';
import { ProcessStatus } from '../schema/process-status.schema';
import { Process as ProcessEntity } from '../schema/process.schema';
import { ProcessStateMachineService } from '../services/process-state-machine.service';

// Processos presos em estados intermediários por mais de 2 horas (BUG-010)
const ORPHAN_THRESHOLD_MS = 2 * 60 * 60 * 1000;

const STUCK_STATUS_NAMES = [
  PROCESSSTATUSENUM.PROCESSING_WITH_MOVIMENTS,
  PROCESSSTATUSENUM.PROCESSING_WITH_DOCUMENTS,
  PROCESSSTATUSENUM.PROCESS_WAITING_EXTRACTION_DOCUMENTS,
  PROCESSSTATUSENUM.EXTRACTION_MOVIMENTS_FINISHED,
];

@Injectable()
export class OrphanedProcessCron {
  private readonly logger = new Logger(OrphanedProcessCron.name);

  constructor(
    @InjectModel(ProcessEntity.name)
    private readonly processModel: Model<ProcessEntity>,
    @InjectModel(ProcessStatus.name)
    private readonly processStatusModel: Model<ProcessStatus>,
    @InjectQueue('insert-process-queue')
    private readonly processQueue: Queue,
    private readonly processStateMachine: ProcessStateMachineService,
  ) {}

  @Cron('0 */30 * * * *') // A cada 30 minutos
  async execute() {
    try {
      const threshold = new Date(Date.now() - ORPHAN_THRESHOLD_MS);

      // Busca processStatuses presos em estados intermediários por mais de 2 horas
      const stuckStatuses = await this.processStatusModel.find({
        name: { $in: STUCK_STATUS_NAMES },
        updatedAt: { $lt: threshold },
      });

      if (stuckStatuses.length === 0) return;

      this.logger.warn(
        `[OrphanedProcess] ${stuckStatuses.length} processo(s) orfão(s) detectado(s)`,
      );

      const statusIds = stuckStatuses.map((s) => s._id);
      const orphanedProcesses = await this.processModel.find({
        processStatus: { $in: statusIds },
      });

      let retried = 0;
      let failed = 0;

      for (const proc of orphanedProcesses) {
        try {
          this.logger.warn(
            `[OrphanedProcess] Re-enfileirando processo orfão ${proc.number}`,
          );

          // Atualiza o processStatus para indicar re-processamento
          await this.processStateMachine.transition(
            this.processStatusModel,
            proc.processStatus,
            {
              name: PROCESSSTATUSENUM.PROCESSING_WITH_MOVIMENTS,
              log: 'Reprocessando processo órfão',
            },
          );

          // Re-adiciona à fila com o job 'insert-process'
          await this.processQueue.add('insert-process', {
            processNumber: proc.number,
          });

          retried++;
        } catch (err: unknown) {
          this.logger.error(
            `[OrphanedProcess] Falha ao re-enfileirar ${proc.number}: ${err instanceof Error ? err.message : String(err)}`,
          );
          failed++;
        }
      }

      this.logger.log(
        `[OrphanedProcess] Concluído: ${retried} reenfileirados, ${failed} falhas`,
      );
    } catch (err: unknown) {
      this.logger.error(
        `[OrphanedProcess] Erro no cron: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
