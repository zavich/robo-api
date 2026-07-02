import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron } from '@nestjs/schedule';
import { Model } from 'mongoose';
import { AnaliseStatus } from 'src/utils/enum';
import { PROCESSSTATUSENUM } from '../enums/process-status.enum';
import { ProcessStatus } from '../schema/process-status.schema';
import { Process as ProcessEntity } from '../schema/process.schema';
import { InsertProcessService } from '../queues/process/services/insert-process.service';
import { ProcessStateMachineService } from '../services/process-state-machine.service';
import { NextStepsService } from 'src/service/next-steps/next-steps.service';

// Processos presos em estados intermediários por mais de 2 horas (BUG-010)
const ORPHAN_THRESHOLD_MS = 2 * 60 * 60 * 1000;

// Limite igual ao definido em webhook-erro.handler.ts
const MAX_SCRAPER_RETRIES = 3;

// Estados que envolvem re-disparo ao scraper — sujeitos ao limite de scraperRetryCount
const SCRAPER_STATES = new Set([
  PROCESSSTATUSENUM.PROCESSING_WITH_MOVIMENTS,
  PROCESSSTATUSENUM.PROCESSING_WITH_DOCUMENTS,
  PROCESSSTATUSENUM.WAITING_FOR_LAWSUIT_MAIN,
]);

const STUCK_STATUS_NAMES = [
  PROCESSSTATUSENUM.PROCESSING_WITH_MOVIMENTS,
  PROCESSSTATUSENUM.PROCESSING_WITH_DOCUMENTS,
  PROCESSSTATUSENUM.PROCESS_WAITING_EXTRACTION_DOCUMENTS,
  PROCESSSTATUSENUM.EXTRACTION_MOVIMENTS_FINISHED,
  PROCESSSTATUSENUM.EXTRACTION_DOCUMENTS_FINISHED,
  PROCESSSTATUSENUM.WAITING_FOR_LAWSUIT_MAIN,
];

@Injectable()
export class OrphanedProcessCron {
  private readonly logger = new Logger(OrphanedProcessCron.name);

  constructor(
    @InjectModel(ProcessEntity.name)
    private readonly processModel: Model<ProcessEntity>,
    @InjectModel(ProcessStatus.name)
    private readonly processStatusModel: Model<ProcessStatus>,
    private readonly insertProcessService: InsertProcessService,
    private readonly nextStepsService: NextStepsService,
    private readonly processStateMachine: ProcessStateMachineService,
  ) {}

  // @Cron('0 */30 * * * *') // A cada 30 minutos
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
      const statusNameById = new Map(
        stuckStatuses.map((status) => [String(status._id), status.name]),
      );
      const orphanedProcesses = await this.processModel.find({
        processStatus: { $in: statusIds },
      });

      let retried = 0;
      let errored = 0;
      let failed = 0;

      for (const proc of orphanedProcesses) {
        try {
          const currentStatusName = statusNameById.get(
            String(proc.processStatus),
          );
          if (!currentStatusName) {
            throw new Error(
              `Status atual não encontrado para processo órfão ${proc.number}`,
            );
          }

          // Estados que disparam ao scraper: respeitar limite de scraperRetryCount
          if (SCRAPER_STATES.has(currentStatusName as PROCESSSTATUSENUM)) {
            // $inc atômico com condição $lt: dois corredores concorrentes não
            // ultrapassam MAX_SCRAPER_RETRIES ao mesmo tempo (race TOCTOU)
            const updated = await this.processModel.findOneAndUpdate(
              {
                _id: proc._id,
                $or: [
                  { scraperRetryCount: { $exists: false } },
                  { scraperRetryCount: { $lt: MAX_SCRAPER_RETRIES } },
                ],
              },
              { $inc: { scraperRetryCount: 1 } },
            );
            if (!updated) {
              const retryCount = proc.scraperRetryCount ?? MAX_SCRAPER_RETRIES;
              this.logger.warn(
                `[OrphanedProcess] ${proc.number} atingiu max retries (${retryCount}/${MAX_SCRAPER_RETRIES}) — marcando como erro`,
              );
              await this.processStateMachine.transition(
                this.processStatusModel,
                proc.processStatus,
                {
                  name: PROCESSSTATUSENUM.ERROR,
                  log: '',
                  errorReason: AnaliseStatus.TRT_INACESSIVEL,
                },
              );
              errored++;
              continue;
            }
          }

          this.logger.warn(
            `[OrphanedProcess] Re-enfileirando processo orfão ${proc.number}`,
          );

          // Atualiza o processStatus para indicar re-processamento
          await this.processStateMachine.transition(
            this.processStatusModel,
            proc.processStatus,
            {
              log: 'Reprocessando processo órfão',
            },
          );

          if (
            currentStatusName === PROCESSSTATUSENUM.PROCESSING_WITH_MOVIMENTS
          ) {
            await this.insertProcessService.fetchProcessExtract(
              proc.number,
              proc,
              false,
            );
          } else if (
            currentStatusName === PROCESSSTATUSENUM.PROCESSING_WITH_DOCUMENTS
          ) {
            await this.insertProcessService.fetchProcessExtract(
              proc.number,
              proc,
              true,
            );
          } else if (
            currentStatusName === PROCESSSTATUSENUM.WAITING_FOR_LAWSUIT_MAIN
          ) {
            await this.insertProcessService.fetchProcessExtract(
              proc.number,
              proc,
              false,
            );
          } else if (
            currentStatusName ===
            PROCESSSTATUSENUM.PROCESS_WAITING_EXTRACTION_DOCUMENTS
          ) {
            await this.nextStepsService.execute('step-3', {
              processNumber: proc.number,
            });
          } else if (
            currentStatusName ===
            PROCESSSTATUSENUM.EXTRACTION_MOVIMENTS_FINISHED
          ) {
            await this.nextStepsService.execute('step-4', {
              processNumber: proc.number,
            });
          } else if (
            currentStatusName ===
            PROCESSSTATUSENUM.EXTRACTION_DOCUMENTS_FINISHED
          ) {
            await this.nextStepsService.execute('step-4', {
              processNumber: proc.number,
            });
          }

          retried++;
        } catch (err: unknown) {
          this.logger.error(
            `[OrphanedProcess] Falha ao re-enfileirar ${proc.number}: ${err instanceof Error ? err.message : String(err)}`,
          );
          failed++;
        }
      }

      this.logger.log(
        `[OrphanedProcess] Concluído: ${retried} reenfileirados, ${errored} encerrados com erro, ${failed} falhas`,
      );
    } catch (err: unknown) {
      this.logger.error(
        `[OrphanedProcess] Erro no cron: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
