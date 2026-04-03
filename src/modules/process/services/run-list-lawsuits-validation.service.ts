import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Process as ProcessEntity } from 'src/modules/process/schema/process.schema';
import { NextStepsService } from 'src/service/next-steps/next-steps.service';
import { InsertProcessService } from '../queues/process/services/insert-process.service';
import { ProcessStatus } from '../schema/process-status.schema';
import { Step } from '../schema/step.schema';
import { number } from 'zod';

@Injectable()
export class RunListLawsuitsValidationService {
  private readonly logger = new Logger();

  constructor(
    @InjectModel(ProcessEntity.name)
    private readonly processModule: Model<ProcessEntity>,
    private readonly nextStepsService: NextStepsService,
    private readonly insertProcessService: InsertProcessService,
    @InjectModel(ProcessStatus.name)
    private readonly processStatusService: Model<ProcessStatus>,
    @InjectModel(Step.name)
    private readonly stepService: Model<Step>,
  ) {}
  async execute(lawsuits: string[], documents: boolean = false) {
    const lawsuitAggregate = await this.processModule.aggregate([
      {
        $match: {
          createdAt: {
            $gte: new Date('2025-11-26T00:00:00.000Z'),
            $lte: new Date('2025-11-27T23:59:59.999Z'),
          },
          instancias: { $size: 0 },
          dealId: { $exists: true, $ne: null },
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
      // {
      //   $match: {
      //     'processStatus.name': 'PROCESSING_WITH_DOCUMENTS',
      //     'processStatus.errorReason': '',
      //   },
      // },
      {
        $project: {
          number: 1,
        },
      },
    ]);
    console.log(lawsuitAggregate.length);

    // return;
    await Promise.all(
      lawsuitAggregate.map(async (lawsuit) => {
        const process: any = await this.processModule
          .findOne({ number: lawsuit.number })
          .populate({ path: 'processStatus', populate: ['step'] });
        if (!process) {
          this.logger.warn(`Process ${lawsuit.number} not found`);
          return;
        }
        await this.processModule.findByIdAndUpdate(
          process._id,
          {
            $set: {
              synchronizedAt: new Date(),
            },
          },
          { new: true },
        );
        const findStep = await this.stepService.findOne({
          slug: 'step-1',
        });
        await this.processStatusService.findByIdAndUpdate(
          process.processStatus._id,
          {
            $set: {
              step: findStep._id,
              errorReason: '',
            },
          },
          { new: true },
        );
        return this.insertProcessService.fetchProcessExtract(
          process.number,
          process,
          documents,
        );
      }),
    );
  }
}
