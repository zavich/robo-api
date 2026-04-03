import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Model } from 'mongoose';
import { AnaliseStatus } from 'src/utils/enum';
import { InsertProcessService } from '../queues/process/services/insert-process.service';
import { ProcessDecisions } from '../schema/process-decisions.schema';
import { ProcessStatus } from '../schema/process-status.schema';
import { Process as ProcessEntity } from '../schema/process.schema';
import { Step } from '../schema/step.schema';

@Injectable()
export class LossRevalidationCron {
  private readonly logger = new Logger(LossRevalidationCron.name);

  constructor(
    @InjectModel(ProcessEntity.name)
    private readonly processModule: Model<ProcessEntity>,
    @InjectModel(ProcessDecisions.name)
    private readonly processDecisionModel: Model<ProcessDecisions>,
    @InjectModel(ProcessStatus.name)
    private readonly processStatusService: Model<ProcessStatus>,
    @InjectModel(Step.name)
    private readonly stepService: Model<Step>,
    private readonly insertProcessService: InsertProcessService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT) // Executa todas as 00:00
  async execute() {
    try {
      this.logger.log(
        'Iniciando revalidação de processos LOSS com RISCO_TESE ou RISCO_PRAZO',
      );

      // Verifica apenas o STATUS MAIS RECENTE do histórico
      const processes = await this.processModule.aggregate([
        {
          $lookup: {
            from: 'processdecisions',
            localField: '_id',
            foreignField: 'process_id',
            as: 'processDecision',
          },
        },
        {
          $unwind: '$processDecision',
        },
        // Adicionar campo com o último item do histórico
        {
          $addFields: {
            'processDecision.latestHistory': {
              $arrayElemAt: ['$processDecision.history', -1],
            },
          },
        },
        {
          $match: {
            situation: 'LOSS',
            // Verificar se o STATUS MAIS RECENTE é LOSS com os motivos específicos
            'processDecision.latestHistory.status': 'LOSS',
            'processDecision.latestHistory.rejection_reason': {
              $in: [AnaliseStatus.RISCO_TESE, AnaliseStatus.RISCO_PRAZO],
            },
          },
        },
        {
          $lookup: {
            from: 'processstatuses',
            localField: 'processStatus',
            foreignField: '_id',
            as: 'processStatus',
          },
        },
        {
          $unwind: '$processStatus',
        },
      ]);

      this.logger.log(
        `Encontrados ${processes.length} processos para revalidação`,
      );

      if (processes.length === 0) {
        return {
          message: 'Nenhum processo encontrado para revalidação',
          count: 0,
        };
      }

      // Processar cada processo encontrado
      const results = await Promise.all(
        processes.map(async (process) => {
          try {
            // Verificar se há movimentações atualizadas

            await this.processModule.findByIdAndUpdate(
              process._id,
              {
                $set: {
                  synchronizedAt: new Date(),
                },
              },
              { new: true },
            );

            // Buscar step-1
            const findStep = await this.stepService.findOne({
              slug: 'step-1',
            });

            // Atualizar processStatus para revalidação
            await this.processStatusService.findByIdAndUpdate(
              process.processStatus._id,
              {
                $set: {
                  step: findStep._id,
                },
              },
              { new: true },
            );

            await this.insertProcessService.fetchProcessExtract(
              process.number,
              process,
            );

            this.logger.log(
              `Processo ${process.number} enviado para revalidação`,
            );
            return {
              processNumber: process.number,
              status: 'success',
            };
          } catch (error) {
            this.logger.error(
              `Erro ao processar ${process.number}: ${error.message}`,
            );
            return {
              processNumber: process.number,
              status: 'error',
              error: error.message,
            };
          }
        }),
      );

      const successCount = results.filter((r) => r.status === 'success').length;
      const errorCount = results.filter((r) => r.status === 'error').length;

      return {
        message: 'Revalidação de processos concluída',
        total: processes.length,
        success: successCount,
        errors: errorCount,
        results,
      };
    } catch (error) {
      this.logger.error(`Erro na revalidação: ${error.message}`);
      throw error;
    }
  }
}
