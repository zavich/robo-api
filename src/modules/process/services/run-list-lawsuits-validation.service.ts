import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { HydratedDocument, Model, PipelineStage } from 'mongoose';

interface PopulatedProcessStatus {
  _id: string;
  step: { slug: string };
}

type ProcessWithPopulatedStatus = HydratedDocument<ProcessEntity> & {
  processStatus: PopulatedProcessStatus;
};
import { Process as ProcessEntity } from 'src/modules/process/schema/process.schema';
import { InsertProcessService } from '../queues/process/services/insert-process.service';
import { ProcessStatus } from '../schema/process-status.schema';
import { Step } from '../schema/step.schema';
import { PROCESSSTATUSENUM } from '../enums/process-status.enum';
import { ProcessStateMachineService } from './process-state-machine.service';

@Injectable()
export class RunListLawsuitsValidationService {
  private readonly logger = new Logger();

  constructor(
    @InjectModel(ProcessEntity.name)
    private readonly processModule: Model<ProcessEntity>,
    private readonly insertProcessService: InsertProcessService,
    @InjectModel(ProcessStatus.name)
    private readonly processStatusService: Model<ProcessStatus>,
    @InjectModel(Step.name)
    private readonly stepService: Model<Step>,
    private readonly processStateMachine: ProcessStateMachineService,
  ) {}
  async execute(
    lawsuits: string[],
    documents: boolean = false,
    step: string = 'step-1',
    name?: string,
    log?: string,
    errorReason?: string,
    startDate?: string,
    endDate?: string,
    limit?: number,
  ) {
    let process: string[] = [];
    const normalizedLimit =
      typeof limit === 'number' && Number.isFinite(limit)
        ? Math.max(1, Math.floor(limit))
        : undefined;

    if (lawsuits.length === 0) {
      const filters: Record<string, string>[] = [];
      const createdAtFilter: Record<string, Date> = {};

      if (startDate) {
        createdAtFilter.$gte = this.toBoundaryDate(startDate, true);
      }

      if (endDate) {
        createdAtFilter.$lte = this.toBoundaryDate(endDate, false);
      }

      if (name) {
        filters.push({ 'processStatus.name': name });
      }

      if (errorReason) {
        filters.push({ 'processStatus.errorReason': errorReason });
      }

      if (log) {
        filters.push({ 'processStatus.log': log });
      }

      const pipeline: PipelineStage[] = [
        {
          $lookup: {
            from: 'processstatuses',
            localField: 'processStatus',
            foreignField: '_id',
            as: 'processStatus',
          },
        },
        { $unwind: '$processStatus' },
        // Filtrar apenas processos com campo `documents` presente e que seja um array vazio
        {
          $match: {
            $and: [
              { documents: { $exists: true } },
              ...(Object.keys(createdAtFilter).length > 0
                ? [{ createdAt: createdAtFilter }]
                : []),
              {
                $expr: {
                  $eq: [
                    {
                      $size: {
                        $cond: [{ $isArray: '$documents' }, '$documents', []],
                      },
                    },
                    0,
                  ],
                },
              },
            ],
          },
        },
      ];

      if (filters.length > 0) {
        pipeline.push({
          $match: {
            $and: filters,
          },
        });
      }

      pipeline.push({
        $project: {
          number: 1,
        },
      });

      if (normalizedLimit) {
        pipeline.push({ $limit: normalizedLimit });
      }

      const result = await this.processModule.aggregate(pipeline);
      process = result.map((item) => item.number);
    } else {
      process = normalizedLimit ? lawsuits.slice(0, normalizedLimit) : lawsuits;
    }
    const findStep = await this.stepService.findOne({ slug: step });
    if (!findStep) {
      throw new BadRequestException('Step inválido');
    }

    await Promise.all(
      process.map(async (lawsuit) => {
        const numberKey = (lawsuit ?? '').toString().trim();
        if (!numberKey) {
          this.logger.warn(
            'Invalid process number: ' + JSON.stringify(lawsuit),
          );
          return;
        }

        const procQuery = this.processModule
          .findOne({ number: numberKey })
          .populate({
            path: 'processStatus',
            populate: ['step'],
          });
        const proc =
          (await procQuery) as unknown as ProcessWithPopulatedStatus | null;
        if (!proc) {
          this.logger.warn('Process ' + numberKey + ' not found');
          return;
        }
        await this.processModule.findByIdAndUpdate(
          proc._id,
          {
            $set: {
              synchronizedAt: new Date(),
            },
          },
          { new: true },
        );
        await this.processStateMachine.transition(
          this.processStatusService,
          proc.processStatus._id,
          {
            name: documents
              ? PROCESSSTATUSENUM.PROCESSING_WITH_DOCUMENTS
              : PROCESSSTATUSENUM.PROCESSING_WITH_MOVIMENTS,
            step: findStep._id,
            errorReason: '',
          },
        );
        return this.insertProcessService.fetchProcessExtract(
          proc.number,
          proc,
          documents,
        );
      }),
    );
  }

  private toBoundaryDate(value: string, isStart: boolean): Date {
    const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
    const parsed = new Date(
      isDateOnly
        ? `${value}T${isStart ? '00:00:00.000' : '23:59:59.999'}-03:00`
        : value,
    );

    if (Number.isNaN(parsed.getTime())) {
      throw new Error(
        `Data inválida para ${isStart ? 'startDate' : 'endDate'}: ${value}`,
      );
    }

    return parsed;
  }
}
