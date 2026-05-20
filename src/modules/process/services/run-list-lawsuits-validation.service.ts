import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, PipelineStage } from 'mongoose';

interface PopulatedProcessStatus {
  _id: string;
  step: { slug: string };
}

type ProcessWithPopulatedStatus = ProcessEntity & {
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
    name?: string,
    log?: string,
    errorReason?: string,
  ) {
    let process: string[] = [];
    if (lawsuits.length === 0) {
      const filters: Record<string, string>[] = [];

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
      const result = await this.processModule.aggregate(pipeline);
      process = result.map((item) => item.number);
    } else {
      process = lawsuits;
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

        const proc = await this.processModule
          .findOne({ number: numberKey })
          .populate({ path: 'processStatus', populate: ['step'] }) as unknown as ProcessWithPopulatedStatus | null;
        if (!proc) {
          this.logger.warn('Process ' + numberKey + ' not found');
          return;
        }
        await this.processModule.findByIdAndUpdate(
          (proc as any)._id,
          {
            $set: {
              synchronizedAt: new Date(),
            },
          },
          { new: true },
        );
        const findStep = await this.stepService.findOne({ slug: 'step-1' });
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
}
